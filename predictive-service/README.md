# Predictive Service (Production Training + Inference)

This folder now supports both:
- live inference with your FastAPI service
- reproducible training/export of a logistic-regression model from CSV data

## 1) Train a deployable logistic model (from notebook-equivalent features)

Run from this folder:

```bash
python train_logistic_model.py \
  --input-csv ../docs/examples/sanitized_students.csv \
  --target-column repeat_violation_target \
  --output-dir artifacts/logistic_v1 \
  --model-name logistic_repeat_model
```

### Required CSV columns

Feature columns expected by runtime inference:
- offense_id
- description
- sanction
- evidence
- status
- active
- incident_year
- incident_month
- incident_day
- incident_dayofweek

Target column (default):
- repeat_violation_target (binary 0/1)

### Outputs

The script exports a complete artifact set:
- `<model_name>.pkl`
- `<model_name>_label_encoders.pkl`
- `<model_name>_feature_columns.pkl`
- `<model_name>_training_report.json`

## 2) Wire as Model 2 (shadow or ensemble)

Your loader already supports multi-model mode via environment variables.

Example (PowerShell):

```powershell
$env:MODEL_1_PATH = "./artifacts/best_model.joblib"
$env:MODEL_2_PATH = "./artifacts/logistic_v1/logistic_repeat_model.pkl"
$env:MODEL_3_PATH = ""
$env:LABEL_ENCODERS_PATH = "./artifacts/logistic_v1/logistic_repeat_model_label_encoders.pkl"
$env:FEATURE_COLUMNS_PATH = "./artifacts/logistic_v1/logistic_repeat_model_feature_columns.pkl"
$env:MODEL_WEIGHTS = "0.7,0.3"
$env:MODEL_VERSION = "ensemble-gbm-logistic-v2"
```

Then run:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```

## 3) Active vs shadow rollout

Suggested rollout:
1. Start with `MODEL_WEIGHTS=1.0,0.0` (shadow model loaded but not contributing).
2. Compare prediction drift and business outcomes.
3. Move to weighted blend (for example `0.8,0.2`).
4. Promote when stable.

## 4) Notes

- Keep feature engineering in training aligned with the live payload schema.
- If you retrain categorical mappings, deploy matching encoder artifacts with the model.
- For strict compatibility, deploy model and encoder artifacts from the same training run.
