"""
evaluate_forecast.py
====================
Long-horizon evaluation of the autoregressive LSTM on held-out sessions.

For each eval session (session 68, ~81 min):
  1. Context: first 600 rows (5 min)
  2. Autoregressive rollout: up to 60 min (7,200 steps)
  3. Compare to actual ground truth from the same session
  4. Report per-feature MAE / RMSE at horizon marks: 5, 10, 20, 30, 60 min

Session 12 (6,354 rows, ~53 min) is also evaluated for up to 26 min of rollout
(after 5 min context). This shows drift across two different session lengths.

Outputs  ->  ml/machine_c/models/
  long_horizon_eval.json    per-session, per-horizon-mark, per-feature errors
  long_horizon_eval.png     RMSE vs horizon (minutes) per feature
"""

import json
from pathlib import Path

import joblib
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    HAS_MPL = True
except ImportError:
    HAS_MPL = False
import numpy as np
import pandas as pd
import torch
import torch.nn as nn

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT      = Path(__file__).resolve().parents[1]
DATA_DIR  = ROOT / "data"   / "processed" / "forecast"
CLEAN_CSV = ROOT / "data"   / "processed" / "simulation" / "machine_c_augmented.csv"
MODEL_DIR = ROOT / "models"
CHECKPOINT = MODEL_DIR / "forecast_lstm_best.pt"

# ---------------------------------------------------------------------------
# Config — must match train_forecast.py
# ---------------------------------------------------------------------------
WINDOW_SIZE  = 120
HORIZON      = 120
N_FEATURES   = 4
FEATURE_COLS = ["VibrationX", "VibrationY", "VibrationZ", "Temperature"]
HIDDEN_SIZE  = 128
NUM_LAYERS   = 2
DROPOUT      = 0.2

CONTEXT_ROWS = 600       # 5 min context before rollout
HORIZON_MARKS_MIN = [5, 10, 20, 30, 60]   # minutes to report metrics at
STEPS_PER_MIN = 120      # 0.5s × 120 = 60s

# Sessions to evaluate (held out from training)
# Also evaluate session 12 (longest after session 68) up to its available length
EVAL_SESSIONS = [68, 12]

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
        last_temp = x[:, -1:, 3:4]
        outputs   = []
        for t in range(self.horizon):
            dec_out, (h, c) = self.decoder(dec_input, (h, c))
            pred = self.head(dec_out)
            outputs.append(pred)
            dec_input = torch.cat([pred[:, :, :3].detach(), last_temp], dim=2)
        return torch.cat(outputs, dim=1)


# ---------------------------------------------------------------------------
# Load model + scaler
# ---------------------------------------------------------------------------
print(f"Loading model from {CHECKPOINT}...")
model = AutoregressiveLSTM(N_FEATURES, HIDDEN_SIZE, NUM_LAYERS, DROPOUT, HORIZON).to(DEVICE)
model.load_state_dict(torch.load(CHECKPOINT, weights_only=True, map_location=DEVICE))
model.eval()

scaler = joblib.load(DATA_DIR / "scaler.joblib")

# ---------------------------------------------------------------------------
# Load clean data
# ---------------------------------------------------------------------------
df = pd.read_csv(CLEAN_CSV)
df["TimeCollected"] = pd.to_datetime(df["TimeCollected"])
df = df.sort_values(["SessionId", "TimeCollected"]).reset_index(drop=True)

# ---------------------------------------------------------------------------
# Autoregressive rollout helper
# ---------------------------------------------------------------------------
def rollout(context_scaled: np.ndarray, n_steps: int) -> np.ndarray:
    """
    Autoregressively generate n_steps predictions from a context window.
    context_scaled: (WINDOW_SIZE, F) in scaled space.
    Returns: (n_steps, F) in scaled space.
    """
    preds = []
    ctx = torch.tensor(context_scaled[np.newaxis], dtype=torch.float32).to(DEVICE)

    n_chunks = (n_steps + HORIZON - 1) // HORIZON
    with torch.no_grad():
        for _ in range(n_chunks):
            chunk_pred = model(ctx)           # (1, HORIZON, F)
            preds.append(chunk_pred[0].cpu().numpy())
            ctx = chunk_pred[:, -WINDOW_SIZE:]  # use last WINDOW_SIZE steps as next context
            if ctx.shape[1] < WINDOW_SIZE:
                # Pad with last prediction if chunk was shorter (edge case)
                pad = WINDOW_SIZE - ctx.shape[1]
                ctx = torch.cat([ctx, ctx[:, -1:, :].expand(1, pad, N_FEATURES)], dim=1)

    return np.concatenate(preds, axis=0)[:n_steps]   # (n_steps, F)


# ---------------------------------------------------------------------------
# Evaluate each session
# ---------------------------------------------------------------------------
results = {}
all_preds_by_session = {}
all_truth_by_session = {}

for sid in EVAL_SESSIONS:
    sess = df[df["SessionId"] == sid].sort_values("TimeCollected")
    n_rows = len(sess)

    if n_rows < CONTEXT_ROWS + WINDOW_SIZE:
        print(f"Session {sid}: too short ({n_rows} rows), skipping")
        continue

    print(f"\nEvaluating session {sid}  ({n_rows} rows = {n_rows * 0.5 / 60:.1f} min)...")

    raw = sess[FEATURE_COLS].values.astype(np.float32)
    scaled = scaler.transform(raw)

    # Context: rows 0..CONTEXT_ROWS-1 (first 5 min)
    context = scaled[CONTEXT_ROWS - WINDOW_SIZE : CONTEXT_ROWS]   # (WINDOW_SIZE, F)
    # Ground truth: rows CONTEXT_ROWS onwards
    truth_scaled = scaled[CONTEXT_ROWS:]                           # (remaining, F)

    max_steps = min(len(truth_scaled), 60 * STEPS_PER_MIN)         # cap at 60 min
    n_steps   = max_steps

    # Run rollout
    pred_scaled = rollout(context, n_steps)                        # (n_steps, F)

    # Inverse-transform
    pred_real  = scaler.inverse_transform(pred_scaled)
    truth_real = scaler.inverse_transform(truth_scaled[:n_steps])

    all_preds_by_session[sid] = pred_real
    all_truth_by_session[sid] = truth_real

    # Compute metrics at each horizon mark
    sess_results = {"n_rows": n_rows, "n_steps_evaluated": n_steps, "horizons": {}}
    for min_mark in HORIZON_MARKS_MIN:
        step = min_mark * STEPS_PER_MIN
        if step > n_steps:
            continue
        p = pred_real[:step]
        t = truth_real[:step]
        horizon_metrics = {}
        for i, col in enumerate(FEATURE_COLS):
            mae  = float(np.mean(np.abs(p[:, i] - t[:, i])))
            rmse = float(np.sqrt(np.mean((p[:, i] - t[:, i]) ** 2)))
            horizon_metrics[col] = {"mae": round(mae, 6), "rmse": round(rmse, 6)}
        sess_results["horizons"][f"{min_mark}min"] = horizon_metrics
        print(f"  {min_mark:>2} min  |  " +
              "  ".join(f"{col[:8]}: RMSE={horizon_metrics[col]['rmse']:.4f}"
                        for col in FEATURE_COLS))

    results[str(sid)] = sess_results

# ---------------------------------------------------------------------------
# Save JSON results
# ---------------------------------------------------------------------------
out_json = MODEL_DIR / "long_horizon_eval.json"
with open(out_json, "w") as f:
    json.dump(results, f, indent=2)
print(f"\nSaved {out_json}")

# ---------------------------------------------------------------------------
# Plot RMSE vs horizon per feature
# ---------------------------------------------------------------------------
if not HAS_MPL:
    print("matplotlib not found — skipping plot")
else:
    try:
        fig, axes = plt.subplots(2, 2, figsize=(12, 8), sharex=True)
        axes = axes.flatten()
        colors = ["tab:blue", "tab:orange"]
        for i, col in enumerate(FEATURE_COLS):
            ax = axes[i]
            for j, sid in enumerate(EVAL_SESSIONS):
                if str(sid) not in results:
                    continue
                xs, ys = [], []
                for mark_key, feats in results[str(sid)]["horizons"].items():
                    min_val = int(mark_key.replace("min", ""))
                    xs.append(min_val)
                    ys.append(feats[col]["rmse"])
                if xs:
                    ax.plot(xs, ys, "o-", color=colors[j],
                            label=f"Session {sid}", linewidth=1.5)
            ax.set_title(col)
            ax.set_ylabel("RMSE (real units)")
            ax.grid(True, alpha=0.3)
            ax.legend(fontsize=8)
        for ax in axes[-2:]:
            ax.set_xlabel("Forecast horizon (minutes)")
        fig.suptitle("Long-Horizon Rollout RMSE vs Forecast Horizon", fontsize=13)
        fig.tight_layout()
        out_png = MODEL_DIR / "long_horizon_eval.png"
        fig.savefig(out_png, dpi=120)
        print(f"Saved {out_png}")
    except Exception as e:
        print(f"Plot failed: {e}")

print("\nDone.")
