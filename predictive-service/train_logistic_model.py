from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Sequence

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

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

CATEGORICAL_FEATURES = ["description", "sanction", "evidence", "status"]


@dataclass
class TrainingOutputs:
    model_path: Path
    encoders_path: Path
    features_path: Path
    report_path: Path


def _require_columns(columns: Sequence[str], target_column: str) -> None:
    required = set(FEATURE_ORDER + [target_column])
    missing = sorted(required.difference(columns))
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")


def _read_rows(input_csv: Path) -> tuple[List[str], List[dict]]:
    with input_csv.open("r", newline="", encoding="utf-8") as file_obj:
        reader = csv.DictReader(file_obj)
        if not reader.fieldnames:
            raise ValueError("Input CSV has no header row")
        rows = list(reader)
    return list(reader.fieldnames), rows


def _encode_categorical(rows: List[dict]) -> Dict[str, LabelEncoder]:
    encoders: Dict[str, LabelEncoder] = {}
    for feature in CATEGORICAL_FEATURES:
        encoder = LabelEncoder()
        values = [(row.get(feature) or "None") for row in rows]
        values = [str(value) for value in values]
        encoder.fit(values)
        encoded_values = encoder.transform(values)
        for idx, encoded in enumerate(encoded_values):
            rows[idx][feature] = int(encoded)
        encoders[feature] = encoder
    return encoders


def _coerce_numeric(rows: List[dict]) -> None:
    numeric_features = [f for f in FEATURE_ORDER if f not in CATEGORICAL_FEATURES]
    for row in rows:
        for feature in numeric_features:
            raw = row.get(feature)
            if raw in (None, ""):
                row[feature] = 0
                continue
            try:
                row[feature] = int(float(raw))
            except Exception:
                row[feature] = 0


def _build_matrix(rows: List[dict], target_column: str) -> tuple[np.ndarray, np.ndarray]:
    x_rows: List[List[int]] = []
    y_values: List[int] = []

    for row in rows:
        feature_row = []
        for feature in FEATURE_ORDER:
            value = row.get(feature, 0)
            feature_row.append(int(value))
        x_rows.append(feature_row)

        target_raw = row.get(target_column)
        if target_raw in (None, ""):
            y_values.append(0)
            continue
        try:
            y_values.append(int(float(target_raw)))
        except Exception:
            y_values.append(0)

    x = np.asarray(x_rows, dtype=np.int64)
    y = np.asarray(y_values, dtype=np.int64)
    y = np.clip(y, 0, 1)
    return x, y


def _build_report(y_true: np.ndarray, y_pred: np.ndarray, y_prob: np.ndarray) -> dict:
    report = classification_report(y_true, y_pred, output_dict=True, zero_division=0)
    try:
        roc_auc = float(roc_auc_score(y_true, y_prob))
    except ValueError:
        roc_auc = None

    return {
        "classification_report": report,
        "roc_auc": roc_auc,
    }


def train_and_export(
    input_csv: Path,
    target_column: str,
    output_dir: Path,
    model_name: str,
    test_size: float,
    random_state: int,
) -> TrainingOutputs:
    columns, rows = _read_rows(input_csv)
    _require_columns(columns, target_column)
    if not rows:
        raise ValueError("Input CSV has no data rows")

    work_rows = [{k: v for k, v in row.items()} for row in rows]
    encoders = _encode_categorical(work_rows)
    _coerce_numeric(work_rows)
    x, y = _build_matrix(work_rows, target_column)

    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=test_size,
        random_state=random_state,
        stratify=y if y.nunique() > 1 else None,
    )

    model = LogisticRegression(
        max_iter=1000,
        solver="liblinear",
        class_weight="balanced",
        random_state=random_state,
    )
    model.fit(x_train, y_train)

    y_pred = model.predict(x_test)
    y_prob = model.predict_proba(x_test)[:, 1]
    metrics = _build_report(y_test, y_pred, y_prob)

    output_dir.mkdir(parents=True, exist_ok=True)

    model_path = output_dir / f"{model_name}.pkl"
    encoders_path = output_dir / f"{model_name}_label_encoders.pkl"
    features_path = output_dir / f"{model_name}_feature_columns.pkl"
    report_path = output_dir / f"{model_name}_training_report.json"

    joblib.dump(model, model_path)
    joblib.dump(encoders, encoders_path)
    joblib.dump(FEATURE_ORDER, features_path)

    report_payload = {
        "model_name": model_name,
        "model_type": "LogisticRegression",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "input_csv": str(input_csv),
        "target_column": target_column,
        "feature_order": FEATURE_ORDER,
        "train_rows": int(len(x_train)),
        "test_rows": int(len(x_test)),
        "metrics": metrics,
    }
    report_path.write_text(json.dumps(report_payload, indent=2), encoding="utf-8")

    return TrainingOutputs(
        model_path=model_path,
        encoders_path=encoders_path,
        features_path=features_path,
        report_path=report_path,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train and export a production-ready logistic regression model for SDMS predictive service."
    )
    parser.add_argument("--input-csv", required=True, help="CSV path containing training data.")
    parser.add_argument(
        "--target-column",
        default="repeat_violation_target",
        help="Binary target column name (0/1).",
    )
    parser.add_argument(
        "--output-dir",
        default="artifacts/logistic_v1",
        help="Output directory for model artifacts.",
    )
    parser.add_argument(
        "--model-name",
        default="logistic_repeat_model",
        help="Base model name used in exported filenames.",
    )
    parser.add_argument("--test-size", type=float, default=0.2, help="Test split ratio.")
    parser.add_argument("--random-state", type=int, default=42, help="Random seed.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    outputs = train_and_export(
        input_csv=Path(args.input_csv).expanduser().resolve(),
        target_column=str(args.target_column),
        output_dir=Path(args.output_dir).expanduser().resolve(),
        model_name=str(args.model_name),
        test_size=float(args.test_size),
        random_state=int(args.random_state),
    )

    print("Training complete.")
    print(f"Model: {outputs.model_path}")
    print(f"Encoders: {outputs.encoders_path}")
    print(f"Features: {outputs.features_path}")
    print(f"Report: {outputs.report_path}")


if __name__ == "__main__":
    main()
