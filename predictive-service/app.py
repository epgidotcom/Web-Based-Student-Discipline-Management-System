from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from model_loader import (
    build_feature_row,
    load_resources,
    predict_ensemble_details,
)


class InferRequest(BaseModel):
    offense_id: int
    description: str
    sanction: str
    evidence: str
    status: str
    active: int = Field(ge=0, le=1)
    incident_year: int
    incident_month: int = Field(ge=1, le=12)
    incident_day: int = Field(ge=1, le=31)
    incident_dayofweek: int = Field(ge=0, le=6)


app = FastAPI(title="SDMS Predictive Inference Service", version="1.0.0")


try:
    RESOURCES = load_resources()
    STARTUP_ERROR = None
except Exception as exc:  # pragma: no cover - startup diagnostics
    RESOURCES = None
    STARTUP_ERROR = str(exc)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/ready")
def ready() -> dict:
    if STARTUP_ERROR is not None or RESOURCES is None:
        raise HTTPException(status_code=503, detail={"ready": False, "error": STARTUP_ERROR})

    return {
        "ready": True,
        "model_count": len(RESOURCES.models),
        "model_version": RESOURCES.model_version,
    }


@app.post("/infer")
def infer(request: InferRequest) -> dict:
    if STARTUP_ERROR is not None or RESOURCES is None:
        raise HTTPException(status_code=503, detail={"error": STARTUP_ERROR or "service not ready"})

    try:
        payload = request.model_dump()
        row = build_feature_row(payload, RESOURCES.encoders, RESOURCES.feature_order)
        probability, model_probabilities = predict_ensemble_details(RESOURCES, row)
    except Exception as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc

    return {
        "repeat_probability": probability,
        "model_probabilities": model_probabilities,
        "model_weights": [float(weight) for weight in RESOURCES.weights.tolist()],
        "model_version": RESOURCES.model_version,
    }
