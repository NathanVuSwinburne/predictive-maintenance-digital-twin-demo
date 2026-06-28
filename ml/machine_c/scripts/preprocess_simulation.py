"""
preprocess_simulation.py
========================
Cleans the raw sensordata CSV for use in state simulation (forecasting).

Goal
----
  Produce a clean, sorted, deduplicated time-series for training models that
  predict future sensor values (VibrationX, VibrationY, VibrationZ, Temperature).
  This is NOT a classification task — Label is kept as context only.

Cleaning steps
--------------
  1. Parse TimeCollected as UTC-naive datetime.
  2. Sort by TimeCollected (global temporal order).
  3. Drop exact full-row duplicates (keep first) — 18,478 duplicates in raw data.
  4. Drop remaining same-timestamp rows within the same session (sensor values
     are identical; only Label differs — a labeling artefact at session boundaries).
  5. Handle the single NaN Label row: sensor values are valid, so the row is kept;
     Label is filled with 'unknown'.

Derived columns added
---------------------
  VibrationMagnitude  — sqrt(X² + Y² + Z²), reused concept from classifier
  time_delta_s        — seconds since previous row within the same session
                        (NaN for the first row of each session)
  within_session_idx  — 0-based row index within each session (reset per session)

SessionId is preserved — simulation models must not predict across session
boundaries; the caller is responsible for splitting sequences by session.

Output  (ml/machine_c/data/processed/simulation/)
--------------------------------------------------
  machine_c_clean.csv   — cleaned time-series
  summary.json          — row counts, session stats, column stats
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ML_ROOT = Path(__file__).resolve().parents[2]   # ml/
ROOT    = Path(__file__).resolve().parents[1]   # ml/machine_c/
RAW_CSV = ML_ROOT / "data" / "raw_data" / "sensordata 1.csv"
OUT_DIR = ROOT / "data" / "processed" / "simulation"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SENSOR_COLS = ["VibrationX", "VibrationY", "VibrationZ", "Temperature"]
TS_COL      = "TimeCollected"
LABEL_COL   = "Label"
SESSION_COL = "SessionId"

# ---------------------------------------------------------------------------
# 1. Load
# ---------------------------------------------------------------------------
print("Loading raw data...")
df = pd.read_csv(RAW_CSV)
print(f"  Raw rows      : {len(df):,}")
print(f"  Columns       : {list(df.columns)}")
print(f"  Null counts   :\n{df.isnull().sum().to_string()}")

# ---------------------------------------------------------------------------
# 2. Parse timestamp + sort
# ---------------------------------------------------------------------------
df[TS_COL] = pd.to_datetime(df[TS_COL])
df = df.sort_values([TS_COL, SESSION_COL]).reset_index(drop=True)
print(f"\nTime range: {df[TS_COL].iloc[0]}  to  {df[TS_COL].iloc[-1]}")

# ---------------------------------------------------------------------------
# 3. Drop exact full-row duplicates
# ---------------------------------------------------------------------------
n_before = len(df)
df = df.drop_duplicates(keep="first").reset_index(drop=True)
n_exact_dups = n_before - len(df)
print(f"\nExact duplicates dropped : {n_exact_dups:,}  ({n_before:,} -> {len(df):,})")

# ---------------------------------------------------------------------------
# 4. Drop same-timestamp / same-session rows where sensor values match
#    but Label differs (labeling artefact — keep first alphabetically by Label
#    so the choice is deterministic, not arbitrary)
# ---------------------------------------------------------------------------
n_before = len(df)
df = df.sort_values([TS_COL, SESSION_COL, LABEL_COL])
df = df.drop_duplicates(
    subset=[SESSION_COL, TS_COL] + SENSOR_COLS, keep="first"
).reset_index(drop=True)
n_label_conflicts = n_before - len(df)
print(f"Label-conflict dups dropped: {n_label_conflicts:,}  ({n_before:,} -> {len(df):,})")

# Re-sort purely by time after dedup
df = df.sort_values([TS_COL, SESSION_COL]).reset_index(drop=True)

# ---------------------------------------------------------------------------
# 5. Fill single NaN Label row
# ---------------------------------------------------------------------------
n_null_labels = df[LABEL_COL].isnull().sum()
if n_null_labels:
    df[LABEL_COL] = df[LABEL_COL].fillna("unknown")
    print(f"\nFilled {n_null_labels} NaN Label(s) with 'unknown'")

# ---------------------------------------------------------------------------
# 6. Add VibrationMagnitude
# ---------------------------------------------------------------------------
df["VibrationMagnitude"] = np.sqrt(
    df["VibrationX"] ** 2 + df["VibrationY"] ** 2 + df["VibrationZ"] ** 2
).astype(np.float32)

# ---------------------------------------------------------------------------
# 7. Add within-session features
# ---------------------------------------------------------------------------
df["time_delta_s"] = (
    df.groupby(SESSION_COL)[TS_COL]
    .diff()
    .dt.total_seconds()
)

df["within_session_idx"] = (
    df.groupby(SESSION_COL).cumcount()
)

# ---------------------------------------------------------------------------
# 8. Reorder columns
# ---------------------------------------------------------------------------
col_order = [
    SESSION_COL, TS_COL,
    "VibrationX", "VibrationY", "VibrationZ", "Temperature",
    "VibrationMagnitude",
    "time_delta_s", "within_session_idx",
    LABEL_COL,
]
df = df[col_order]

# ---------------------------------------------------------------------------
# 9. Save CSV
# ---------------------------------------------------------------------------
out_csv = OUT_DIR / "machine_c_clean.csv"
df.to_csv(out_csv, index=False)
print(f"\nSaved: {out_csv}  ({out_csv.stat().st_size / 1024:.1f} KB)")

# ---------------------------------------------------------------------------
# 10. Summary JSON
# ---------------------------------------------------------------------------
session_stats = df.groupby(SESSION_COL).agg(
    rows=("VibrationX", "count"),
    duration_s=(TS_COL, lambda s: (s.max() - s.min()).total_seconds()),
    label_dist=(LABEL_COL, lambda s: s.value_counts().to_dict()),
)

summary = {
    "total_rows": int(len(df)),
    "sessions": int(df[SESSION_COL].nunique()),
    "time_range": {
        "start": str(df[TS_COL].iloc[0]),
        "end":   str(df[TS_COL].iloc[-1]),
    },
    "label_distribution": df[LABEL_COL].value_counts().to_dict(),
    "sensor_stats": {
        col: {
            "mean": float(df[col].mean()),
            "std":  float(df[col].std()),
            "min":  float(df[col].min()),
            "max":  float(df[col].max()),
        }
        for col in SENSOR_COLS + ["VibrationMagnitude"]
    },
    "sampling": {
        "median_dt_s":        float(df["time_delta_s"].median()),
        "pct95_dt_s":         float(df["time_delta_s"].quantile(0.95)),
        "n_gaps_over_2s":     int((df["time_delta_s"] > 2).sum()),
    },
    "session_row_counts": {
        str(k): int(v) for k, v in
        df.groupby(SESSION_COL).size().sort_index().items()
    },
}

out_json = OUT_DIR / "summary.json"
with open(out_json, "w") as f:
    json.dump(summary, f, indent=2)
print(f"Saved: {out_json}")

# ---------------------------------------------------------------------------
# 11. Print summary
# ---------------------------------------------------------------------------
print("\n" + "=" * 60)
print(f"Clean rows        : {len(df):,}")
print(f"Sessions          : {df[SESSION_COL].nunique()}")
print(f"Label distribution: {df[LABEL_COL].value_counts().to_dict()}")
print(f"Median sample dt  : {df['time_delta_s'].median():.3f}s")
print(f"Gaps > 2s         : {(df['time_delta_s'] > 2).sum()}")
print("\nSensor stats:")
print(df[SENSOR_COLS + ["VibrationMagnitude"]].describe().to_string())
print("=" * 60)
print(f"\nColumns in output: {list(df.columns)}")
