---
wiki: supervisor
type: reference
updated: 2026-06-01
---

# Tool Catalog

There are 7 tools. All data retrieval goes through `query_database`.

## `query_database`
The single tool for ALL data retrieval. Pass your question in plain English — the SQL sub-agent
writes and executes the query, then returns a formatted result.

Example questions:
- `"list all machines, their IDs, types, and status"`
- `"latest 5 telemetry readings for machine-c"`
- `"telemetry summary (min/max/avg) for machine-c session 78"`
- `"recent predictions for machine-a last 7 days"`
- `"active recommendations for machine-c"`
- `"history events for machine-c last 30 days"`
- `"recent simulation runs for machine-c"`

Use this instead of any get_* tool. There are no separate get_machines, get_telemetry, etc.

## `run_failure_prediction(machine_id)`
Run ML inference on latest telemetry and persist the result.
- **`machine-a`**: snapshot multi-class classifier (failure type + probability). No time horizon.
- **`machine-c`**: session-trained model. Up to 1h horizon.
- **`machine-b`**: NOT SUPPORTED — explain to user and do not call.

## `run_simulation(machine_id, horizon_minutes=30)`
Project future risk via Machine C session simulation.
- **`machine-c` only.** Returns an error for `machine-a` and `machine-b`.
- `horizon_minutes`: 1–240. Default 30.

## `extract_signal_from_complaint`
Parse a free-text operator symptom into a structured signal (machine, symptom type, severity).
Call FIRST when the user describes a problem in natural language before fetching data.

## `propose_recommendation`
Draft a maintenance recommendation and persist it for human approval.
Use after you have telemetry, prediction, or simulation evidence. Never fabricate evidence.

## `list_knowledge_notes(namespace="supervisor")`
List available supervisor wiki pages. Omit `namespace` for the external project wiki.

## `read_knowledge_note(title, namespace="supervisor")`
Read a full wiki page by title. Follow [[wikilinks]] by calling this again with the linked title.
Start with `title="index"` to see all pages.
