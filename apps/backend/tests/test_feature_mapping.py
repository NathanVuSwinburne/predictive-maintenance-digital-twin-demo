from __future__ import annotations

import pytest

from app.ml.feature_mapping import RawModelReading, map_readings_to_profile
from app.ml.model_input_profiles import (
    MACHINE_C_PROFILE_ID,
    ModelFeatureRequirement,
    get_model_input_profile,
)


def _machine_c_profile():
    return get_model_input_profile(MACHINE_C_PROFILE_ID)


def test_maps_machine_c_readings_with_canonical_feature_names() -> None:
    result = map_readings_to_profile(
        [
            RawModelReading(
                timestamp="2026-06-05T10:00:00.000Z",
                values={
                    "VibrationX": 0.12,
                    "VibrationY": 0.09,
                    "VibrationZ": 0.11,
                    "Temperature": 42,
                },
            )
        ],
        _machine_c_profile(),
    )

    assert result.errors == []
    assert result.ignoredFields == []
    assert result.sourceFieldMap == {
        "VibrationX": ["VibrationX"],
        "VibrationY": ["VibrationY"],
        "VibrationZ": ["VibrationZ"],
        "Temperature": ["Temperature"],
    }
    assert result.readings[0].timestamp == "2026-06-05T10:00:00.000Z"
    assert result.readings[0].values == {
        "VibrationX": 0.12,
        "VibrationY": 0.09,
        "VibrationZ": 0.11,
        "Temperature": 42.0,
    }


def test_maps_machine_c_readings_with_alias_feature_names() -> None:
    result = map_readings_to_profile(
        [
            {
                "timestamp": "2026-06-05T10:00:00.500Z",
                "values": {
                    "vibration_x": 0.13,
                    "vibrationY": 0.1,
                    "vibration_z": 0.12,
                    "temp_c": 43.5,
                },
            }
        ],
        _machine_c_profile(),
    )

    assert result.errors == []
    assert result.sourceFieldMap == {
        "VibrationX": ["vibration_x"],
        "VibrationY": ["vibrationY"],
        "VibrationZ": ["vibration_z"],
        "Temperature": ["temp_c"],
    }
    assert result.readings[0].values == {
        "VibrationX": 0.13,
        "VibrationY": 0.1,
        "VibrationZ": 0.12,
        "Temperature": 43.5,
    }


def test_unknown_extra_fields_are_reported_without_failing_mapping() -> None:
    result = map_readings_to_profile(
        [
            {
                "timestamp": "2026-06-05T10:00:01.000Z",
                "values": {
                    "VibrationX": 0.14,
                    "VibrationY": 0.11,
                    "VibrationZ": 0.13,
                    "Temperature": 44.0,
                    "Humidity": 55,
                    "PowerDraw": 1.5,
                },
            },
            {
                "timestamp": "2026-06-05T10:00:01.500Z",
                "values": {
                    "VibrationX": 0.15,
                    "VibrationY": 0.12,
                    "VibrationZ": 0.14,
                    "Temperature": 44.1,
                    "PowerDraw": 1.6,
                },
            },
        ],
        _machine_c_profile(),
    )

    assert result.errors == []
    assert result.ignoredFields == ["Humidity", "PowerDraw"]
    assert len(result.readings) == 2


def test_missing_required_feature_returns_clear_error() -> None:
    result = map_readings_to_profile(
        [
            {
                "timestamp": "2026-06-05T10:00:02.000Z",
                "values": {
                    "VibrationX": 0.16,
                    "VibrationY": 0.13,
                    "Temperature": 44.2,
                },
            }
        ],
        _machine_c_profile(),
    )

    assert result.readings == []
    assert result.errors == ["Reading 0 is missing required feature 'VibrationZ'."]


@pytest.mark.parametrize(
    ("bad_value", "expected_type"),
    [
        (True, "bool"),
        (None, "NoneType"),
        ("44.2", "str"),
    ],
)
def test_non_numeric_required_values_return_clear_errors(
    bad_value: object,
    expected_type: str,
) -> None:
    result = map_readings_to_profile(
        [
            {
                "timestamp": "2026-06-05T10:00:02.500Z",
                "values": {
                    "VibrationX": 0.17,
                    "VibrationY": 0.14,
                    "VibrationZ": 0.15,
                    "Temperature": bad_value,
                },
            }
        ],
        _machine_c_profile(),
    )

    assert result.readings == []
    assert result.errors == [
        "Reading 0 field 'Temperature' mapped to required feature "
        f"'Temperature' must be a finite number; received {expected_type}."
    ]


def test_non_numeric_optional_values_are_skipped_without_failing_reading() -> None:
    profile = _machine_c_profile()
    profile.features.append(
        ModelFeatureRequirement(
            name="OptionalCurrent",
            label="Optional Current",
            aliases=["current"],
            unit="A",
            required=False,
        )
    )

    result = map_readings_to_profile(
        [
            {
                "timestamp": "2026-06-05T10:00:02.750Z",
                "values": {
                    "VibrationX": 0.18,
                    "VibrationY": 0.15,
                    "VibrationZ": 0.16,
                    "Temperature": 44.3,
                    "current": "not-yet-normalized",
                },
            }
        ],
        profile,
    )

    assert result.errors == []
    assert result.readings[0].values == {
        "VibrationX": 0.18,
        "VibrationY": 0.15,
        "VibrationZ": 0.16,
        "Temperature": 44.3,
    }
    assert "OptionalCurrent" not in result.sourceFieldMap


def test_non_object_values_return_clear_error() -> None:
    result = map_readings_to_profile(
        [{"timestamp": "2026-06-05T10:00:03.000Z", "values": "not-an-object"}],
        _machine_c_profile(),
    )

    assert result.readings == []
    assert result.errors == ["Reading 0 values must be an object of source fields."]


def test_unsupported_profile_lookup_is_not_owned_by_mapper() -> None:
    with pytest.raises(ValueError, match="Unsupported model input profile"):
        get_model_input_profile("future-live-machine-v1")
