"""
predict_1h.py
=============
Generates a 1-hour (7,200-step) sensor forecast starting from
2025-08-01 14:48:41.863 (the last recorded timestamp in session 78).

Strategy: Hybrid LSTM + distributional session prior with adaptive blending.

  LSTM rollout  : 6 chunks × 1,200 steps = 7,200 steps
                  30 MC-dropout passes per chunk -> mean (point forecast) + std
  Session prior : top-5 sessions most similar to session 78 by feature distance
                  Prior is per-feature scalar stats (mean, std, p01, p99)
                  No time-axis alignment — purely distributional
  Adaptive λ    : λ(t, f) = exp(-σ_lstm(t, f) / σ_ref[f])
                  LSTM trusted when confident; prior stabilises when uncertain
  Hard clip     : values clipped to [prior_p01[f], prior_p99[f]]

Output  ->  ml/machine_c/data/processed/forecast/predictions_1h.csv
  Columns: TimeCollected, VibrationX, VibrationY, VibrationZ, Temperature,
           VibrationX_std, VibrationY_std, VibrationZ_std, Temperature_std,
           VibrationX_lambda, VibrationY_lambda, VibrationZ_lambda, Temperature_lambda
  7,200 rows from 2025-08-01 14:48:42.363 to 2025-08-01 15:48:41.363
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT       = Path(__file__).resolve().parents[1]
DATA_DIR   = ROOT / "data"   / "processed" / "forecast"
CLEAN_CSV  = ROOT / "data"   / "processed" / "simulation" / "machine_c_clean.csv"
MODEL_DIR  = ROOT / "models"
CHECKPOINT = MODEL_DIR / "forecast_lstm_best.pt"
OUT_CSV    = DATA_DIR  / "predictions_1h.csv"

# ---------------------------------------------------------------------------
# Config — must match train_forecast.py
# ---------------------------------------------------------------------------
WINDOW_SIZE  = 1200
HORIZON      = 1200
N_FEATURES   = 4
FEATURE_COLS = ["VibrationX", "VibrationY", "VibrationZ", "Temperature"]
HIDDEN_SIZE  = 128
NUM_LAYERS   = 2
DROPOUT      = 0.2

N_TOTAL_STEPS = 7200     # 1 hour at 500 ms
N_CHUNKS      = N_TOTAL_STEPS // HORIZON    # 6
MC_PASSES     = 30       # stochastic forward passes per chunk (dropout active)
K_SIMILAR     = 5        # number of most-similar sessions for the prior

LAST_TIMESTAMP = pd.Timestamp("2025-08-01 14:48:41.863")
STEP_MS        = 500     # milliseconds per step

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ---------------------------------------------------------------------------
# Model definition (must match train_forecast.py)
# ---------------------------------------------------------------------------
class AutoregressiveLSTM(nn.Module):
    def __init__(self, n_features, hidden_size, num_layers, dropout, horizon):
        super().__init__()
        self.horizon    = horizon
        self.n_features = n_features
        drop = dropout if num_layers > 1 else 0.0
        self.encoder = nn.LSTM(n_features, hidden_size, num_layers,
                               dropout=drop, batch_first=True)
        self.decoder = nn.LSTM(n_features, hidden_size, num_layers,
                               dropout=drop, batch_first=True)
        self.head = nn.Linear(hidden_size, n_features)

    def forward(self, x, target=None, tf_ratio=0.0):
        _, (h, c) = self.encoder(x)
        dec_input = x[:, -1:, :]
        outputs   = []
        for _ in range(self.horizon):
            dec_out, (h, c) = self.decoder(dec_input, (h, c))
            pred = self.head(dec_out)
            outputs.append(pred)
            dec_input = pred.detach()
        return torch.cat(outputs, dim=1)


# ---------------------------------------------------------------------------
# 1. Load model + scaler + config
# ---------------------------------------------------------------------------
print("Loading model and scaler...")
model = AutoregressiveLSTM(N_FEATURES, HIDDEN_SIZE, NUM_LAYERS, DROPOUT, HORIZON).to(DEVICE)
model.load_state_dict(torch.load(CHECKPOINT, weights_only=True, map_location=DEVICE))

scaler = joblib.load(DATA_DIR / "scaler.joblib")

with open(MODEL_DIR / "eval_metrics.json") as f:
    metrics = json.load(f)
sigma_ref = np.array(metrics["sigma_ref"], dtype=np.float64)   # (4,), scaled space
print(f"  sigma_ref (scaled): {sigma_ref.round(6)}")

with open(DATA_DIR / "session_features.json") as f:
    session_features = json.load(f)

# ---------------------------------------------------------------------------
# 2. Load clean data
# ---------------------------------------------------------------------------
df = pd.read_csv(CLEAN_CSV)
df["TimeCollected"] = pd.to_datetime(df["TimeCollected"])
df = df.sort_values(["SessionId", "TimeCollected"]).reset_index(drop=True)

# ---------------------------------------------------------------------------
# 3. Context: last 120 rows of session 78 (final session)
# ---------------------------------------------------------------------------
last_sid = int(df["SessionId"].iloc[-1])
last_sess = df[df["SessionId"] == last_sid].sort_values("TimeCollected")
assert len(last_sess) >= WINDOW_SIZE, f"Session {last_sid} too short for context window"

context_raw = last_sess[FEATURE_COLS].values[-WINDOW_SIZE:].astype(np.float32)
context_scaled = scaler.transform(context_raw).astype(np.float32)
print(f"\nContext: last {WINDOW_SIZE} rows of session {last_sid} "
      f"({last_sess['TimeCollected'].iloc[-WINDOW_SIZE]} to "
      f"{last_sess['TimeCollected'].iloc[-1]})")

# ---------------------------------------------------------------------------
# 4. Session prior: top-K similar sessions
# ---------------------------------------------------------------------------
last_feats = np.array(session_features[str(last_sid)]["features"], dtype=np.float64)

# Normalise all feature vectors for distance computation
all_sids   = [int(s) for s in session_features]
feat_matrix = np.array([session_features[str(s)]["features"] for s in all_sids],
                       dtype=np.float64)
feat_std    = feat_matrix.std(axis=0) + 1e-8
feat_mean   = feat_matrix.mean(axis=0)
feat_norm   = (feat_matrix - feat_mean) / feat_std
last_norm   = (last_feats  - feat_mean) / feat_std

dists = np.linalg.norm(feat_norm - last_norm, axis=1)
dists[all_sids.index(last_sid)] = np.inf   # exclude self

top_k_idx  = np.argsort(dists)[:K_SIMILAR]
top_k_sids = [all_sids[i] for i in top_k_idx]
print(f"\nTop-{K_SIMILAR} similar sessions (prior): {top_k_sids}")

prior_rows = pd.concat([df[df["SessionId"] == s] for s in top_k_sids])
prior_vals = prior_rows[FEATURE_COLS].values.astype(np.float64)

prior_mean = prior_vals.mean(axis=0)              # (4,)
prior_std  = prior_vals.std(axis=0)               # (4,)
prior_p01  = np.percentile(prior_vals, 1, axis=0) # (4,)
prior_p99  = np.percentile(prior_vals, 99, axis=0)# (4,)

print("  Prior statistics (real units):")
for i, col in enumerate(FEATURE_COLS):
    print(f"    {col:<14}: mean={prior_mean[i]:.3f}  std={prior_std[i]:.3f}"
          f"  p01={prior_p01[i]:.3f}  p99={prior_p99[i]:.3f}")

# ---------------------------------------------------------------------------
# 5. MC-dropout rollout: 60 chunks × 30 passes
# ---------------------------------------------------------------------------
print(f"\nRunning {N_CHUNKS} × {HORIZON}-step chunks with {MC_PASSES} MC passes each...")

# Enable dropout at inference for uncertainty estimation
model.train()

all_means_scaled = np.zeros((N_TOTAL_STEPS, N_FEATURES), dtype=np.float64)
all_stds_scaled  = np.zeros((N_TOTAL_STEPS, N_FEATURES), dtype=np.float64)

ctx = torch.tensor(context_scaled[np.newaxis], dtype=torch.float32).to(DEVICE)

with torch.no_grad():
    for chunk_idx in range(N_CHUNKS):
        chunk_passes = []
        for _ in range(MC_PASSES):
            pred = model(ctx)                          # (1, HORIZON, F)
            chunk_passes.append(pred[0].cpu().numpy()) # (HORIZON, F)

        chunk_arr = np.stack(chunk_passes, axis=0)    # (MC_PASSES, HORIZON, F)
        chunk_mean = chunk_arr.mean(axis=0)            # (HORIZON, F)
        chunk_std  = chunk_arr.std(axis=0)             # (HORIZON, F)

        s = chunk_idx * HORIZON
        e = s + HORIZON
        all_means_scaled[s:e] = chunk_mean
        all_stds_scaled[s:e]  = chunk_std

        # Next context: use mean prediction of this chunk
        ctx = torch.tensor(chunk_mean[np.newaxis], dtype=torch.float32).to(DEVICE)

        if (chunk_idx + 1) % 10 == 0:
            print(f"  Chunk {chunk_idx + 1}/{N_CHUNKS} done")

# ---------------------------------------------------------------------------
# 6. Inverse-transform predictions and stds
# ---------------------------------------------------------------------------
y_lstm_real = scaler.inverse_transform(all_means_scaled.astype(np.float32))
# Approximate std in real units using scaler.scale_
y_std_real  = all_stds_scaled * scaler.scale_[np.newaxis, :]   # (7200, 4)

# ---------------------------------------------------------------------------
# 7. Adaptive blending: λ(t, f) = exp(-σ_lstm(t,f) / σ_ref[f])
# ---------------------------------------------------------------------------
print("\nApplying adaptive blending with session prior...")

lambda_mat  = np.exp(-all_stds_scaled / (sigma_ref[np.newaxis, :] + 1e-12))
# lambda_mat: (7200, 4), close to 1 when LSTM is confident

y_blended = (lambda_mat       * y_lstm_real
           + (1 - lambda_mat) * prior_mean[np.newaxis, :])

# Hard clip to realistic operating envelope
y_blended = np.clip(y_blended, prior_p01[np.newaxis, :], prior_p99[np.newaxis, :])

print(f"  lambda range: [{lambda_mat.min():.4f}, {lambda_mat.max():.4f}]")
print(f"  Blended value ranges:")
for i, col in enumerate(FEATURE_COLS):
    print(f"    {col:<14}: [{y_blended[:, i].min():.4f}, {y_blended[:, i].max():.4f}]")

# ---------------------------------------------------------------------------
# 8. Build output timestamps  (0.5 s per step after last recorded timestamp)
# ---------------------------------------------------------------------------
timestamps = pd.date_range(
    start=LAST_TIMESTAMP + pd.Timedelta(milliseconds=STEP_MS),
    periods=N_TOTAL_STEPS,
    freq=f"{STEP_MS}ms",
)
assert len(timestamps) == N_TOTAL_STEPS
print(f"\nTimestamp range: {timestamps[0]}  to  {timestamps[-1]}")

# ---------------------------------------------------------------------------
# 9. Save CSV
# ---------------------------------------------------------------------------
DATA_DIR.mkdir(parents=True, exist_ok=True)

out_df = pd.DataFrame({
    "TimeCollected": timestamps,
    "VibrationX":    y_blended[:, 0],
    "VibrationY":    y_blended[:, 1],
    "VibrationZ":    y_blended[:, 2],
    "Temperature":   y_blended[:, 3],
    "VibrationX_std":  y_std_real[:, 0],
    "VibrationY_std":  y_std_real[:, 1],
    "VibrationZ_std":  y_std_real[:, 2],
    "Temperature_std": y_std_real[:, 3],
    "VibrationX_lambda":  lambda_mat[:, 0],
    "VibrationY_lambda":  lambda_mat[:, 1],
    "VibrationZ_lambda":  lambda_mat[:, 2],
    "Temperature_lambda": lambda_mat[:, 3],
})

out_df.to_csv(OUT_CSV, index=False)

print(f"\nSaved {len(out_df):,} rows to {OUT_CSV}")
print(f"  File size : {OUT_CSV.stat().st_size / 1024:.1f} KB")
print("\nVerification:")
print(f"  Rows          : {len(out_df)}")
print(f"  First timestamp: {out_df['TimeCollected'].iloc[0]}")
print(f"  Last timestamp : {out_df['TimeCollected'].iloc[-1]}")
print(f"  VibX range    : [{out_df['VibrationX'].min():.4f}, {out_df['VibrationX'].max():.4f}]")
print(f"  VibY range    : [{out_df['VibrationY'].min():.4f}, {out_df['VibrationY'].max():.4f}]")
print(f"  VibZ range    : [{out_df['VibrationZ'].min():.4f}, {out_df['VibrationZ'].max():.4f}]")
print(f"  Temp range    : [{out_df['Temperature'].min():.4f}, {out_df['Temperature'].max():.4f}]")
