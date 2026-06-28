---
wiki: sql-agent
type: index
updated: 2026-06-01
---

# SQL Agent Wiki — Index

This wiki gives the SQL planner LLM everything it needs to generate correct query plans. Read this index first, then drill into pages relevant to the question.

## Pages

| Page | One-line summary |
|---|---|
| [[schema-reference]] | Every table, every column, data types and meanings |
| [[machine-routing]] | Which telemetry table to use for which machine |
| [[query-patterns]] | Worked examples — common query shapes with correct plans |
| [[gotchas]] | Things that commonly go wrong and how to avoid them |

## Quick rules (always apply)

1. Machine A → `machine_a_telemetry`. No timestamp column. Order by `udi`.
2. Machine B → `machine_b_telemetry`. Has `timestamp`. Order by `timestamp DESC`.
3. Machine C → `machine_c_telemetry`. Has `time_collected` (NOT `timestamp`). Order by `time_collected DESC`.
4. Person names are ONLY in `personas.name`. Never filter on `users.email` for a person's name.
5. `machines` has NO `user_id` or `persona_id`. Link via `user_machine_access → users → personas` (3 hops). Never use `history_events` for ownership queries.
6. Write SQL directly. Call `execute_read_only_sql` with a SELECT statement. Only SELECT is permitted.

See [[log]] for a record of wiki changes.
