"""
preprocess_forecast.py
======================
Prepares training data for the 1-hour autoregressive LSTM forecast model.

Reads machine_c_clean.csv and builds within-session sliding windows
(window=1200, horizon=1200, stride=600). Only one session (the longest,
session 68 with ~81 min) is held out for long-horizon evaluation;
all other 50 sessions contribute to train / val / test.

Session split: size-stratified round-robin (same logic as ml/scripts/preprocess.py).

Outputs  ->  ml/machine_c/data/processed/forecast/
  X_train.npy, y_train.npy   shape (N, 1200, 4)
  X_val.npy,   y_val.npy
  X_test.npy,  y_test.npy
  scaler.joblib              StandardScaler fitted on train split only
  session_features.json      12-dim feature vector per session (all 51)
  config.json                shapes, scaler path, eval_session_ids
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

# ---------------------------------------------------------------------------
# Paths  (ROOT = ml/machine_c/)
# ---------------------------------------------------------------------------
ROOT       = Path(__file__).resolve().parents[1]
CLEAN_CSV  = ROOT / "data" / "processed" / "simulation" / "machine_c_augmented.csv"
OUT_DIR    = ROOT / "data" / "processed" / "forecast"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
WINDOW_SIZE   = 2400   # 20 min @ 500 ms
HORIZON       = 1200   # predict next 10 min
STRIDE        = 600    # step between windows (50% overlap)
TRAIN_RATIO   = 0.70
VAL_RATIO     = 0.15
SEED          = 42

FEATURE_COLS  = ["VibrationX", "VibrationY", "VibrationZ", "Temperature"]
SESSION_COL   = "SessionId"
TS_COL        = "TimeCollected"
LABEL_COL     = "Label"

# Sessions reserved for long-horizon evaluation (not in train/val/test windows)
# Session 68 has 9,766 rows (~81 min), the only session with >= 60 min of data
EVAL_SESSION_IDS = [68]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def build_windows(arr: np.ndarray, window: int, horizon: int, stride: int):
    total = window + horizon
    n = len(arr)
    if n < total:
        return (np.empty((0, window,  arr.shape[1]), dtype=np.float32),
                np.empty((0, horizon, arr.shape[1]), dtype=np.float32))
    n_samples = (n - total) // stride + 1
    X = np.empty((n_samples, window,  arr.shape[1]), dtype=np.float32)
    y = np.empty((n_samples, horizon, arr.shape[1]), dtype=np.float32)
    for i in range(n_samples):
        s    = i * stride
        X[i] = arr[s          : s + window]
        y[i] = arr[s + window : s + total]
    return X, y


def session_feature_vector(rows: pd.DataFrame) -> list:
    """12-dim feature vector for session similarity lookup."""
    vals = rows[FEATURE_COLS].values.astype(np.float32)
    feats = []
    for i in range(4):
        feats.append(float(vals[:, i].mean()))
        feats.append(float(vals[:, i].std()))
    labels = rows[LABEL_COL].values
    total  = len(labels)
    for lbl in ("low", "medium", "high"):
        feats.append(float((labels == lbl).sum()) / total)
    feats.append(float(len(rows)))
    return feats   # 8 (mean/std per feature) + 3 (label fracs) + 1 (count) = 12


# ---------------------------------------------------------------------------
# 1. Load clean data
# ---------------------------------------------------------------------------
print("Loading machine_c_clean.csv...")
df = pd.read_csv(CLEAN_CSV)
df[TS_COL] = pd.to_datetime(df[TS_COL])
df = df.sort_values([SESSION_COL, TS_COL]).reset_index(drop=True)

all_sessions = sorted(df[SESSION_COL].unique())
print(f"  Rows     : {len(df):,}")
print(f"  Sessions : {len(all_sessions)}")

# ---------------------------------------------------------------------------
# 2. Compute session feature vectors (all 51 sessions)
# ---------------------------------------------------------------------------
print("\nComputing session feature vectors...")
session_features = {}
for sid in all_sessions:
    sess_rows = df[df[SESSION_COL] == sid]
    session_features[int(sid)] = {
        "session_id": int(sid),
        "n_rows": len(sess_rows),
        "features": session_feature_vector(sess_rows),
    }

with open(OUT_DIR / "session_features.json", "w") as f:
    json.dump(session_features, f, indent=2)
print(f"  Saved session_features.json  ({len(session_features)} sessions)")

# ---------------------------------------------------------------------------
# 3. Identify long sessions  (>= 60 min = 7200 rows) and show info
# ---------------------------------------------------------------------------
sess_counts = df.groupby(SESSION_COL).size()
long_sessions = sess_counts[sess_counts >= 7200].index.tolist()
print(f"\nSessions >= 7,200 rows (60 min): {long_sessions}")
print(f"  Reserved for eval only       : {EVAL_SESSION_IDS}")

train_pool = [s for s in all_sessions if s not in EVAL_SESSION_IDS]
print(f"  Sessions in train pool       : {len(train_pool)}")

# ---------------------------------------------------------------------------
# 4. Session-level train / val / test split (size-stratified round-robin)
#    Same logic as ml/scripts/preprocess.py — excludes eval sessions.
# ---------------------------------------------------------------------------
TOTAL_STEPS = WINDOW_SIZE + HORIZON

# Count usable windows per session
sess_window_counts = []
for sid in train_pool:
    n_rows = int(sess_counts[sid])
    n_win  = max(0, (n_rows - TOTAL_STEPS) // STRIDE + 1) if n_rows >= TOTAL_STEPS else 0
    sess_window_counts.append((sid, n_win))

# Sort descending by window count, then round-robin into train/val/test
sess_window_counts.sort(key=lambda x: x[1], reverse=True)
slot_map = {0: "train", 1: "train", 2: "train", 3: "train",
            4: "train", 5: "val",   6: "test"}

split_map = {}
for i, (sid, _) in enumerate(sess_window_counts):
    split_map[sid] = slot_map[i % 7]

train_ids = [s for s, sp in split_map.items() if sp == "train"]
val_ids   = [s for s, sp in split_map.items() if sp == "val"]
test_ids  = [s for s, sp in split_map.items() if sp == "test"]

print(f"\nSession split (excluding eval sessions):")
print(f"  Train : {len(train_ids)} sessions")
print(f"  Val   : {len(val_ids)} sessions")
print(f"  Test  : {len(test_ids)} sessions")

# ---------------------------------------------------------------------------
# 5. Extract raw feature arrays per session
# ---------------------------------------------------------------------------
def session_arrays(ids):
    return [df.loc[df[SESSION_COL] == sid, FEATURE_COLS].values.astype(np.float32)
            for sid in ids]

train_chunks = session_arrays(train_ids)
val_chunks   = session_arrays(val_ids)
test_chunks  = session_arrays(test_ids)

# ---------------------------------------------------------------------------
# 6. Fit scaler on train split only
# ---------------------------------------------------------------------------
print("\nFitting StandardScaler on train sessions...")
train_all = np.concatenate(train_chunks, axis=0)
scaler = StandardScaler()
scaler.fit(train_all)

def scale_chunks(chunks):
    return [scaler.transform(c).astype(np.float32) for c in chunks]

train_scaled = scale_chunks(train_chunks)
val_scaled   = scale_chunks(val_chunks)
test_scaled  = scale_chunks(test_chunks)

print(f"  Scaler mean  : {scaler.mean_.round(4)}")
print(f"  Scaler scale : {scaler.scale_.round(4)}")

# ---------------------------------------------------------------------------
# 7. Build sliding windows (within each session)
# ---------------------------------------------------------------------------
def windows_from_chunks(chunks):
    Xs, ys = [], []
    for chunk in chunks:
        x, y = build_windows(chunk, WINDOW_SIZE, HORIZON, STRIDE)
        if len(x):
            Xs.append(x); ys.append(y)
    if Xs:
        return np.concatenate(Xs), np.concatenate(ys)
    n_f = 4
    return (np.empty((0, WINDOW_SIZE, n_f), dtype=np.float32),
            np.empty((0, HORIZON,     n_f), dtype=np.float32))

print("\nBuilding sliding windows...")
X_train, y_train = windows_from_chunks(train_scaled)
X_val,   y_val   = windows_from_chunks(val_scaled)
X_test,  y_test  = windows_from_chunks(test_scaled)

print(f"  Train : {len(X_train):,} windows  {X_train.shape}")
print(f"  Val   : {len(X_val):,} windows  {X_val.shape}")
print(f"  Test  : {len(X_test):,} windows  {X_test.shape}")

# ---------------------------------------------------------------------------
# 8. Save arrays + scaler
# ---------------------------------------------------------------------------
print("\nSaving...")
np.save(OUT_DIR / "X_train.npy", X_train)
np.save(OUT_DIR / "y_train.npy", y_train)
np.save(OUT_DIR / "X_val.npy",   X_val)
np.save(OUT_DIR / "y_val.npy",   y_val)
np.save(OUT_DIR / "X_test.npy",  X_test)
np.save(OUT_DIR / "y_test.npy",  y_test)
joblib.dump(scaler, OUT_DIR / "scaler.joblib")

config = {
    "window_size":       WINDOW_SIZE,
    "horizon":           HORIZON,
    "stride":            STRIDE,
    "n_features":        len(FEATURE_COLS),
    "feature_cols":      FEATURE_COLS,
    "eval_session_ids":  [int(s) for s in EVAL_SESSION_IDS],
    "train_session_ids": [int(s) for s in train_ids],
    "val_session_ids":   [int(s) for s in val_ids],
    "test_session_ids":  [int(s) for s in test_ids],
    "n_train":           len(X_train),
    "n_val":             len(X_val),
    "n_test":            len(X_test),
}
with open(OUT_DIR / "config.json", "w") as f:
    json.dump(config, f, indent=2)

print("\n" + "=" * 55)
print(f"Done. Files in: {OUT_DIR}")
for fp in sorted(OUT_DIR.iterdir()):
    print(f"  {fp.name:<30}  {fp.stat().st_size / 1024:>8.1f} KB")
print("=" * 55)
