---
wiki: supervisor
type: reference
updated: 2026-06-01
---

# Machine Capabilities

## Capability Matrix

| Machine | machine_id (DB primary key) | machine_type (DB) | Prediction | Simulation | Notes |
|---|---|---|---|---|---|
| Machine A | `machine-a` | `ai4i` | Snapshot classifier only — no time horizon | No | No timestamp; order by `udi` |
| Machine B | `machine-b` | `synthetic` | No | No | Fake Kaggle data; telemetry testing only |
| Machine C | `machine-c` | `real-sensor` | Yes — up to 1h horizon | Yes | Real client sensor; 500 ms/row |

> Always pass the `machine_id` (e.g. `machine-c`) — not the display name — when calling `run_simulation` or `run_failure_prediction`.

## Machine C session facts
- Sampling: 500 ms/row
- Median session: ~5 min (~600 rows)
- Session gaps: ~4 days
- Longest session: ~1h20 (session 68)
- Telemetry window: anchored to most recent reading, not wall-clock time
