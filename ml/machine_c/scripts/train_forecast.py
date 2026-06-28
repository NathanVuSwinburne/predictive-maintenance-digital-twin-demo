"""
train_forecast.py
=================
Trains an autoregressive LSTM encoder-decoder for multi-step sensor forecasting.

Unlike the existing EncoderDecoderLSTM (which repeats the context vector),
this model feeds each step's prediction back as the next decoder input.
Teacher forcing (ratio decays 0.5 -> 0.0 after epoch 30) is used during
training to stabilise learning.

This is the first stage of the 1-hour rolling forecast pipeline:
  preprocess_forecast.py  ->  train_forecast.py  ->  evaluate_forecast.py
                                                  ->  predict_1h.py

Outputs  ->  ml/machine_c/models/
  forecast_lstm_best.pt    checkpoint with lowest validation MSE
  eval_metrics.json        per-feature MSE / MAE / RMSE (real units) + sigma_ref
  training_log.csv         epoch-level losses
  training_curves.png      loss curves plot
"""

import json
import random
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

# ---------------------------------------------------------------------------
# Paths  (ROOT = ml/machine_c/)
# ---------------------------------------------------------------------------
ROOT      = Path(__file__).resolve().parents[1]
DATA_DIR  = ROOT / "data"   / "processed" / "forecast"
MODEL_DIR = ROOT / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

CHECKPOINT = MODEL_DIR / "forecast_lstm_best.pt"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
HIDDEN_SIZE = 128
NUM_LAYERS  = 2
DROPOUT     = 0.2
BATCH_SIZE  = 64
LR          = 1e-3
MAX_EPOCHS  = 100
PATIENCE    = 10
SEED        = 42
TF_START    = 0.5    # teacher forcing ratio at epoch 1
TF_END      = 0.0    # teacher forcing ratio at epoch TF_DECAY_EPOCHS+
TF_DECAY_EPOCHS = 30

N_FEATURES   = 4
FEATURE_COLS = ["VibrationX", "VibrationY", "VibrationZ", "Temperature"]
HORIZON      = 1200
WINDOW_SIZE  = 2400

# ---------------------------------------------------------------------------
# Reproducibility
# ---------------------------------------------------------------------------
torch.manual_seed(SEED)
np.random.seed(SEED)
random.seed(SEED)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device : {DEVICE}")
if DEVICE.type == "cuda":
    print(f"  GPU  : {torch.cuda.get_device_name(0)}")

# ---------------------------------------------------------------------------
# 1. Load preprocessed data
# ---------------------------------------------------------------------------
print("\nLoading preprocessed windows...")

def load_np(name):
    return torch.tensor(np.load(DATA_DIR / name), dtype=torch.float32)

X_train = load_np("X_train.npy")
y_train = load_np("y_train.npy")
X_val   = load_np("X_val.npy")
y_val   = load_np("y_val.npy")
X_test  = load_np("X_test.npy")
y_test  = load_np("y_test.npy")

print(f"  Train : {X_train.shape} -> {y_train.shape}")
print(f"  Val   : {X_val.shape}   -> {y_val.shape}")
print(f"  Test  : {X_test.shape}  -> {y_test.shape}")

train_loader = DataLoader(TensorDataset(X_train, y_train),
                          batch_size=BATCH_SIZE, shuffle=True)
val_loader   = DataLoader(TensorDataset(X_val,   y_val),   batch_size=BATCH_SIZE)
test_loader  = DataLoader(TensorDataset(X_test,  y_test),  batch_size=BATCH_SIZE)

scaler = joblib.load(DATA_DIR / "scaler.joblib")

# ---------------------------------------------------------------------------
# 2. Model
# ---------------------------------------------------------------------------
class AutoregressiveLSTM(nn.Module):
    """
    Encoder-decoder LSTM with autoregressive decoding.
    Each decoder step receives its own previous prediction as input,
    not a repeated context vector — better for long-horizon rollout.
    Teacher forcing is used during training only.
    """
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
        # Encode context
        _, (h, c) = self.encoder(x)                   # h: (layers, B, H)

        # Decoder init: use last encoder input as first decoder input
        dec_input = x[:, -1:, :]                      # (B, 1, F)
        # Freeze temperature in the feedback: always re-use the last observed
        # temperature rather than the model's own (potentially drifting) prediction.
        # Temperature is nearly stationary within 60s; feeding back predicted temp
        # compounds tiny errors into large drift. Vibration remains autoregressive.
        last_temp = x[:, -1:, 3:4]                    # (B, 1, 1)
        outputs   = []

        for t in range(self.horizon):
            dec_out, (h, c) = self.decoder(dec_input, (h, c))
            pred = self.head(dec_out)                  # (B, 1, F)
            outputs.append(pred)

            # Teacher forcing: use ground truth or own prediction
            use_tf = (target is not None) and (random.random() < tf_ratio)
            if use_tf:
                dec_input = target[:, t:t+1, :]
            else:
                # Vibration: autoregressive (own prediction)
                # Temperature: frozen at last observed value
                dec_input = torch.cat([pred[:, :, :3].detach(), last_temp], dim=2)

        return torch.cat(outputs, dim=1)               # (B, horizon, F)


model = AutoregressiveLSTM(
    n_features=N_FEATURES,
    hidden_size=HIDDEN_SIZE,
    num_layers=NUM_LAYERS,
    dropout=DROPOUT,
    horizon=HORIZON,
).to(DEVICE)

total_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
print(f"\nModel parameters : {total_params:,}")

# ---------------------------------------------------------------------------
# 3. Optimizer + loss
# ---------------------------------------------------------------------------
optimizer = torch.optim.Adam(model.parameters(), lr=LR)
scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
    optimizer, mode="min", factor=0.5, patience=5)

# Temperature (index 3) is nearly stationary in 60s windows but baseline shows
# the model massively over-predicts drift. Weight it 20x to increase gradient signal.
_FEAT_W = torch.tensor([1.0, 1.0, 1.0, 20.0], device=DEVICE)

def criterion(pred, target):
    return (((pred - target) ** 2) * _FEAT_W).mean()

# ---------------------------------------------------------------------------
# 4. Training loop
# ---------------------------------------------------------------------------
def teacher_forcing_ratio(epoch: int) -> float:
    if epoch > TF_DECAY_EPOCHS:
        return TF_END
    return TF_START * (1.0 - (epoch - 1) / TF_DECAY_EPOCHS)


def run_epoch(loader, train=True, tf_ratio=0.0):
    model.train(train)
    total_loss = 0.0
    with torch.set_grad_enabled(train):
        for xb, yb in loader:
            xb, yb = xb.to(DEVICE), yb.to(DEVICE)
            pred   = model(xb, target=yb if train else None, tf_ratio=tf_ratio)
            loss   = criterion(pred, yb)
            if train:
                optimizer.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                optimizer.step()
            total_loss += loss.item() * len(xb)
    return total_loss / len(loader.dataset)


print("\nTraining...\n")
print(f"{'Epoch':>6}  {'TF':>5}  {'Train MSE':>10}  {'Val MSE':>10}  {'LR':>10}  {'Time':>7}")
print("-" * 60)

best_val_loss     = float("inf")
epochs_no_improve = 0
log_rows          = []

for epoch in range(1, MAX_EPOCHS + 1):
    tf      = teacher_forcing_ratio(epoch)
    t0      = time.time()
    tr_loss = run_epoch(train_loader, train=True,  tf_ratio=tf)
    va_loss = run_epoch(val_loader,   train=False, tf_ratio=0.0)
    scheduler.step(va_loss)

    lr      = optimizer.param_groups[0]["lr"]
    elapsed = time.time() - t0
    print(f"{epoch:>6}  {tf:>5.2f}  {tr_loss:>10.6f}  {va_loss:>10.6f}  {lr:>10.2e}  {elapsed:>5.1f}s")
    log_rows.append({"epoch": epoch, "tf_ratio": tf,
                     "train_mse": tr_loss, "val_mse": va_loss, "lr": lr})

    if va_loss < best_val_loss:
        best_val_loss     = va_loss
        epochs_no_improve = 0
        torch.save(model.state_dict(), CHECKPOINT)
    else:
        epochs_no_improve += 1
        if epochs_no_improve >= PATIENCE:
            print(f"\nEarly stopping at epoch {epoch}")
            break

# ---------------------------------------------------------------------------
# 5. Save training log + curves
# ---------------------------------------------------------------------------
log_df = pd.DataFrame(log_rows)
log_df.to_csv(MODEL_DIR / "training_log.csv", index=False)

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(9, 4))
    ax.plot(log_df["epoch"], log_df["train_mse"], label="Train MSE")
    ax.plot(log_df["epoch"], log_df["val_mse"],   label="Val MSE")
    ax.set_xlabel("Epoch"); ax.set_ylabel("MSE (scaled)")
    ax.set_title("Autoregressive LSTM Training Curves")
    ax.legend(); ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(MODEL_DIR / "training_curves.png", dpi=120)
    print("Saved training_curves.png")
except ImportError:
    print("matplotlib not found — skipping plot")

# ---------------------------------------------------------------------------
# 6. Test set evaluation  (compute per-feature RMSE and sigma_ref)
# ---------------------------------------------------------------------------
print("\nEvaluating on test set...")
model.load_state_dict(torch.load(CHECKPOINT, weights_only=True))
model.eval()

all_preds, all_targets = [], []
with torch.no_grad():
    for xb, yb in test_loader:
        all_preds.append(model(xb.to(DEVICE)).cpu().numpy())
        all_targets.append(yb.numpy())

preds   = np.concatenate(all_preds)    # (N, horizon, F)
targets = np.concatenate(all_targets)

preds_real   = scaler.inverse_transform(
    preds.reshape(-1, N_FEATURES)).reshape(-1, HORIZON, N_FEATURES)
targets_real = scaler.inverse_transform(
    targets.reshape(-1, N_FEATURES)).reshape(-1, HORIZON, N_FEATURES)

# sigma_ref: per-feature RMSE in scaled space (used by predict_1h.py adaptive blending)
sigma_ref = []
for i in range(N_FEATURES):
    rmse_scaled = float(np.sqrt(np.mean((preds[:, :, i] - targets[:, :, i]) ** 2)))
    sigma_ref.append(rmse_scaled)

metrics = {
    "overall_scaled": {
        "mse": round(float(np.mean((preds - targets) ** 2)), 6),
        "mae": round(float(np.mean(np.abs(preds - targets))), 6),
    },
    "per_feature_real_units": {},
    "sigma_ref": sigma_ref,
}

print(f"\n{'Feature':<22}  {'MSE':>10}  {'MAE':>10}  {'RMSE':>10}  {'sigma_ref(scaled)':>18}")
print("-" * 74)
for i, col in enumerate(FEATURE_COLS):
    mse  = float(np.mean((preds_real[:, :, i] - targets_real[:, :, i]) ** 2))
    mae  = float(np.mean(np.abs(preds_real[:, :, i] - targets_real[:, :, i])))
    rmse = float(np.sqrt(mse))
    metrics["per_feature_real_units"][col] = {
        "mse": round(mse, 6), "mae": round(mae, 6), "rmse": round(rmse, 6)
    }
    print(f"{col:<22}  {mse:>10.4f}  {mae:>10.4f}  {rmse:>10.4f}  {sigma_ref[i]:>14.6f}")

with open(MODEL_DIR / "eval_metrics.json", "w") as f:
    json.dump(metrics, f, indent=2)

print(f"\nBest val MSE  : {best_val_loss:.6f}")
print(f"Files saved to: {MODEL_DIR}")
for fp in sorted(MODEL_DIR.iterdir()):
    print(f"  {fp.name:<35}  {fp.stat().st_size / 1024:>8.1f} KB")
