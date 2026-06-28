---
wiki: supervisor
type: reference
updated: 2026-06-01
---

# Error Handling

| Error message | Cause | Recovery |
|---|---|---|
| `"Machine 'X' not found"` | Passed display name instead of machine_id | Check [[machine-capabilities]] for the correct `machine_id` (e.g. `machine-c`) and retry |
| `"Access denied for this machine"` | User lacks access | Tell user; don't retry |
| `"No telemetry available"` | No data in DB | Check machine status |
| `"ML prediction is not yet available"` | No trained model for this type | Explain; offer manual inspection |
| `"Simulation is only available for Machine C"` | Wrong machine | Offer `run_failure_prediction` instead |
| `"Prediction not supported for machine type 'synthetic'"` | Machine B asked for prediction | Explain synthetic-only nature |
| `"Knowledge base not configured"` | Env var not set | Knowledge tools unavailable; answer from context |
| `"Note 'X' not found"` | Wrong note title | Call `list_knowledge_notes` for valid titles |

## Rule: never retry the exact same failed call.
