"""
train_classifier.py
===================
XGBoost multiclass classifier for machine state prediction.

Pipeline context
----------------
  LSTM predicted window (120, 4)
      --> feature aggregation (same as preprocess_classifier.py)
      --> this classifier
      --> confidence scores [P(low), P(medium), P(high)]

Classes : low=0  medium=1  high=2
Input   : 39 features (30 sensor aggregations + 9 Melbourne weather)
Output  : softmax probabilities for each class

Class imbalance is accepted as reflecting real-world distribution.
XGBoost class weights applied to prevent complete suppression of minority classes.

Outputs saved to ml/models/classifier/
  classifier.joblib      -- trained XGBoost model
  eval_metrics.json      -- accuracy, per-class precision/recall/F1, AUC-OVR
  confusion_matrix.png   -- normalised confusion matrix heatmap
  feature_importance.png -- top-20 feature importances
"""

import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
)
from xgboost import XGBClassifier 

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT      = Path(__file__).resolve().parents[1]
DATA_DIR  = ROOT / "data"   / "processed" / "classifier"
MODEL_DIR = ROOT / "models" / "classifier"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Hyperparameters
# ---------------------------------------------------------------------------
EARLY_STOPPING_ROUNDS = 30

XGB_PARAMS = {
    "objective":            "multi:softprob",
    "num_class":            3,
    "eval_metric":          "mlogloss",
    "n_estimators":         500,
    "max_depth":            6,
    "learning_rate":        0.05,
    "subsample":            0.8,
    "colsample_bytree":     0.8,
    "min_child_weight":     5,
    "gamma":                0.1,
    "reg_alpha":            0.1,
    "reg_lambda":           1.0,
    "random_state":         42,
    "n_jobs":               -1,
    "device":               "cuda",
    "tree_method":          "hist",
    "early_stopping_rounds": EARLY_STOPPING_ROUNDS,
}

# ---------------------------------------------------------------------------
# 1. Load data
# ---------------------------------------------------------------------------
print("Loading preprocessed data...")
X_train = np.load(DATA_DIR / "X_train.npy")
y_train = np.load(DATA_DIR / "y_train.npy")
X_val   = np.load(DATA_DIR / "X_val.npy")
y_val   = np.load(DATA_DIR / "y_val.npy")
X_test  = np.load(DATA_DIR / "X_test.npy")
y_test  = np.load(DATA_DIR / "y_test.npy")

with open(DATA_DIR / "feature_names.json") as f:
    feature_names = json.load(f)
with open(DATA_DIR / "label_map.json") as f:
    label_map = json.load(f)

label_names = [k for k, v in sorted(label_map.items(), key=lambda x: x[1])]
n_classes   = len(label_map)

print(f"  Train : {X_train.shape}  labels: {np.bincount(y_train)}")
print(f"  Val   : {X_val.shape}  labels: {np.bincount(y_val)}")
print(f"  Test  : {X_test.shape}  labels: {np.bincount(y_test)}")

# ---------------------------------------------------------------------------
# 2. Train
#    Class imbalance accepted as reflecting real-world distribution.
#    No sample weights applied -- the label-stratified split ensures
#    each split has a representative mix of label groups.
# ---------------------------------------------------------------------------
print("\nTraining XGBoost classifier...")

model = XGBClassifier(**XGB_PARAMS)
model.fit(
    X_train, y_train,
    eval_set=[(X_val, y_val)],
    verbose=50,
)

print(f"\nBest iteration : {model.best_iteration}")
print(f"Best val mlogloss : {model.best_score:.6f}")

# ---------------------------------------------------------------------------
# 4. Evaluate on test set
# ---------------------------------------------------------------------------
print("\nEvaluating on test set...")

proba      = model.predict_proba(X_test)          # (N, 3)  confidence scores
y_pred     = np.argmax(proba, axis=1)

acc  = accuracy_score(y_test, y_pred)
report = classification_report(y_test, y_pred,
                                target_names=label_names,
                                output_dict=True)
cm   = confusion_matrix(y_test, y_pred, normalize="true")

# AUC one-vs-rest (handles multiclass)
try:
    auc = roc_auc_score(y_test, proba, multi_class="ovr", average="macro")
except Exception:
    auc = None

print(f"\nAccuracy : {acc:.4f}")
if auc:
    print(f"AUC-OVR  : {auc:.4f}")
print()
print(classification_report(y_test, y_pred, target_names=label_names))

# Confidence score sample (first 5 test windows)
print("Sample confidence scores (first 5 test windows):")
print(f"  {'True':>8}  {'Pred':>8}  {'P(low)':>8}  {'P(med)':>8}  {'P(high)':>8}")
for i in range(min(5, len(y_test))):
    true_label = label_names[y_test[i]]
    pred_label = label_names[y_pred[i]]
    print(f"  {true_label:>8}  {pred_label:>8}  "
          f"{proba[i,0]:>8.3f}  {proba[i,1]:>8.3f}  {proba[i,2]:>8.3f}")

# ---------------------------------------------------------------------------
# 5. Save model + metrics
# ---------------------------------------------------------------------------
joblib.dump(model, MODEL_DIR / "classifier.joblib")

metrics = {
    "accuracy": round(acc, 6),
    "auc_ovr_macro": round(auc, 6) if auc else None,
    "best_xgb_iteration": int(model.best_iteration),
    "best_val_mlogloss": round(model.best_score, 6),
    "per_class": {
        cls: {k: round(v, 6) for k, v in report[cls].items()}
        for cls in label_names
    },
    "confusion_matrix_normalised": cm.round(4).tolist(),
}

with open(MODEL_DIR / "eval_metrics.json", "w") as f:
    json.dump(metrics, f, indent=2)

# ---------------------------------------------------------------------------
# 6. Plots
# ---------------------------------------------------------------------------
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    # Confusion matrix
    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(cm, cmap="Blues", vmin=0, vmax=1)
    plt.colorbar(im, ax=ax)
    ax.set_xticks(range(n_classes))
    ax.set_yticks(range(n_classes))
    ax.set_xticklabels(label_names)
    ax.set_yticklabels(label_names)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.set_title("Confusion Matrix (normalised)")
    for i in range(n_classes):
        for j in range(n_classes):
            ax.text(j, i, f"{cm[i,j]:.2f}",
                    ha="center", va="center",
                    color="white" if cm[i,j] > 0.5 else "black")
    fig.tight_layout()
    fig.savefig(MODEL_DIR / "confusion_matrix.png", dpi=120)
    plt.close(fig)

    # Feature importance (top 20)
    importances = model.feature_importances_
    top_idx     = np.argsort(importances)[::-1][:20]
    fig, ax = plt.subplots(figsize=(9, 6))
    ax.barh(range(20), importances[top_idx][::-1])
    ax.set_yticks(range(20))
    ax.set_yticklabels([feature_names[i] for i in top_idx][::-1], fontsize=9)
    ax.set_xlabel("Importance (gain)")
    ax.set_title("Top 20 Feature Importances")
    fig.tight_layout()
    fig.savefig(MODEL_DIR / "feature_importance.png", dpi=120)
    plt.close(fig)

    print("\nSaved confusion_matrix.png and feature_importance.png")

except ImportError:
    print("\nmatplotlib not found -- skipping plots")

# ---------------------------------------------------------------------------
# 7. Summary
# ---------------------------------------------------------------------------
print(f"\nFiles saved to: {MODEL_DIR}")
for fp in sorted(MODEL_DIR.iterdir()):
    print(f"  {fp.name:<35}  {fp.stat().st_size/1024:>8.1f} KB")
