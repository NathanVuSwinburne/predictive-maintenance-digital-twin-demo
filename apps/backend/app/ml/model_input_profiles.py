"""Model input profile contracts for prediction and forecasting windows."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


MACHINE_C_PROFILE_ID = "machine-c-forecast-v1"
MACHINE_C_FEATURE_COLS = ("VibrationX", "VibrationY", "VibrationZ", "Temperature")
MACHINE_C_SAMPLE_INTERVAL_MS = 500
MACHINE_C_CONTEXT_WINDOW_MINUTES = 20
MACHINE_C_CONTEXT_WINDOW_ROWS = (
    MACHINE_C_CONTEXT_WINDOW_MINUTES * 60_000
) // MACHINE_C_SAMPLE_INTERVAL_MS


class ModelFeatureRequirement(BaseModel):
    """A canonical model feature plus accepted source-name aliases."""

    name: str
    label: str
    aliases: list[str] = Field(default_factory=list)
    unit: str | None = None
    required: bool = True
    dataType: Literal["number"] = "number"


class ModelWindowRequirement(BaseModel):
    """Timing and size requirements for a model-ready input window."""

    sampleIntervalMs: int
    requiredContextRows: int
    contextWindowMinutes: int
    maxTimestampGapMs: int | None = None
    freshnessMaxAgeSeconds: int | None = None


class MissingDataPolicy(BaseModel):
    """Missing-value behavior expected before a model runtime is called."""

    policy: Literal["reject-required-missing"]
    allowNulls: bool = False
    allowNaN: bool = False


class ModelInputProfile(BaseModel):
    """Backend contract describing the prepared input a model expects."""

    id: str
    displayName: str
    supportedMachineIds: list[str] = Field(default_factory=list)
    supportedMachineTypes: list[str] = Field(default_factory=list)
    features: list[ModelFeatureRequirement]
    window: ModelWindowRequirement
    missingData: MissingDataPolicy


MACHINE_C_FORECAST_PROFILE = ModelInputProfile(
    id=MACHINE_C_PROFILE_ID,
    displayName="Machine C Forecast",
    supportedMachineIds=["machine-c"],
    supportedMachineTypes=["real-sensor", "kaggle"],
    features=[
        ModelFeatureRequirement(
            name="VibrationX",
            label="Vibration X",
            aliases=["VibrationX", "vibrationX", "vibration_x"],
            unit="g",
        ),
        ModelFeatureRequirement(
            name="VibrationY",
            label="Vibration Y",
            aliases=["VibrationY", "vibrationY", "vibration_y"],
            unit="g",
        ),
        ModelFeatureRequirement(
            name="VibrationZ",
            label="Vibration Z",
            aliases=["VibrationZ", "vibrationZ", "vibration_z"],
            unit="g",
        ),
        ModelFeatureRequirement(
            name="Temperature",
            label="Temperature",
            aliases=["Temperature", "temperature", "temp", "temp_c"],
            unit="°C",
        ),
    ],
    window=ModelWindowRequirement(
        sampleIntervalMs=MACHINE_C_SAMPLE_INTERVAL_MS,
        requiredContextRows=MACHINE_C_CONTEXT_WINDOW_ROWS,
        contextWindowMinutes=MACHINE_C_CONTEXT_WINDOW_MINUTES,
        maxTimestampGapMs=MACHINE_C_SAMPLE_INTERVAL_MS * 2,
        freshnessMaxAgeSeconds=None,
    ),
    missingData=MissingDataPolicy(policy="reject-required-missing"),
)

_PROFILES = {MACHINE_C_FORECAST_PROFILE.id: MACHINE_C_FORECAST_PROFILE}


def list_model_input_profiles() -> list[ModelInputProfile]:
    return [profile.model_copy(deep=True) for profile in _PROFILES.values()]


def get_model_input_profile(profile_id: str) -> ModelInputProfile:
    try:
        return _PROFILES[profile_id].model_copy(deep=True)
    except KeyError as exc:
        raise ValueError(f"Unsupported model input profile: {profile_id}") from exc


def get_profile_for_machine(
    machine_id: str | None = None,
    machine_type: str | None = None,
) -> ModelInputProfile:
    if machine_id is None and machine_type is None:
        raise ValueError("machine_id or machine_type is required to resolve a profile.")

    for profile in _PROFILES.values():
        machine_id_matches = (
            machine_id is None or machine_id in profile.supportedMachineIds
        )
        machine_type_matches = (
            machine_type is None or machine_type in profile.supportedMachineTypes
        )
        if machine_id_matches and machine_type_matches:
            return profile.model_copy(deep=True)

    raise ValueError(
        "No model input profile registered for "
        f"machine_id={machine_id!r}, machine_type={machine_type!r}."
    )
