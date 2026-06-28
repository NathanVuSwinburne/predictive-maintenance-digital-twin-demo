from __future__ import annotations

import numpy as np

from app.domain.schemas import PredictionRange
from app.ml import manual_prediction


class _IdentityScaler:
    def __init__(self) -> None:
        self.last_input: np.ndarray | None = None

    def transform(self, values: np.ndarray) -> np.ndarray:
        self.last_input = np.array(values, copy=True)
        return np.array(values, copy=True)


class _StubClassifier:
    def predict_proba(self, values: np.ndarray) -> np.ndarray:
        return np.array([[0.2, 0.7, 0.1]], dtype=np.float32)


def _ranges() -> dict[str, PredictionRange]:
    return {
        "vibrationX": PredictionRange(
            observedMin=0.0,
            observedMax=10.0,
            recommendedMin=0.5,
            recommendedMax=9.5,
            typicalValue=2.0,
        ),
        "vibrationY": PredictionRange(
            observedMin=0.0,
            observedMax=10.0,
            recommendedMin=0.5,
            recommendedMax=9.5,
            typicalValue=2.0,
        ),
        "vibrationZ": PredictionRange(
            observedMin=0.0,
            observedMax=10.0,
            recommendedMin=0.5,
            recommendedMax=9.5,
            typicalValue=2.0,
        ),
        "temperature": PredictionRange(
            observedMin=20.0,
            observedMax=50.0,
            recommendedMin=25.0,
            recommendedMax=45.0,
            typicalValue=30.0,
        ),
    }


def test_machine_c_reference_window_preserves_variation_and_matches_input(monkeypatch) -> None:
    base_window = np.column_stack(
        [
            np.linspace(1.0, 2.19, 120, dtype=np.float32),
            np.linspace(2.0, 3.19, 120, dtype=np.float32),
            np.linspace(3.0, 4.19, 120, dtype=np.float32),
            np.linspace(30.0, 31.19, 120, dtype=np.float32),
        ]
    )
    monkeypatch.setattr(
        manual_prediction,
        "_machine_c_reference_library",
        lambda: {
            "session_windows": {7: base_window},
            "candidate_vectors": np.array([base_window[-1]], dtype=np.float32),
            "candidate_session_ids": np.array([7], dtype=np.int32),
            "candidate_end_indices": np.array([119], dtype=np.int32),
            "feature_scale": np.ones(4, dtype=np.float32),
        },
    )

    target = np.array([5.0, 6.0, 7.0, 35.0], dtype=np.float32)
    shifted = manual_prediction._machine_c_reference_window(target)

    assert shifted.shape == (120, 4)
    np.testing.assert_allclose(shifted[-1], target)
    assert float(np.std(shifted[:, 0])) > 0.0


def test_machine_c_manual_prediction_uses_high_risk_probability_and_label_confidence(monkeypatch) -> None:
    scaler = _IdentityScaler()
    classifier = _StubClassifier()
    base_window = np.column_stack(
        [
            np.linspace(1.0, 2.19, 120, dtype=np.float32),
            np.linspace(2.0, 3.19, 120, dtype=np.float32),
            np.linspace(3.0, 4.19, 120, dtype=np.float32),
            np.linspace(30.0, 31.19, 120, dtype=np.float32),
        ]
    )

    monkeypatch.setattr(manual_prediction, "_machine_c_ranges", _ranges)
    monkeypatch.setattr(
        manual_prediction,
        "_machine_c_classifier_bundle",
        lambda: (classifier, scaler, {"low": 0, "medium": 1, "high": 2}),
    )
    monkeypatch.setattr(
        manual_prediction,
        "_machine_c_reference_window",
        lambda vector: base_window + (vector - base_window[-1])[np.newaxis, :],
    )

    result = manual_prediction.predict(
        machine_id="machine-c",
        machine_type="real-sensor",
        values={
            "vibrationX": 5.0,
            "vibrationY": 6.0,
            "vibrationZ": 7.0,
            "temperature": 35.0,
        },
    )

    assert result.predictedLabel == "medium"
    assert result.failureProbability == 0.1
    assert result.confidence == 0.7
    assert scaler.last_input is not None
    np.testing.assert_allclose(scaler.last_input[-1], np.array([5.0, 6.0, 7.0, 35.0], dtype=np.float32))
    assert float(np.std(scaler.last_input[:, 0])) > 0.0
