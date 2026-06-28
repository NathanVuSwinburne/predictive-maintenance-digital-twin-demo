"""Generate synthetic Machine C demo sensor data matching original sensordata schema."""

import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

SEED = 42
random.seed(SEED)

try:
    import numpy as np
    np.random.seed(SEED)
    USE_NUMPY = True
except ImportError:
    USE_NUMPY = False

OUTPUT = Path(__file__).parent.parent.parent / "data" / "raw_data" / "sensordata_demo.csv"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

SESSIONS = 10
ROWS_PER_SESSION = 50
START = datetime(2024, 1, 1)

# label distribution across sessions: 6 low, 3 medium, 1 high
SESSION_LABELS = (["low"] * 6) + (["medium"] * 3) + ["high"]
random.shuffle(SESSION_LABELS)

PARAMS = {
    "low":    {"vib_mean": 0.02, "vib_std": 0.005, "temp_mean": 35.0, "temp_std": 2.0},
    "medium": {"vib_mean": 0.08, "vib_std": 0.015, "temp_mean": 42.0, "temp_std": 3.0},
    "high":   {"vib_mean": 0.18, "vib_std": 0.030, "temp_mean": 55.0, "temp_std": 5.0},
}


def normal(mean, std):
    if USE_NUMPY:
        return float(np.random.normal(mean, std))
    # Box-Muller fallback
    import math
    u1, u2 = random.random(), random.random()
    z = math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)
    return mean + std * z


rows = []
for session_id in range(1, SESSIONS + 1):
    label = SESSION_LABELS[session_id - 1]
    p = PARAMS[label]
    t = START + timedelta(days=session_id - 1)
    for i in range(ROWS_PER_SESSION):
        rows.append({
            "session_id": session_id,
            "timestamp": (t + timedelta(seconds=i)).strftime("%Y-%m-%d %H:%M:%S"),
            "VibrationX": round(normal(p["vib_mean"], p["vib_std"]), 6),
            "VibrationY": round(normal(p["vib_mean"], p["vib_std"]), 6),
            "VibrationZ": round(normal(p["vib_mean"], p["vib_std"]), 6),
            "Temperature": round(normal(p["temp_mean"], p["temp_std"]), 4),
            "label": label,
        })

with open(OUTPUT, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

print(f"Generated {len(rows)} rows -> {OUTPUT}")
