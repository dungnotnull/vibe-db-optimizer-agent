"""Query Pattern Classifier — FastAPI microservice.

Classifies SQL queries into 8 patterns + confidence score.
Uses HuggingFace transformers (CodeBERT) when available,
falls back to regex-based classifier automatically.
"""

import os
import re
import logging
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="vibe-db-query-classifier", version="0.1.0")

CLASSES = [
    "OLTP_READ_POINT",
    "OLTP_READ_RANGE",
    "OLTP_WRITE",
    "ANALYTICAL_SCAN",
    "TIME_SERIES",
    "FULL_TEXT_SEARCH",
    "JOIN_HEAVY",
    "SUBQUERY_COMPLEX",
]

CLASSIFICATION_RULES: list[tuple[str, str, float]] = [
    (r"^\s*INSERT\s+INTO", "OLTP_WRITE", 0.95),
    (r"^\s*UPDATE\s+", "OLTP_WRITE", 0.95),
    (r"^\s*DELETE\s+FROM", "OLTP_WRITE", 0.95),
    (r"LIKE\s+'.*%.*%'", "FULL_TEXT_SEARCH", 0.85),
    (r"\btsvector\b|\bto_tsquery\b|\bto_tsvector\b|\bts_rank\b|@@", "FULL_TEXT_SEARCH", 0.92),
    (r"\bGROUP\s+BY\b.*\bCOUNT\s*\(|\bGROUP\s+BY\b.*\bSUM\s*\(|\bGROUP\s+BY\b.*\bAVG\s*\(|\bGROUP\s+BY\b.*\bMAX\s*\(|\bGROUP\s+BY\b.*\bMIN\s*\(", "ANALYTICAL_SCAN", 0.80),
    (r"\bCOUNT\s*\(\s*\*\s*\)|\bCOUNT\s*\(\s*DISTINCT|\bHAVING\b", "ANALYTICAL_SCAN", 0.75),
    (r"\bJOIN\b.*\bJOIN\b.*\bJOIN\b", "JOIN_HEAVY", 0.88),
    (
        r"\bJOIN\b.*\bJOIN\b",
        "JOIN_HEAVY",
        0.78,
    ),
    (r"\bWITH\b\s+\w+\s+AS\s*\(.*\bSELECT\b", "SUBQUERY_COMPLEX", 0.85),
    (r"\(\s*SELECT\b", "SUBQUERY_COMPLEX", 0.82),
    (
        r"\b(created_at|updated_at|timestamp|event_time|created_date)\b.*\bBETWEEN\b",
        "TIME_SERIES",
        0.90,
    ),
    (
        r"\bWHERE\b.*\b(created_at|updated_at|timestamp|event_time)\b",
        "TIME_SERIES",
        0.82,
    ),
    (
        r"\bORDER\s+BY\b.*\bLIMIT\b",
        "OLTP_READ_RANGE",
        0.85,
    ),
    (
        r"\bWHERE\b.*\b(?:id|uuid|pk)\s*=\s*",
        "OLTP_READ_POINT",
        0.90,
    ),
    (
        r"\bSELECT\b.*\bWHERE\b.*\blimit\s+1\b",
        "OLTP_READ_POINT",
        0.88,
    ),
    (
        r"\bINSERT\b.*\bON\s+CONFLICT\b",
        "OLTP_WRITE",
        0.90,
    ),
    (
        r"\bUPSERT\b|\bMERGE\b|\bON\s+DUPLICATE\s+KEY\b",
        "OLTP_WRITE",
        0.90,
    ),
]

DEFAULT_CLASS = "OLTP_READ_RANGE"

_model = None
_model_name = "microsoft/codebert-base"

def load_model():
    """Attempt to load CodeBERT for query classification."""
    global _model
    if _model is not None:
        return _model
    try:
        from transformers import pipeline
        logger.info(f"Loading model: {_model_name}")
        _model = pipeline(
            "text-classification",
            model=_model_name,
            tokenizer=_model_name,
            top_k=3,
        )
        logger.info("Model loaded successfully")
    except Exception as e:
        logger.warning(f"Failed to load model: {e}. Using regex fallback.")
        _model = False
    return _model


class ClassifyRequest(BaseModel):
    sql: str = Field(..., description="Raw SQL query to classify", min_length=1, max_length=10000)


class ClassifyResponse(BaseModel):
    label: str
    score: float
    model: str
    top_labels: list[dict]


@app.post("/classify", response_model=ClassifyResponse)
def classify(request: ClassifyRequest) -> ClassifyResponse:
    sql = request.sql.strip()

    ml_result = predict_with_model(sql)
    if ml_result is not None:
        return ml_result

    return classify_with_rules(sql)


def predict_with_model(sql: str) -> ClassifyResponse | None:
    model = load_model()
    if model is None or model is False:
        return None

    try:
        input_sql = sql[:500]
        results = model(input_sql)
        if isinstance(results, list) and len(results) > 0:
            top_result = results[0]
            if isinstance(top_result, list):
                top_labels = [
                    {"label": r["label"], "score": round(r["score"], 4)}
                    for r in top_result
                ]
                best = top_result[0]
                return ClassifyResponse(
                    label=best["label"],
                    score=round(best["score"], 4),
                    model=_model_name,
                    top_labels=top_labels,
                )
            elif isinstance(top_result, dict):
                return ClassifyResponse(
                    label=top_result["label"],
                    score=round(top_result["score"], 4),
                    model=_model_name,
                    top_labels=[{"label": top_result["label"], "score": round(top_result["score"], 4)}],
                )
    except Exception as e:
        logger.error(f"Model inference error: {e}")

    return None


def classify_with_rules(sql: str) -> ClassifyResponse:
    for pattern, label, score in CLASSIFICATION_RULES:
        if re.search(pattern, sql, re.IGNORECASE):
            return ClassifyResponse(
                label=label,
                score=score,
                model="rule-based",
                top_labels=[
                    {"label": label, "score": score},
                    {"label": DEFAULT_CLASS, "score": 0.4},
                ],
            )

    return ClassifyResponse(
        label=DEFAULT_CLASS,
        score=0.45,
        model="rule-based",
        top_labels=[{"label": DEFAULT_CLASS, "score": 0.45}],
    )


@app.get("/health")
def health() -> dict:
    model = load_model()
    return {
        "status": "ok",
        "model": _model_name if model and model is not False else "rule-based",
        "class_count": len(CLASSES),
    }


@app.get("/classes")
def get_classes() -> dict:
    return {"classes": CLASSES}


if __name__ == "__main__":
    import uvicorn
    load_model()
    uvicorn.run(app, host="0.0.0.0", port=8001)
