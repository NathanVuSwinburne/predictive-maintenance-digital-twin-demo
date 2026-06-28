"""
predict_labels.py
=================
Applies the existing XGBoost classifier to predict machine state labels
(low / medium / high) over the 1-hour sensor forecast.

Input  : ml/machine_c/data/processed/forecast/predictions_1h.csv  (7,200 rows)
Output : ml/machine_c/data/processed/forecast/predictions_1h_labels.csv  (60 rows)
  Columns: WindowStart, WindowEnd, PredictedLabel, P_low, P_medium, P_high

Each row covers one 60-second window (120 steps at 500 ms).

Prerequisites — run these first if outputs don't exist:
  python ml/machine_c/scripts/preprocess_classifier.py
  python ml/machine_c/scripts/train_classifier.py

The classifier expects 39 features per window:
  30 sensor features: per sensor × {mean, std, min, max, last, slope}
                      for VibX, VibY, VibZ, Temp, VibMagnitude
   9 weather features: month_sin/cos, hour_sin/cos, dow_sin/cos,
                       melb_avg_temp, melb_avg_humidity, season
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT           = Path(__file__).resolve().parents[1]
FORECAST_CSV   = ROOT / "data"   / "processed" / "forecast" / "predictions_1h.csv"
LABEL_OUT_CSV  = ROOT / "data"   / "processed" / "forecast" / "predictions_1h_labels.csv"
CLASSIFIER_DIR = ROOT / "models" / "classifier"
FEAT_DATA_DIR  = ROOT / "data"   / "processed" / "classifier"

CLASSIFIER_PATH = CLASSIFIER_DIR / "classifier.joblib"
SCALER_PATH     = FEAT_DATA_DIR  / "scaler.joblib"
LABEL_MAP_PATH  = FEAT_DATA_DIR  / "label_map.json"

# ---------------------------------------------------------------------------
# Validation: ensure prerequisites exist
# ---------------------------------------------------------------------------
missing = [p for p in [CLASSIFIER_PATH, SCALER_PATH, LABEL_MAP_PATH] if not p.exists()]
if missing:
    print("ERROR: Missing classifier artifacts. Run these first:")
    print("  python ml/machine_c/scripts/preprocess_classifier.py")
    print("  python ml/machine_c/scripts/train_classifier.py")
    print("\nMissing files:")
    for p in missing:
        print(f"  {p}")
    raise SystemExit(1)

if not FORECAST_CSV.exists():
    print("ERROR: predictions_1h.csv not found. Run predict_1h.py first.")
    raise SystemExit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
WINDOW_SIZE  = 120
STRIDE       = 120    # no overlap — each window is exactly one 60-second block
FEATURE_COLS = ["VibrationX", "VibrationY", "VibrationZ", "Temperature"]

# Melbourne climate (Bureau of Meteorology monthly averages)
MELB_CLIMATE = {
    1:  {"avg_temp": 25.9, "avg_humidity": 56},
    2:  {"avg_temp": 25.8, "avg_humidity": 58},
    3:  {"avg_temp": 23.9, "avg_humidity": 60},
    4:  {"avg_temp": 20.3, "avg_humidity": 65},
    5:  {"avg_temp": 16.7, "avg_humidity": 70},
    6:  {"avg_temp": 14.1, "avg_humidity": 73},
    7:  {"avg_temp": 13.5, "avg_humidity": 73},
    8:  {"avg_temp": 14.8, "avg_humidity": 69},
    9:  {"avg_temp": 17.0, "avg_humidity": 64},
    10: {"avg_temp": 19.5, "avg_humidity": 60},
    11: {"avg_temp": 22.0, "avg_humidity": 57},
    12: {"avg_temp": 24.3, "avg_humidity": 56},
}

def month_to_season(month: int) -> float:
    return float({12: 0, 1: 0, 2: 0,
                   3: 1, 4: 1, 5: 1,
                   6: 2, 7: 2, 8: 2,
                   9: 3, 10: 3, 11: 3}[month])

def slope(arr: np.ndarray) -> float:
    if len(arr) < 2:
        return 0.0
    x = np.arange(len(arr), dtype=np.float32)
    return float(np.polyfit(x, arr, 1)[0])

def sensor_features(window: np.ndarray) -> np.ndarray:
    """(120, 4) -> 30 features (same as preprocess_classifier.py)"""
    feats = []
    for i in range(4):
        col = window[:, i]
        feats += [col.mean(), col.std(), col.min(), col.max(), col[-1], slope(col)]
    mag = np.sqrt(window[:, 0]**2 + window[:, 1]**2 + window[:, 2]**2)
    feats += [mag.mean(), mag.std(), mag.min(), mag.max(), mag[-1], slope(mag)]
    return np.array(feats, dtype=np.float32)

def weather_features(ts: pd.Timestamp) -> np.ndarray:
    """9 features from midpoint timestamp (same as preprocess_classifier.py)"""
    m   = ts.month
    dow = ts.dayofweek
    h   = ts.hour + ts.minute / 60.0
    c   = MELB_CLIMATE[m]
    return np.array([
        np.sin(2 * np.pi * m   / 12),
        np.cos(2 * np.pi * m   / 12),
        np.sin(2 * np.pi * h   / 24),
        np.cos(2 * np.pi * h   / 24),
        np.sin(2 * np.pi * dow / 7),
        np.cos(2 * np.pi * dow / 7),
        c["avg_temp"],
        c["avg_humidity"],
        month_to_season(m),
    ], dtype=np.float32)

# ---------------------------------------------------------------------------
# 1. Load forecast CSV
# ---------------------------------------------------------------------------
print("Loading predictions_1h.csv...")
df = pd.read_csv(FORECAST_CSV)
df["TimeCollected"] = pd.to_datetime(df["TimeCollected"])
print(f"  Rows: {len(df):,}  ({df['TimeCollected'].iloc[0]}  to  {df['TimeCollected'].iloc[-1]})")

values     = df[FEATURE_COLS].values.astype(np.float32)
timestamps = df["TimeCollected"].values

# ---------------------------------------------------------------------------
# 2. Load classifier artifacts
# ---------------------------------------------------------------------------
print("\nLoading classifier artifacts...")
classifier = joblib.load(CLASSIFIER_PATH)
scaler     = joblib.load(SCALER_PATH)

with open(LABEL_MAP_PATH) as f:
    label_map = json.load(f)
inv_label_map = {v: k for k, v in label_map.items()}

print(f"  Label map: {label_map}")

# ---------------------------------------------------------------------------
# 3. Scale sensor values (using classifier scaler, same as training)
# ---------------------------------------------------------------------------
values_scaled = scaler.transform(values).astype(np.float32)

# ---------------------------------------------------------------------------
# 4. Build non-overlapping 120-row windows and extract 39 features
# ---------------------------------------------------------------------------
print("\nExtracting features for each 60-second window...")
n = len(values_scaled)
n_windows = n // WINDOW_SIZE    # 60 windows for 7200 rows

rows = []
for i in range(n_windows):
    s   = i * WINDOW_SIZE
    e   = s + WINDOW_SIZE
    win = values_scaled[s:e]                    # (120, 4) scaled

    # Window midpoint timestamp for weather features
    mid_ts = pd.Timestamp(timestamps[(s + e) // 2])

    s_feats = sensor_features(win)              # 30 features
    w_feats = weather_features(mid_ts)          # 9 features
    x_row   = np.concatenate([s_feats, w_feats])  # 39 features

    rows.append({
        "window_idx":  i,
        "window_start": pd.Timestamp(timestamps[s]),
        "window_end":   pd.Timestamp(timestamps[e - 1]),
        "features":     x_row,
    })

X = np.stack([r["features"] for r in rows], axis=0)  # (60, 39)
print(f"  Feature matrix shape: {X.shape}")

# ---------------------------------------------------------------------------
# 5. Predict labels and probabilities
# ---------------------------------------------------------------------------
print("Running classifier...")
proba = classifier.predict_proba(X)   # (60, 3)  [P(low), P(medium), P(high)]
preds = proba.argmax(axis=1)          # (60,)    int labels

# ---------------------------------------------------------------------------
# 6. Build output DataFrame
# ---------------------------------------------------------------------------
out_df = pd.DataFrame({
    "WindowStart":    [r["window_start"] for r in rows],
    "WindowEnd":      [r["window_end"]   for r in rows],
    "PredictedLabel": [inv_label_map[p] for p in preds],
    "P_low":          proba[:, label_map["low"]],
    "P_medium":       proba[:, label_map["medium"]],
    "P_high":         proba[:, label_map["high"]],
})

out_df.to_csv(LABEL_OUT_CSV, index=False)

print(f"\nSaved {len(out_df)} rows to {LABEL_OUT_CSV}")
print("\nLabel distribution:")
print(out_df["PredictedLabel"].value_counts().to_string())
print("\nProbability summary (mean per class):")
print(f"  P(low)   : {out_df['P_low'].mean():.4f}")
print(f"  P(medium): {out_df['P_medium'].mean():.4f}")
print(f"  P(high)  : {out_df['P_high'].mean():.4f}")
print("\nFirst few windows:")
print(out_df.head(6).to_string(index=False))
