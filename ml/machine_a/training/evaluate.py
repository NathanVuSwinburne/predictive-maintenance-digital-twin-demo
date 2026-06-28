"""Evaluate trained models and print detailed metrics.

Usage (from repo root):
    python ml/machine_a/training/evaluate.py
"""
from __future__ import annotations

import os
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.model_selection import cross_val_score, train_test_split

_TRAINING_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(_TRAINING_DIR)))
_DATA_PATH = os.path.join(_REPO_ROOT, "ml", "data", "raw_data", "ai4i2020.csv")
_MODELS_DIR = os.path.join(_REPO_ROOT, "apps", "backend", "models")

_TYPE_LABELS = [
    "Tool Wear Failure",
    "Heat Dissipation Failure",
    "Power Failure",
    "Overstrain Failure",
    "Random Failure",
]
_TYPE_COLS = ["TWF", "HDF", "PWF", "OSF", "RNF"]


def load_and_prepare():
    path = os.path.abspath(_DATA_PATH)
    if not os.path.exists(path):
        print(f"ERROR: Data not found at {path}")
        sys.exit(1)
    df = pd.read_csv(path)
    df.columns = [c.strip().replace(" [K]", "").replace(" [rpm]", "").replace(" [Nm]", "").replace(" [min]", "") for c in df.columns]

    feature_cols = []
    for col in ["Air temperature", "Process temperature", "Rotational speed", "Torque", "Tool wear"]:
        if col in df.columns:
            feature_cols.append(col)
    if "Rotational speed" in df.columns and "Torque" in df.columns:
        df["power_kW"] = df["Rotational speed"] * df["Torque"] / 9549.0
        feature_cols.append("power_kW")
    if "Type" in df.columns:
        df["type_enc"] = df["Type"].map({"L": 0, "M": 1, "H": 2}).fillna(0)
        feature_cols.append("type_enc")

    return df, feature_cols


def evaluate_binary(clf, X, y):
    print("\n" + "="*60)
    print("BINARY CLASSIFIER EVALUATION")
    print("="*60)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    y_pred = clf.predict(X_test)
    y_proba = clf.predict_proba(X_test)[:, 1]

    print(classification_report(y_test, y_pred, target_names=["No Failure", "Failure"]))
    print(f"ROC-AUC Score: {roc_auc_score(y_test, y_proba):.4f}")
    print("\nConfusion Matrix:")
    cm = confusion_matrix(y_test, y_pred)
    print(f"  TN={cm[0,0]}, FP={cm[0,1]}, FN={cm[1,0]}, TP={cm[1,1]}")

    cv_scores = cross_val_score(clf, X, y, cv=5, scoring="roc_auc")
    print(f"\n5-Fold CV ROC-AUC: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")


def evaluate_type(clf, df, feature_cols):
    print("\n" + "="*60)
    print("FAILURE TYPE CLASSIFIER EVALUATION")
    print("="*60)
    failure_mask = df["Machine failure"].values.astype(bool)
    X_type = df.iloc[failure_mask][feature_cols].values
    y_type = df[_TYPE_COLS].values.argmax(axis=1)[failure_mask]

    if len(X_type) < 10:
        print("Insufficient failure samples for reliable evaluation.")
        return

    X_train, X_test, y_train, y_test = train_test_split(X_type, y_type, test_size=0.2, random_state=42)
    y_pred = clf.predict(X_test)
    print(classification_report(y_test, y_pred, target_names=_TYPE_LABELS, zero_division=0))


def main():
    fc_path = os.path.join(_MODELS_DIR, "failure_classifier.joblib")
    tc_path = os.path.join(_MODELS_DIR, "failure_type_classifier.joblib")

    for path in [fc_path, tc_path]:
        if not os.path.exists(path):
            print(f"ERROR: Model not found at {path}. Run ml/machine_a/training/train.py first.")
            sys.exit(1)

    binary_clf = joblib.load(fc_path)
    type_clf = joblib.load(tc_path)

    df, feature_cols = load_and_prepare()

    if "Machine failure" not in df.columns:
        for alt in ["Machine Failure", "failure", "Failure"]:
            if alt in df.columns:
                df = df.rename(columns={alt: "Machine failure"})
                break

    X = df[feature_cols].values
    y = df["Machine failure"].values

    evaluate_binary(binary_clf, X, y)
    evaluate_type(type_clf, df, feature_cols)
    print("\nEvaluation complete.")


if __name__ == "__main__":
    main()
