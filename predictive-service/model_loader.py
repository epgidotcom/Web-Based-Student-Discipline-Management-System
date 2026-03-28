from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

import joblib
import numpy as np


FEATURE_ORDER = [
    "offense_id",
    "description",
    "sanction",
    "evidence",
    "status",
    "active",
    "incident_year",
    "incident_month",
    "incident_day",
    "incident_dayofweek",
]


@dataclass
class LoadedResources:
    models: List[Any]
    encoders: Dict[str, Any]
    weights: np.ndarray
    model_version: str
    feature_order: List[str]


def _require_path(env_name: str) -> Path:
    value = os.getenv(env_name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {env_name}")
    path = Path(value).expanduser().resolve()
    if not path.exists():
        raise RuntimeError(f"Configured path does not exist for {env_name}: {path}")
    return path


def _optional_path(env_name: str, default_filename: str | None = None) -> Path | None:
    value = os.getenv(env_name, "").strip()
    if value:
        path = Path(value).expanduser().resolve()
        if not path.exists():
            raise RuntimeError(f"Configured path does not exist for {env_name}: {path}")
        return path

    if default_filename:
        default_path = Path(__file__).resolve().parent / default_filename
        if default_path.exists():
            return default_path

    return None


def _load_json_encoder(path: Path) -> Dict[str, int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"Encoder file must be a JSON object: {path}")

    out: Dict[str, int] = {}
    for key, value in data.items():
        out[str(key)] = int(value)
    return out


def _load_json_encoder_set() -> Dict[str, Dict[str, int]]:
    encoder_paths = {
        "description": _require_path("ENCODER_DESCRIPTION_PATH"),
        "sanction": _require_path("ENCODER_SANCTION_PATH"),
        "evidence": _require_path("ENCODER_EVIDENCE_PATH"),
        "status": _require_path("ENCODER_STATUS_PATH"),
    }
    return {name: _load_json_encoder(path) for name, path in encoder_paths.items()}


def _load_label_encoder_bundle() -> Dict[str, Any]:
    path = _optional_path("LABEL_ENCODERS_PATH", "label_encoders.pkl")
    if path is None:
        raise RuntimeError(
            "Missing encoder artifacts. Provide ENCODER_*_PATH JSON files "
            "or LABEL_ENCODERS_PATH/label_encoders.pkl"
        )

    bundle = joblib.load(path)
    if not isinstance(bundle, dict):
        raise RuntimeError(f"label_encoders.pkl must contain a dict, got: {type(bundle)!r}")

    required = {"description", "sanction", "evidence", "status"}
    missing = sorted(required.difference(bundle.keys()))
    if missing:
        raise RuntimeError(f"label_encoders.pkl missing keys: {', '.join(missing)}")

    return {
        "description": bundle["description"],
        "sanction": bundle["sanction"],
        "evidence": bundle["evidence"],
        "status": bundle["status"],
    }


def _load_encoders() -> Dict[str, Any]:
    has_json_encoder_env = any(
        os.getenv(name, "").strip()
        for name in (
            "ENCODER_DESCRIPTION_PATH",
            "ENCODER_SANCTION_PATH",
            "ENCODER_EVIDENCE_PATH",
            "ENCODER_STATUS_PATH",
        )
    )

    if has_json_encoder_env:
        return _load_json_encoder_set()

    return _load_label_encoder_bundle()


def _load_weights(model_count: int) -> np.ndarray:
    raw = os.getenv("MODEL_WEIGHTS", "").strip()
    if not raw:
        return np.full(shape=(model_count,), fill_value=1.0 / model_count, dtype=np.float64)

    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if len(parts) != model_count:
        raise RuntimeError(
            f"MODEL_WEIGHTS must contain {model_count} values, got {len(parts)}"
        )

    weights = np.asarray([float(v) for v in parts], dtype=np.float64)
    if np.any(weights < 0):
        raise RuntimeError("MODEL_WEIGHTS values must be non-negative")
    if float(np.sum(weights)) == 0:
        raise RuntimeError("MODEL_WEIGHTS sum must be > 0")
    return weights / np.sum(weights)


def _load_models() -> List[Any]:
    # Supports either 3-model ensemble via MODEL_1/2/3_PATH or single model via
    # MODEL_PATH (or default local gradient_boosting_model.pkl).
    ensemble_paths = []
    for key in ("MODEL_1_PATH", "MODEL_2_PATH", "MODEL_3_PATH"):
        value = os.getenv(key, "").strip()
        if value:
            path = Path(value).expanduser().resolve()
            if not path.exists():
                raise RuntimeError(f"Configured path does not exist for {key}: {path}")
            ensemble_paths.append(path)

    if ensemble_paths:
        return [joblib.load(path) for path in ensemble_paths]

    single_path = _optional_path("MODEL_PATH", "gradient_boosting_model.pkl")
    if single_path is None:
        raise RuntimeError(
            "Missing model artifacts. Provide MODEL_PATH (single model) or "
            "MODEL_1_PATH/2_PATH/3_PATH (ensemble)."
        )
    return [joblib.load(single_path)]


def _load_feature_order() -> List[str]:
    path = _optional_path("FEATURE_COLUMNS_PATH", "feature_columns.pkl")
    if path is None:
        return FEATURE_ORDER

    columns = joblib.load(path)
    if not isinstance(columns, (list, tuple)):
        raise RuntimeError(f"feature_columns.pkl must contain a list/tuple, got: {type(columns)!r}")

    order = [str(value) for value in columns]
    if set(order) != set(FEATURE_ORDER):
        missing = sorted(set(FEATURE_ORDER).difference(order))
        extra = sorted(set(order).difference(FEATURE_ORDER))
        raise RuntimeError(
            "feature_columns.pkl does not match required features. "
            f"Missing={missing}, Extra={extra}"
        )

    return order


def load_resources() -> LoadedResources:
    models = _load_models()
    encoders = _load_encoders()
    feature_order = _load_feature_order()

    first_model = models[0]
    expected_n_features = int(getattr(first_model, "n_features_in_", len(feature_order)))
    if expected_n_features != len(feature_order):
        raise RuntimeError(
            "Feature count mismatch between model and feature order: "
            f"model expects {expected_n_features}, order has {len(feature_order)}"
        )

    weights = _load_weights(len(models))
    model_version = os.getenv("MODEL_VERSION", "gbm-ensemble-v1").strip() or "gbm-ensemble-v1"

    return LoadedResources(
        models=models,
        encoders=encoders,
        weights=weights,
        model_version=model_version,
        feature_order=feature_order,
    )


def encode_token(mapping: Any, raw_value: object) -> int:
    # JSON mapping path
    if isinstance(mapping, dict):
        key = str(raw_value)
        if key in mapping:
            return int(mapping[key])
        if "__default__" in mapping:
            return int(mapping["__default__"])
        return 0

    # sklearn LabelEncoder path
    if hasattr(mapping, "transform"):
        token = "None" if raw_value is None else str(raw_value)
        try:
            encoded = mapping.transform([token])
            return int(encoded[0])
        except Exception:
            return 0

    key = str(raw_value)
    return 0


def build_feature_row(
    payload: dict,
    encoders: Dict[str, Any],
    feature_order: List[str] | None = None,
) -> np.ndarray:
    # All features are int64 according to model contract.
    ordered_features = feature_order or FEATURE_ORDER

    value_by_feature = {
        "offense_id": int(payload["offense_id"]),
        "description": encode_token(encoders["description"], payload["description"]),
        "sanction": encode_token(encoders["sanction"], payload["sanction"]),
        "evidence": encode_token(encoders["evidence"], payload["evidence"]),
        "status": encode_token(encoders["status"], payload["status"]),
        "active": int(payload["active"]),
        "incident_year": int(payload["incident_year"]),
        "incident_month": int(payload["incident_month"]),
        "incident_day": int(payload["incident_day"]),
        "incident_dayofweek": int(payload["incident_dayofweek"]),
    }

    row = [int(value_by_feature[name]) for name in ordered_features]
    return np.asarray([row], dtype=np.int64)


def predict_ensemble_details(resources: LoadedResources, feature_row: np.ndarray) -> tuple[float, List[float]]:
    probabilities: List[float] = []

    for model in resources.models:
        if not hasattr(model, "predict_proba"):
            raise RuntimeError("Loaded model does not support predict_proba")

        proba = model.predict_proba(feature_row)
        if proba.ndim != 2 or proba.shape[1] < 2:
            raise RuntimeError("Model predict_proba output is invalid")

        probabilities.append(float(proba[0, 1]))

    weighted = np.dot(np.asarray(probabilities, dtype=np.float64), resources.weights)
    return float(np.clip(weighted, 0.0, 1.0)), probabilities


def predict_ensemble_probability(resources: LoadedResources, feature_row: np.ndarray) -> float:
    weighted, _ = predict_ensemble_details(resources, feature_row)
    return weighted
