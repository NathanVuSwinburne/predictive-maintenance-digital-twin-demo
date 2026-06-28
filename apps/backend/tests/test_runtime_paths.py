from __future__ import annotations

from app.ml.manual_prediction import get_prediction_config
from app.runtime_paths import resolve_ml_path, resolve_ml_root


def test_resolve_ml_root_points_to_project_ml_directory() -> None:
    ml_root = resolve_ml_root()

    assert ml_root.name == "ml"
    assert (ml_root / "data" / "raw_data" / "ai4i2020.csv").exists()
    assert (ml_root / "machine_c" / "data" / "processed" / "forecast" / "config.json").exists()


def test_resolve_ml_path_uses_project_ml_directory() -> None:
    assert resolve_ml_path("data", "raw_data", "ai4i2020.csv").exists()
    assert resolve_ml_path("machine_c", "data", "processed", "forecast", "config.json").exists()


def test_machine_c_prediction_config_loads_from_available_processed_data() -> None:
    config = get_prediction_config("machine-c", "real-sensor")

    assert config.machineId == "machine-c"
    assert config.machineType == "real-sensor"
    assert [field.key for field in config.fields] == [
        "vibrationX",
        "vibrationY",
        "vibrationZ",
        "temperature",
    ]
