from __future__ import annotations

import pytest

from app.ml import machine_c_simulation
from app.ml.model_input_profiles import (
    MACHINE_C_CONTEXT_WINDOW_MINUTES,
    MACHINE_C_CONTEXT_WINDOW_ROWS,
    MACHINE_C_FEATURE_COLS,
    MACHINE_C_PROFILE_ID,
    MACHINE_C_SAMPLE_INTERVAL_MS,
    get_model_input_profile,
    get_profile_for_machine,
    list_model_input_profiles,
)


def test_machine_c_profile_is_registered_and_discoverable() -> None:
    profiles = list_model_input_profiles()
    profile_ids = [profile.id for profile in profiles]

    assert MACHINE_C_PROFILE_ID in profile_ids
    assert get_model_input_profile(MACHINE_C_PROFILE_ID).id == MACHINE_C_PROFILE_ID


def test_machine_c_profile_matches_current_simulation_runtime() -> None:
    profile = get_model_input_profile(MACHINE_C_PROFILE_ID)

    feature_names = [feature.name for feature in profile.features]

    assert feature_names == list(MACHINE_C_FEATURE_COLS)
    assert feature_names == machine_c_simulation.FEATURE_COLS
    assert profile.window.sampleIntervalMs == MACHINE_C_SAMPLE_INTERVAL_MS
    assert profile.window.sampleIntervalMs == machine_c_simulation.STEP_MS
    assert profile.window.requiredContextRows == MACHINE_C_CONTEXT_WINDOW_ROWS
    assert profile.window.contextWindowMinutes == MACHINE_C_CONTEXT_WINDOW_MINUTES
    assert profile.missingData.policy == "reject-required-missing"
    assert profile.missingData.allowNulls is False
    assert profile.missingData.allowNaN is False


def test_machine_c_profile_defines_units_and_current_aliases() -> None:
    profile = get_model_input_profile(MACHINE_C_PROFILE_ID)
    features = {feature.name: feature for feature in profile.features}

    assert features["VibrationX"].unit == "g"
    assert features["VibrationY"].unit == "g"
    assert features["VibrationZ"].unit == "g"
    assert features["Temperature"].unit == "°C"
    assert {"VibrationX", "vibrationX", "vibration_x"}.issubset(
        set(features["VibrationX"].aliases)
    )
    assert {"Temperature", "temperature"}.issubset(
        set(features["Temperature"].aliases)
    )


def test_unsupported_profile_id_raises_clear_error() -> None:
    with pytest.raises(ValueError, match="Unsupported model input profile"):
        get_model_input_profile("future-live-machine-v1")


def test_profile_lookups_do_not_return_mutable_registry_instances() -> None:
    profile = get_model_input_profile(MACHINE_C_PROFILE_ID)
    profile.features[0].aliases.append("mutated_alias")

    fresh_profile = get_model_input_profile(MACHINE_C_PROFILE_ID)

    assert "mutated_alias" not in fresh_profile.features[0].aliases


def test_profile_listing_does_not_return_mutable_registry_instances() -> None:
    profiles = list_model_input_profiles()
    machine_c_profile = next(
        profile for profile in profiles if profile.id == MACHINE_C_PROFILE_ID
    )
    machine_c_profile.features[0].aliases.append("listed_mutated_alias")

    fresh_profile = get_model_input_profile(MACHINE_C_PROFILE_ID)

    assert "listed_mutated_alias" not in fresh_profile.features[0].aliases


def test_machine_c_can_be_resolved_by_machine_id_and_type() -> None:
    profile = get_profile_for_machine(machine_id="machine-c", machine_type="real-sensor")

    assert profile.id == MACHINE_C_PROFILE_ID


def test_machine_resolution_does_not_return_mutable_registry_instances() -> None:
    profile = get_profile_for_machine(machine_id="machine-c", machine_type="real-sensor")
    profile.features[0].aliases.append("resolved_mutated_alias")

    fresh_profile = get_profile_for_machine(
        machine_id="machine-c", machine_type="real-sensor"
    )

    assert "resolved_mutated_alias" not in fresh_profile.features[0].aliases


def test_unknown_machine_resolution_raises_clear_error() -> None:
    with pytest.raises(ValueError, match="No model input profile registered"):
        get_profile_for_machine(machine_id="machine-a", machine_type="ai4i")
