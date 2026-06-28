"""
preprocess_classifier.py
========================
Builds features for the multiclass machine state classifier.

Pipeline context
----------------
  Input window (t -> t+119)
      --> LSTM predicts --> Output window (t+120 -> t+239)
                                --> aggregate features
                                --> XGBoost classifier
                                --> confidence scores: P(low), P(medium), P(high)

Design
------
  Sessions are irrelevant for a classifier that generalises to future sessions.
  All rows are treated as a flat time-series, sorted by timestamp.
  Windows of 120 rows are built across the full dataset (no session boundaries).
  Split is time-based: train on earlier data, test on later data — this is the
  honest evaluation for generalisation to future unseen sessions.

Feature set (39 total)
----------------------
Sensor features (30) -- aggregated from the 120-row window:
  Per sensor (VibrationX, VibrationY, VibrationZ, Temperature):
    mean, std, min, max, last, slope  ->  6 x 4 = 24
  Vibration magnitude sqrt(X^2 + Y^2 + Z^2):
    mean, std, min, max, last, slope  ->  6

Melbourne weather features (9) -- derived from window start timestamp:
  month_sin, month_cos       -- cyclical month encoding
  hour_sin, hour_cos         -- cyclical time-of-day encoding
  dow_sin, dow_cos           -- cyclical weekday encoding
  melb_avg_temp              -- Melbourne mean monthly temperature (deg C)
  melb_avg_humidity          -- Melbourne mean monthly relative humidity (%)
  season                     -- 0=summer  1=autumn  2=winter  3=spring

Label
-----
  Majority vote over the 120 rows of the window.
  NaN rows excluded from voting.
  Ties broken by lower severity: low > medium > high.
  Label encoding: low=0  medium=1  high=2

Outputs  (ml/data/processed/classifier/)
-----------------------------------------
  X_train.npy, y_train.npy
  X_val.npy,   y_val.npy
  X_test.npy,  y_test.npy
  scaler.joblib        -- StandardScaler fitted on train split only
  feature_names.json   -- ordered list of 39 feature names
  label_map.json       -- {class_name: int_label}
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT    = Path(__file__).resolve().parents[1]
RAW_CSV = ROOT / "data" / "processed" / "simulation" / "machine_c_clean.csv"
OUT_DIR = ROOT / "data" / "processed" / "classifier"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
WINDOW_SIZE  = 120   # rows per window (1 minute @ ~500ms)
STRIDE       = 60    # step between windows — reduces redundancy without losing coverage
TRAIN_RATIO  = 0.70
VAL_RATIO    = 0.15
RANDOM_SEED  = 42

SENSOR_COLS    = ["VibrationX", "VibrationY", "VibrationZ", "Temperature"]
TS_COL         = "TimeCollected"
LABEL_COL      = "Label"
DROP_COLS      = ["SessionId"]

LABEL_MAP      = {"low": 0, "medium": 1, "high": 2}
LABEL_PRIORITY = ["low", "medium", "high"]   # tie-breaking: lower severity wins

# ---------------------------------------------------------------------------
# Melbourne climate (Bureau of Meteorology monthly averages)
# ---------------------------------------------------------------------------
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
    """Melbourne seasons: 0=summer 1=autumn 2=winter 3=spring"""
    return float({12: 0, 1: 0, 2: 0,
                   3: 1, 4: 1, 5: 1,
                   6: 2, 7: 2, 8: 2,
                   9: 3, 10: 3, 11: 3}[month])

# ---------------------------------------------------------------------------
# Feature helpers
# ---------------------------------------------------------------------------
def slope(arr: np.ndarray) -> float:
    if len(arr) < 2:
        return 0.0
    x = np.arange(len(arr), dtype=np.float32)
    return float(np.polyfit(x, arr, 1)[0])


def sensor_features(window: np.ndarray) -> np.ndarray:
    """window: (120, 4) -> 30 features"""
    feats = []
    for i in range(window.shape[1]):
        col = window[:, i]
        feats += [col.mean(), col.std(), col.min(), col.max(), col[-1], slope(col)]
    mag = np.sqrt(window[:, 0]**2 + window[:, 1]**2 + window[:, 2]**2)
    feats += [mag.mean(), mag.std(), mag.min(), mag.max(), mag[-1], slope(mag)]
    return np.array(feats, dtype=np.float32)


def weather_features(ts: pd.Timestamp) -> np.ndarray:
    """9 weather/seasonal features from the window's start timestamp."""
    m   = ts.month
    dow = ts.dayofweek
    h   = ts.hour + ts.minute / 60.0
    c   = MELB_CLIMATE[m]
    return np.array([
        np.sin(2 * np.pi * m   / 12),   # month_sin
        np.cos(2 * np.pi * m   / 12),   # month_cos
        np.sin(2 * np.pi * h   / 24),   # hour_sin
        np.cos(2 * np.pi * h   / 24),   # hour_cos
        np.sin(2 * np.pi * dow / 7),    # dow_sin
        np.cos(2 * np.pi * dow / 7),    # dow_cos
        c["avg_temp"],                  # melb_avg_temp
        c["avg_humidity"],              # melb_avg_humidity
        month_to_season(m),             # season
    ], dtype=np.float32)


def majority_label(labels: np.ndarray) -> str | None:
    """Majority vote; ties broken by lower severity. NaNs excluded."""
    valid = [l for l in labels if isinstance(l, str) and l in LABEL_MAP]
    if not valid:
        return None
    counts = {}
    for l in valid:
        counts[l] = counts.get(l, 0) + 1
    max_count = max(counts.values())
    candidates = [l for l, c in counts.items() if c == max_count]
    for p in LABEL_PRIORITY:
        if p in candidates:
            return p
    return candidates[0]


# ---------------------------------------------------------------------------
# 1. Load, sort by time, drop session
# ---------------------------------------------------------------------------
print("Loading data...")
df = pd.read_csv(RAW_CSV)
df[TS_COL] = pd.to_datetime(df[TS_COL])
df = df.sort_values(TS_COL).reset_index(drop=True)
df = df.drop(columns=DROP_COLS)

print(f"  Rows      : {len(df):,}")
print(f"  Time range: {df[TS_COL].iloc[0]}  to  {df[TS_COL].iloc[-1]}")
print(f"  Label dist: {df[LABEL_COL].value_counts(dropna=False).to_dict()}")

values     = df[SENSOR_COLS].values.astype(np.float32)  # (N, 4)
labels_raw = df[LABEL_COL].values
timestamps = df[TS_COL].values

# ---------------------------------------------------------------------------
# 2. Fit scaler on all rows (no train/test split at row level —
#    split happens on windows after feature extraction)
# ---------------------------------------------------------------------------
scaler = StandardScaler()
scaler.fit(values)
values_scaled = scaler.transform(values).astype(np.float32)

# ---------------------------------------------------------------------------
# 3. Build all windows across the full dataset
# ---------------------------------------------------------------------------
n = len(values)
print("\nBuilding windows...")
X_sensor_all, X_weather_all, y_all = [], [], []
n_windows = (n - WINDOW_SIZE) // STRIDE + 1

for i in range(n_windows):
    s = i * STRIDE
    e = s + WINDOW_SIZE
    label = majority_label(labels_raw[s:e])
    if label is None:
        continue
    X_sensor_all.append(sensor_features(values_scaled[s:e]))
    X_weather_all.append(weather_features(pd.Timestamp(timestamps[s])))
    y_all.append(LABEL_MAP[label])

X_sensor_all = np.array(X_sensor_all, dtype=np.float32)
X_weather_all = np.array(X_weather_all, dtype=np.float32)
y_all         = np.array(y_all, dtype=np.int64)
X_all         = np.concatenate([X_sensor_all, X_weather_all], axis=1)

print(f"  Total windows: {len(y_all):,}")
inv = {v: k for k, v in LABEL_MAP.items()}
print(f"  Label dist   : { {inv[c]: int((y_all==c).sum()) for c in sorted(LABEL_MAP.values())} }")

# ---------------------------------------------------------------------------
# 4. Random shuffle split  (classifier treats each window as independent)
# ---------------------------------------------------------------------------
rng   = np.random.default_rng(RANDOM_SEED)
idx   = rng.permutation(len(y_all))
t_end = int(len(idx) * TRAIN_RATIO)
v_end = int(len(idx) * (TRAIN_RATIO + VAL_RATIO))

train_idx = idx[:t_end]
val_idx   = idx[t_end:v_end]
test_idx  = idx[v_end:]

X_train, y_train = X_all[train_idx], y_all[train_idx]
X_val,   y_val   = X_all[val_idx],   y_all[val_idx]
X_test,  y_test  = X_all[test_idx],  y_all[test_idx]

print(f"\nRandom shuffle split (seed={RANDOM_SEED}):")
for split_name, y in [("Train", y_train), ("Val", y_val), ("Test", y_test)]:
    dist = {inv[c]: int((y == c).sum()) for c in sorted(LABEL_MAP.values())}
    print(f"  {split_name}: {len(y):,} windows  {dist}")

inv = {v: k for k, v in LABEL_MAP.items()}
for split_name, y in [("Train", y_train), ("Val", y_val), ("Test", y_test)]:
    dist = {inv[c]: int((y == c).sum()) for c in sorted(LABEL_MAP.values())}
    print(f"  {split_name}: {len(y):,} windows  {dist}")

# ---------------------------------------------------------------------------
# 5. Save
# ---------------------------------------------------------------------------
np.save(OUT_DIR / "X_train.npy", X_train)
np.save(OUT_DIR / "y_train.npy", y_train)
np.save(OUT_DIR / "X_val.npy",   X_val)
np.save(OUT_DIR / "y_val.npy",   y_val)
np.save(OUT_DIR / "X_test.npy",  X_test)
np.save(OUT_DIR / "y_test.npy",  y_test)
joblib.dump(scaler, OUT_DIR / "scaler.joblib")

sensor_feat_names = []
for col in SENSOR_COLS:
    sensor_feat_names += [f"{col}_mean", f"{col}_std", f"{col}_min",
                          f"{col}_max",  f"{col}_last", f"{col}_slope"]
sensor_feat_names += ["VibMag_mean", "VibMag_std", "VibMag_min",
                      "VibMag_max",  "VibMag_last", "VibMag_slope"]
weather_feat_names = ["month_sin", "month_cos", "hour_sin", "hour_cos",
                      "dow_sin", "dow_cos", "melb_avg_temp",
                      "melb_avg_humidity", "season"]
all_feature_names = sensor_feat_names + weather_feat_names

with open(OUT_DIR / "feature_names.json", "w") as f:
    json.dump(all_feature_names, f, indent=2)
with open(OUT_DIR / "label_map.json", "w") as f:
    json.dump(LABEL_MAP, f, indent=2)

# ---------------------------------------------------------------------------
# 6. Summary
# ---------------------------------------------------------------------------
print("\n" + "=" * 55)
print(f"Preprocessing complete. Files in: {OUT_DIR}")
for fp in sorted(OUT_DIR.iterdir()):
    print(f"  {fp.name:<30}  {fp.stat().st_size/1024:>8.1f} KB")
print("=" * 55)
print(f"\nFeatures ({len(all_feature_names)}):")
for i, name in enumerate(all_feature_names):
    tag = "  <- weather" if name in weather_feat_names else ""
    print(f"  [{i:>2}] {name}{tag}")
