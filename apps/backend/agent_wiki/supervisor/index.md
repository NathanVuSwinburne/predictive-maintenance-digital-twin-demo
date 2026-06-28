---
wiki: supervisor
type: index
updated: 2026-06-01
---

# Supervisor Agent Wiki — Index

This wiki helps the supervisor agent decide which tools to call and how to chain them for any user request. Read this index first, then drill into the relevant page.

## Pages

| Page | One-line summary |
|---|---|
| [[routing-guide]] | Decision tree: user intent → which tool to call first |
| [[tool-catalog]] | Every tool: what it does, when to use it, known gotchas |
| [[machine-capabilities]] | What each machine supports — prediction, simulation, telemetry |
| [[error-handling]] | Common errors and recovery strategies |

## Quick rules (always apply)

- `run_failure_prediction`: Machine A and Machine C only. Never call for Machine B.
- `run_simulation`: Machine C only.
- Machine B telemetry is readable but fake — never offer prediction or simulation for it.
- For Machine C telemetry, pass `window_hours=2` to cover a full session.

See [[log]] for a chronological record of wiki updates.
