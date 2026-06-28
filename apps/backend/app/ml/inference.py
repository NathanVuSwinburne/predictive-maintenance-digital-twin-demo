"""ML inference module.

Loads trained scikit-learn models from models/ at startup. If models are not
present, raises MLNotAvailableError rather than crashing or fabricating results.

IMPORTANT: The LLM is NEVER used to generate predictions. Only this module
produces failure probabilities and failure type classifications.
"""
from __future__ import annotations

import os
import logging
from typing import Optional

import joblib
import numpy as np

from app.ml.schemas import MLInput, MLOutput
from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Custom error
# ---------------------------------------------------------------------------

class MLNotAvailableError(Exception):
    """Raised when ML models have not been trained / loaded yet."""
    pass


# ---------------------------------------------------------------------------
# Singleton model holder
# ---------------------------------------------------------------------------

class _ModelStore:
    def __init__(self) -> None:
        self.failure_classifier = None   # binary: failure / no-failure
        self.type_classifier = None      # multiclass: failure subtype
        self.loaded = False

    def load(self) -> None:
        models_dir = settings.models_path()
        fc_path = os.path.join(models_dir, "failure_classifier.joblib")
        tc_path = os.path.join(models_dir, "failure_type_classifier.joblib")

        if not os.path.exists(fc_path) or not os.path.exists(tc_path):
            logger.warning(
                "ML models not found at %s. Run ml/machine_a/training/train.py to generate them.",
                models_dir,
            )
            self.loaded = False
            return

        try:
            self.failure_classifier = joblib.load(fc_path)
            self.type_classifier = joblib.load(tc_path)
            self.loaded = True
            logger.info("ML models loaded from %s", models_dir)
        except Exception as exc:
            logger.error("Failed to load ML models: %s", exc)
            self.loaded = False


_store = _ModelStore()


def load_models() -> None:
    """Called at app startup."""
    _store.load()


# ---------------------------------------------------------------------------
# Failure type labels
# ---------------------------------------------------------------------------

_FAILURE_TYPES = [
    "Tool Wear Failure",
    "Heat Dissipation Failure",
    "Power Failure",
    "Overstrain Failure",
    "Random Failure",
]

_SEVERITY_MAP = {
    (0.0, 0.3): "low",
    (0.3, 0.6): "medium",
    (0.6, 0.85): "high",
    (0.85, 1.01): "critical",
}


def _severity(prob: float) -> str:
    for (lo, hi), label in _SEVERITY_MAP.items():
        if lo <= prob < hi:
            return label
    return "critical"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_prediction(inp: MLInput) -> MLOutput:
    """Run failure prediction.

    Raises MLNotAvailableError if models have not been loaded.
    """
    if not _store.loaded:
        raise MLNotAvailableError(
            "ML models are not available. Train them with: python ml/machine_a/training/train.py"
        )

    # Feature vector must match training order (see ml/machine_a/training/train.py build_features):
    # [Air temperature, Process temperature, Rotational speed, Torque, Tool wear, power_kW, type_enc]
    power_kw = inp.rotational_speed * inp.torque / 9549.0
    features = np.array([[
        inp.air_temp_k,
        inp.process_temp_k,
        inp.rotational_speed,
        inp.torque,
        inp.tool_wear,
        power_kw,
        inp.type_enc,
    ]])

    # Binary failure probability
    failure_proba = float(_store.failure_classifier.predict_proba(features)[0][1])

    # Failure type (multiclass)
    type_idx = int(_store.type_classifier.predict(features)[0])
    failure_type = _FAILURE_TYPES[type_idx] if type_idx < len(_FAILURE_TYPES) else "Unknown"

    # Confidence: use max class probability from type classifier
    type_proba = _store.type_classifier.predict_proba(features)[0]
    confidence = float(np.max(type_proba))

    return MLOutput(
        failure_probability=round(failure_proba, 4),
        failure_type=failure_type,
        confidence=round(confidence, 4),
        severity=_severity(failure_proba),
    )


def run_prediction_with_decision(inp: MLInput) -> tuple[MLOutput, bool]:
    """Run AI4I prediction and expose the binary classifier decision boundary."""
    result = run_prediction(inp)

    power_kw = inp.rotational_speed * inp.torque / 9549.0
    features = np.array([[
        inp.air_temp_k,
        inp.process_temp_k,
        inp.rotational_speed,
        inp.torque,
        inp.tool_wear,
        power_kw,
        inp.type_enc,
    ]])

    predicted_failure = bool(_store.failure_classifier.predict(features)[0])
    return result, predicted_failure
