"""Train failure classifiers on ai4i2020.csv.

Usage (from repo root):
    python ml/machine_a/training/train.py

Saves to:
    apps/backend/models/failure_classifier.joblib       — binary: failure / no-failure
    apps/backend/models/failure_type_classifier.joblib  — multiclass: which failure subtype
"""
from __future__ import annotations

import os
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_TRAINING_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(_TRAINING_DIR)))
_DATA_PATH = os.path.join(_REPO_ROOT, "ml", "data", "raw_data", "ai4i2020.csv")
_MODELS_DIR = os.path.join(_REPO_ROOT, "apps", "backend", "models")

os.makedirs(_MODELS_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Failure type labels (order must match inference.py _FAILURE_TYPES)
# ---------------------------------------------------------------------------

_TYPE_COLS = ["TWF", "HDF", "PWF", "OSF", "RNF"]
_TYPE_LABELS = [
    "Tool Wear Failure",
    "Heat Dissipation Failure",
    "Power Failure",
    "Overstrain Failure",
    "Random Failure",
]


def load_data(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    print(f"Loaded {len(df)} rows from {path}")
    print("Columns:", df.columns.tolist())
    return df


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Select and engineer features for training."""
    # Normalise column names (strip whitespace, brackets)
    df.columns = [c.strip().replace(" [K]", "").replace(" [rpm]", "").replace(" [Nm]", "").replace(" [min]", "") for c in df.columns]

    feature_cols = []
    # Temperature features
    for col in ["Air temperature", "Process temperature"]:
        if col in df.columns:
            feature_cols.append(col)

    # Other process params
    for col in ["Rotational speed", "Torque", "Tool wear"]:
        if col in df.columns:
            feature_cols.append(col)

    # Derived feature: power ≈ torque × angular_velocity
    if "Rotational speed" in df.columns and "Torque" in df.columns:
        df["power_kW"] = df["Rotational speed"] * df["Torque"] / 9549.0
        feature_cols.append("power_kW")

    # Type encoding (L=0, M=1, H=2)
    if "Type" in df.columns:
        df["type_enc"] = df["Type"].map({"L": 0, "M": 1, "H": 2}).fillna(0)
        feature_cols.append("type_enc")

    missing = [c for c in feature_cols if c not in df.columns]
    if missing:
        print(f"WARNING: Missing expected columns: {missing}")
        feature_cols = [c for c in feature_cols if c in df.columns]

    return df, feature_cols


def train_binary_classifier(X_train, y_train, X_test, y_test):
    print("\n--- Training binary failure classifier ---")
    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", GradientBoostingClassifier(n_estimators=200, learning_rate=0.05, max_depth=4, random_state=42)),
    ])
    pipe.fit(X_train, y_train)
    y_pred = pipe.predict(X_test)
    print(classification_report(y_test, y_pred, target_names=["No Failure", "Failure"]))
    return pipe


def train_type_classifier(df: pd.DataFrame, X_train, X_test, feature_cols, train_idx, test_idx):
    """Train on samples that actually failed — predict which type."""
    print("\n--- Training failure type classifier ---")

    # Build type target: argmax of failure type columns
    type_df = df[_TYPE_COLS].copy()
    y_type = type_df.values.argmax(axis=1)

    # Only train on failure rows
    failure_mask = df["Machine failure"].values.astype(bool)
    X_type = df.iloc[failure_mask][feature_cols].values
    y_type_f = y_type[failure_mask]

    if len(X_type) < 10:
        print("WARNING: Too few failure samples for type classifier. Training on all data.")
        X_type = df[feature_cols].values
        y_type_f = y_type

    X_tr, X_te, y_tr, y_te = train_test_split(X_type, y_type_f, test_size=0.2, random_state=42)

    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", RandomForestClassifier(n_estimators=200, random_state=42)),
    ])
    pipe.fit(X_tr, y_tr)
    y_pred = pipe.predict(X_te)
    print(classification_report(y_te, y_pred, labels=list(range(len(_TYPE_LABELS))), target_names=_TYPE_LABELS, zero_division=0))
    return pipe


def main():
    data_path = os.path.abspath(_DATA_PATH)
    if not os.path.exists(data_path):
        print(f"ERROR: Training data not found at {data_path}")
        print("Expected: ml/data/raw_data/ai4i2020.csv from repo root.")
        sys.exit(1)

    df = load_data(data_path)
    df, feature_cols = build_features(df)

    if "Machine failure" not in df.columns:
        # Try alternate names
        for alt in ["Machine Failure", "failure", "Failure"]:
            if alt in df.columns:
                df = df.rename(columns={alt: "Machine failure"})
                break

    print(f"\nFeature columns: {feature_cols}")
    print(f"Failure rate: {df['Machine failure'].mean()*100:.2f}%")

    X = df[feature_cols].values
    y = df["Machine failure"].values

    X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(
        X, y, np.arange(len(df)), test_size=0.2, random_state=42, stratify=y
    )

    binary_clf = train_binary_classifier(X_train, y_train, X_test, y_test)
    type_clf = train_type_classifier(df, X_train, X_test, feature_cols, idx_train, idx_test)

    fc_path = os.path.join(_MODELS_DIR, "failure_classifier.joblib")
    tc_path = os.path.join(_MODELS_DIR, "failure_type_classifier.joblib")

    joblib.dump(binary_clf, fc_path)
    joblib.dump(type_clf, tc_path)

    print(f"\nModels saved to {_MODELS_DIR}/")
    print(f"  {fc_path}")
    print(f"  {tc_path}")
    print("\nTraining complete. The API will load these models automatically on next start.")


if __name__ == "__main__":
    main()
