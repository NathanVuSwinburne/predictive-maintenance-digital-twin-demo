"""ML input/output schemas."""
from __future__ import annotations

from pydantic import BaseModel


class MLInput(BaseModel):
    """Feature vector for AI4I 2020 trained models.

    Field order and names match the training pipeline in ml_training/train.py:
      [air_temp_k, process_temp_k, rotational_speed, torque, tool_wear, power_kW, type_enc]

    power_kW is derived inside run_prediction() — do not pass it here.
    type_enc: 0=L (low quality), 1=M (medium), 2=H (high).
    """
    air_temp_k: float = 0.0        # Air temperature [K]
    process_temp_k: float = 0.0    # Process temperature [K]
    rotational_speed: float = 0.0  # Rotational speed [rpm]
    torque: float = 0.0            # Torque [Nm]
    tool_wear: float = 0.0         # Tool wear [min]
    type_enc: float = 0.0          # Product type encoded: L=0, M=1, H=2


class MLOutput(BaseModel):
    failure_probability: float       # 0-1
    failure_type: str                 # e.g. "Tool Wear Failure"
    confidence: float                 # 0-1
    severity: str                     # low / medium / high / critical
