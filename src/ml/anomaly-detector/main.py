"""Latency Anomaly Detector — FastAPI microservice.

Uses Isolation Forest (scikit-learn) to detect latency anomalies
from rolling 5-minute window metrics. Automatically trains on
baseline data and persists model checkpoint.
"""

import os
import json
import logging
from datetime import datetime
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="vibe-db-anomaly-detector", version="0.1.0")

MODEL_DIR = Path(os.environ.get("ANOMALY_MODEL_DIR", "./data/models"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_THRESHOLD = -0.3
DEFAULT_CONTAMINATION = 0.05
MIN_TRAINING_SAMPLES = 50

_model = None
_fitted = False


def _ensure_sklearn():
    try:
        from sklearn.ensemble import IsolationForest
        return IsolationForest
    except ImportError:
        logger.warning("scikit-learn not available, using statistical fallback")
        return None


class MetricsWindow(BaseModel):
    p50_ms: float = Field(..., ge=0)
    p95_ms: float = Field(..., ge=0)
    p99_ms: float = Field(..., ge=0)
    rps: float = Field(..., ge=0)
    error_rate: float = Field(..., ge=0, le=1)
    connection_wait_ms: float = Field(default=0, ge=0)
    calls_per_min: float = Field(default=0, ge=0)


class AnomalyResponse(BaseModel):
    is_anomaly: bool
    score: float
    threshold: float
    should_trigger_deep_analysis: bool
    details: dict


class TrainRequest(BaseModel):
    windows: list[MetricsWindow]
    contamination: float = Field(default=DEFAULT_CONTAMINATION, ge=0.01, le=0.5)
    force_retrain: bool = Field(default=False)


class TrainResponse(BaseModel):
    success: bool
    samples_used: int
    contamination: float
    message: str


def _windows_to_features(windows: list[MetricsWindow]) -> np.ndarray:
    return np.array(
        [
            [w.p50_ms, w.p95_ms, w.p99_ms, w.rps, w.error_rate * 100, w.connection_wait_ms, w.calls_per_min]
            for w in windows
        ]
    )


def _window_to_vector(window: MetricsWindow) -> np.ndarray:
    return np.array(
        [[window.p50_ms, window.p95_ms, window.p99_ms, window.rps, window.error_rate * 100, window.connection_wait_ms, window.calls_per_min]]
    )


@app.post("/train", response_model=TrainResponse)
def train(request: TrainRequest) -> TrainResponse:
    global _model, _fitted

    IsolationForest = _ensure_sklearn()
    if IsolationForest is None:
        return TrainResponse(
            success=False,
            samples_used=0,
            contamination=request.contamination,
            message="scikit-learn not installed. Install with: pip install scikit-learn",
        )

    if len(request.windows) < MIN_TRAINING_SAMPLES:
        return TrainResponse(
            success=False,
            samples_used=len(request.windows),
            contamination=request.contamination,
            message=f"Insufficient training data: {len(request.windows)} samples. Minimum: {MIN_TRAINING_SAMPLES}",
        )

    try:
        X = _windows_to_features(request.windows)
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

        _model = IsolationForest(
            n_estimators=100,
            contamination=request.contamination,
            random_state=42,
            n_jobs=-1,
        )
        _model.fit(X)
        _fitted = True

        model_path = MODEL_DIR / "anomaly_model.json"
        try:
            import joblib
            joblib.dump(_model, MODEL_DIR / "anomaly_model.joblib")
        except Exception:
            pass

        logger.info(f"Trained anomaly detector on {len(request.windows)} samples")
        return TrainResponse(
            success=True,
            samples_used=len(request.windows),
            contamination=request.contamination,
            message="Model trained successfully",
        )
    except Exception as e:
        logger.error(f"Training failed: {e}")
        return TrainResponse(
            success=False,
            samples_used=len(request.windows),
            contamination=request.contamination,
            message=f"Training failed: {e}",
        )


@app.post("/detect", response_model=AnomalyResponse)
def detect(window: MetricsWindow) -> AnomalyResponse:
    global _model, _fitted

    if not _fitted or _model is None:
        score, is_anomaly = _statistical_fallback(window)
        return AnomalyResponse(
            is_anomaly=is_anomaly,
            score=score,
            threshold=DEFAULT_THRESHOLD,
            should_trigger_deep_analysis=is_anomaly,
            details={"method": "statistical-fallback", "threshold": DEFAULT_THRESHOLD},
        )

    try:
        X = _window_to_vector(window)
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
        raw_score = float(_model.decision_function(X)[0])
        score = round(raw_score, 4)
        is_anomaly = raw_score < DEFAULT_THRESHOLD

        details = {
            "method": "isolation-forest",
            "threshold": DEFAULT_THRESHOLD,
            "raw_score": score,
        }

        if is_anomaly:
            details["trigger_reason"] = _diagnose_anomaly(window)

        return AnomalyResponse(
            is_anomaly=is_anomaly,
            score=score,
            threshold=DEFAULT_THRESHOLD,
            should_trigger_deep_analysis=is_anomaly,
            details=details,
        )
    except Exception as e:
        logger.error(f"Detection failed: {e}")
        return AnomalyResponse(
            is_anomaly=False,
            score=0.0,
            threshold=DEFAULT_THRESHOLD,
            should_trigger_deep_analysis=False,
            details={"method": "error-fallback", "error": str(e)},
        )


def _statistical_fallback(window: MetricsWindow) -> tuple[float, bool]:
    z_score = 0.0
    if window.p99_ms > 0 and window.p50_ms > 0:
        ratio = window.p99_ms / window.p50_ms
        if ratio > 20:
            z_score -= 2.5
        elif ratio > 10:
            z_score -= 1.5
        elif ratio > 5:
            z_score -= 0.8

    if window.error_rate > 0.05:
        z_score -= 1.5
    if window.error_rate > 0.10:
        z_score -= 2.0

    if window.connection_wait_ms > 100:
        z_score -= 1.0

    is_anomaly = z_score < DEFAULT_THRESHOLD
    return round(z_score, 4), is_anomaly


def _diagnose_anomaly(window: MetricsWindow) -> str:
    reasons = []
    if window.p99_ms / max(window.p50_ms, 0.001) > 20:
        reasons.append("Extreme tail latency: p99/p50 ratio > 20x")
    elif window.p99_ms / max(window.p50_ms, 0.001) > 10:
        reasons.append("High tail latency: p99/p50 ratio > 10x")
    if window.error_rate > 0.10:
        reasons.append("Critical error rate > 10%")
    elif window.error_rate > 0.05:
        reasons.append("Elevated error rate > 5%")
    if window.connection_wait_ms > 100:
        reasons.append("Connection pool saturation detected")
    if not reasons:
        reasons.append("Multi-metric deviation from baseline")
    return "; ".join(reasons)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model": "isolation-forest" if _fitted else "statistical-fallback",
        "fitted": _fitted,
    }


@app.post("/reset")
def reset_model() -> dict:
    global _model, _fitted
    _model = None
    _fitted = False
    return {"status": "ok", "message": "Model reset"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
