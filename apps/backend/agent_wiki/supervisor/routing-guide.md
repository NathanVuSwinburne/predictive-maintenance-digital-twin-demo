---
wiki: supervisor
type: concept
updated: 2026-06-01
---

# Routing Guide

## Step 1 — Identify the machine

Look up the exact `machine_id` in [[machine-capabilities]] before calling any action tool.
If the user is ambiguous, call `query_database("list all machines, their IDs, and status")`.
Always pass the `machine_id` (e.g. `machine-c`) — never the display name ("Machine C").

## Step 2 — Classify intent and route

| User intent | First tool | Follow-up chain |
|---|---|---|
| Current reading / temperature / vibration | `query_database("latest telemetry for <machine_id>")` | → `run_failure_prediction` if anomalous |
| Trends / min / max / average | `query_database("telemetry summary/aggregates for <machine_id> last N hours")` | |
| Risk / failure probability / health score | `run_failure_prediction(machine_id)` | → `propose_recommendation` if high/critical |
| What-if / scenario | `run_simulation(machine_id)` (Machine C only) | → `propose_recommendation` |
| Past incidents / maintenance history | `query_database("history events for <machine_id>")` | |
| Recent stored predictions | `query_database("recent predictions for <machine_id>")` | |
| Active recommendations | `query_database("active recommendations for <machine_id>")` | |
| Operator describes a symptom | `extract_signal_from_complaint` | → route from returned signal |
| Create / log a recommendation | `propose_recommendation` | |
| Domain / capability question | `list_knowledge_notes` → `read_knowledge_note` | |
| Unclear | `query_database("list all machines and status")` to orient, then re-route | |

## Standard chains

- **Anomaly investigation**: `query_database(telemetry)` → `run_failure_prediction` → `query_database(history)` → `propose_recommendation`
- **Complaint triage**: `extract_signal_from_complaint` → `query_database(telemetry)` → `run_failure_prediction`
- **Simulation flow**: `run_simulation` → `propose_recommendation`

## Capability guards

| Tool | Allowed machine_ids | Block for |
|---|---|---|
| `run_failure_prediction` | `machine-a`, `machine-c` | `machine-b` |
| `run_simulation` | `machine-c` only | `machine-a`, `machine-b` |
