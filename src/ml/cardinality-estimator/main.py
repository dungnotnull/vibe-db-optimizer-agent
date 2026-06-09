"""Cardinality Estimator — FastAPI microservice.

Predicts actual row counts from planner estimates and table statistics
using XGBoost/LightGBM regression. Falls back to ratio-based estimation
when model is unavailable.

Reference: Learned Cardinality Estimation (Wang et al., SIGMOD 2021)
"""

import os
import logging
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="vibe-db-cardinality-estimator", version="0.1.0")

MODEL_DIR = Path(os.environ.get("CARDINALITY_MODEL_DIR", "./data/models"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)

_model = None
_fitted = False


def _load_model():
    global _model, _fitted
    if _fitted:
        return _model

    try:
        import xgboost as xgb
        model_path = MODEL_DIR / "cardinality_model.json"
        if model_path.exists():
            _model = xgb.XGBRegressor()
            _model.load_model(str(model_path))
            _fitted = True
            logger.info("Loaded cardinality model from disk")
            return _model
    except ImportError:
        logger.warning("XGBoost not installed, using heuristic fallback")
    except Exception as e:
        logger.warning(f"Model load failed: {e}")

    return None


class TableStats(BaseModel):
    table_name: str = Field(..., min_length=1)
    estimated_rows: float = Field(..., ge=0)
    table_size_bytes: int = Field(default=0, ge=0)
    n_distinct: float = Field(default=0, ge=0)
    null_frac: float = Field(default=0, ge=0, le=1)
    most_common_vals: list[float] = Field(default_factory=list)
    histogram_bounds: list[float] = Field(default_factory=list)


class CardinalityRequest(BaseModel):
    table_stats: TableStats
    predicates: list[str] = Field(default_factory=list)
    join_predicate_count: int = Field(default=0, ge=0)


class CardinalityResponse(BaseModel):
    predicted_rows: float
    planner_estimate: float
    confidence: float
    flag_as_bad_plan: bool
    recommendation: str


class TrainRequest(BaseModel):
    samples: list[dict]
    force_retrain: bool = Field(default=False)


class TrainResponse(BaseModel):
    success: bool
    samples_used: int
    message: str


@app.post("/estimate", response_model=CardinalityResponse)
def estimate(request: CardinalityRequest) -> CardinalityResponse:
    model = _load_model()

    if model is not None:
        return _predict_with_model(request, model)

    return _predict_heuristic(request)


def _predict_with_model(request: CardinalityRequest, model) -> CardinalityResponse:
    try:
        stats = request.table_stats
        features = np.array(
            [
                [
                    stats.estimated_rows,
                    stats.table_size_bytes / max(stats.estimated_rows, 1),
                    stats.n_distinct / max(stats.estimated_rows, 1),
                    stats.null_frac,
                    len(stats.most_common_vals),
                    len(request.predicates),
                    request.join_predicate_count,
                    stats.estimated_rows * 0.85,
                ]
            ]
        )
        features = np.nan_to_num(features, nan=0.0, posinf=0.0, neginf=0.0)

        predicted = float(model.predict(features)[0])
        predicted = max(predicted, 1)

        ratio = predicted / max(stats.estimated_rows, 1)
        flag = ratio > 10 or ratio < 0.1

        if ratio > 100:
            rec = "Extreme underestimation. Add CREATE STATISTICS on correlated columns and rerun ANALYZE."
        elif ratio > 10:
            rec = "Significant underestimation. Consider extended statistics or query rewrite."
        elif ratio < 0.1:
            rec = "Significant overestimation. Statistics may be stale — run ANALYZE."
        else:
            rec = "Estimate is within acceptable range."

        return CardinalityResponse(
            predicted_rows=predicted,
            planner_estimate=stats.estimated_rows,
            confidence=0.82,
            flag_as_bad_plan=flag,
            recommendation=rec,
        )
    except Exception as e:
        logger.error(f"Model prediction failed: {e}")
        return _predict_heuristic(request)


def _predict_heuristic(request: CardinalityRequest) -> CardinalityResponse:
    stats = request.table_stats
    estimated = stats.estimated_rows

    selectivity = 1.0
    if stats.n_distinct > 0 and stats.estimated_rows > 0:
        selectivity = min(selectivity, 1.0 / max(stats.n_distinct, 1))

    if len(request.predicates) > 1:
        selectivity *= 0.5 ** (len(request.predicates) - 1)

    if request.join_predicate_count > 0:
        selectivity *= 0.8 ** request.join_predicate_count

    predicted = estimated * selectivity
    predicted = max(predicted, 1)

    ratio = abs(predicted - estimated) / max(estimated, 1)
    flag = ratio > 0.9

    if flag and ratio > 0.95:
        rec = "High discrepancy detected. CREATE STATISTICS and run ANALYZE on this table."
    elif flag:
        rec = "Moderate discrepancy. Consider running ANALYZE on this table."
    else:
        rec = "Cardinality estimate appears reasonable."

    return CardinalityResponse(
        predicted_rows=round(predicted, 2),
        planner_estimate=estimated,
        confidence=round(0.5 + 0.3 * (1 - min(ratio, 1)), 4),
        flag_as_bad_plan=flag,
        recommendation=rec,
    )


@app.post("/train", response_model=TrainResponse)
def train(request: TrainRequest) -> TrainResponse:
    try:
        import xgboost as xgb

        X_rows = []
        Y_rows = []
        for s in request.samples:
            stats = s.get("stats", {})
            features = [
                stats.get("estimated_rows", 0),
                stats.get("table_size", 0) / max(stats.get("estimated_rows", 1), 1),
                stats.get("n_distinct", 0) / max(stats.get("estimated_rows", 1), 1),
                stats.get("null_frac", 0),
                len(stats.get("most_common_vals", [])),
                len(s.get("predicates", [])),
                s.get("join_predicate_count", 0),
                stats.get("estimated_rows", 0) * 0.85,
            ]
            X_rows.append(features)
            Y_rows.append(s.get("actual_rows", stats.get("estimated_rows", 0)))

        if len(X_rows) < 20:
            return TrainResponse(success=False, samples_used=len(X_rows), message=f"Need >= 20 samples, got {len(X_rows)}")

        X = np.array(X_rows)
        Y = np.array(Y_rows)

        global _model, _fitted
        _model = xgb.XGBRegressor(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            objective="reg:squarederror",
            random_state=42,
        )
        _model.fit(X, Y)
        _fitted = True

        _model.save_model(str(MODEL_DIR / "cardinality_model.json"))
        logger.info(f"Trained cardinality estimator on {len(X_rows)} samples")

        return TrainResponse(success=True, samples_used=len(X_rows), message="Model trained and saved")
    except ImportError:
        return TrainResponse(success=False, samples_used=0, message="Install xgboost: pip install xgboost")
    except Exception as e:
        logger.error(f"Training failed: {e}")
        return TrainResponse(success=False, samples_used=0, message=str(e))


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model": "xgboost" if _fitted else "heuristic",
        "fitted": _fitted,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
