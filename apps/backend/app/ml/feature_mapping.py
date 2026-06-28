"""Profile-driven feature mapping for model input windows."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
import math
from typing import Any

from pydantic import BaseModel, Field

from app.ml.model_input_profiles import ModelInputProfile


class RawModelReading(BaseModel):
    timestamp: str
    values: dict[str, Any]


class MappedModelReading(BaseModel):
    timestamp: str
    values: dict[str, float]


class FeatureMappingResult(BaseModel):
    readings: list[MappedModelReading] = Field(default_factory=list)
    ignoredFields: list[str] = Field(default_factory=list)
    sourceFieldMap: dict[str, list[str]] = Field(default_factory=dict)
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


def _alias_lookup(profile: ModelInputProfile) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for feature in profile.features:
        for alias in [feature.name, *feature.aliases]:
            lookup[alias] = feature.name
    return lookup


def _reading_parts(reading: RawModelReading | Mapping[str, Any]) -> tuple[str, Any]:
    if isinstance(reading, RawModelReading):
        return reading.timestamp, reading.values
    if isinstance(reading, Mapping):
        timestamp = reading.get("timestamp")
        return str(timestamp) if timestamp is not None else "", reading.get("values")
    return "", None


def _is_numeric_model_value(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _format_value_error(index: int, feature_name: str, source_field: str, value: Any) -> str:
    return (
        f"Reading {index} field {source_field!r} mapped to required feature "
        f"{feature_name!r} must be a finite number; received {type(value).__name__}."
    )


def map_readings_to_profile(
    readings: Iterable[RawModelReading | Mapping[str, Any]],
    profile: ModelInputProfile,
) -> FeatureMappingResult:
    """Map raw source field names into canonical model feature names.

    This function does not parse or normalise timestamps beyond coercing mapping
    inputs to strings. Timestamp ordering, gaps, row counts, and freshness belong
    to the window validation layer.
    """

    lookup = _alias_lookup(profile)
    ignored_fields: set[str] = set()
    source_field_map: dict[str, set[str]] = {
        feature.name: set() for feature in profile.features
    }
    mapped_readings: list[MappedModelReading] = []
    errors: list[str] = []

    for index, reading in enumerate(readings):
        timestamp, values = _reading_parts(reading)
        if not isinstance(values, Mapping):
            errors.append(f"Reading {index} values must be an object of source fields.")
            continue

        known_source_fields = {
            source_field for source_field in values if source_field in lookup
        }
        ignored_fields.update(
            source_field for source_field in values if source_field not in lookup
        )

        mapped_values: dict[str, float] = {}
        reading_had_error = False

        for feature in profile.features:
            source_field = next(
                (
                    alias
                    for alias in [feature.name, *feature.aliases]
                    if alias in known_source_fields
                ),
                None,
            )
            if source_field is None:
                if feature.required:
                    errors.append(
                        f"Reading {index} is missing required feature {feature.name!r}."
                    )
                    reading_had_error = True
                continue

            value = values[source_field]
            if not _is_numeric_model_value(value):
                if feature.required:
                    errors.append(
                        _format_value_error(
                            index=index,
                            feature_name=feature.name,
                            source_field=source_field,
                            value=value,
                        )
                    )
                    reading_had_error = True
                continue

            mapped_values[feature.name] = float(value)
            source_field_map[feature.name].add(source_field)

        if not reading_had_error:
            ordered_values = {
                feature.name: mapped_values[feature.name]
                for feature in profile.features
                if feature.name in mapped_values
            }
            mapped_readings.append(
                MappedModelReading(timestamp=timestamp, values=ordered_values)
            )

    return FeatureMappingResult(
        readings=mapped_readings,
        ignoredFields=sorted(ignored_fields),
        sourceFieldMap={
            feature_name: sorted(source_fields)
            for feature_name, source_fields in source_field_map.items()
            if source_fields
        },
        errors=errors,
        warnings=[],
    )
