---
wiki: sql-agent
type: reference
updated: 2026-06-01
---

# Gotchas

Known traps that cause wrong or broken query plans.

## Timestamp column names differ per machine

| Machine | Correct column | WRONG |
|---|---|---|
| Machine A | NO timestamp — order by `udi` | ~~`timestamp`~~ |
| Machine B | `timestamp` | |
| Machine C | `time_collected` | ~~`timestamp`~~ |

**If you write `ORDER BY timestamp DESC` for Machine C, the query will fail.** Always use `time_collected` for Machine C.

## Person names are ONLY in `personas.name`

`users.email` is a login email like `john@example.com`, not a person's name. If the question names a person ("Alex Chen"), filter on `personas.name`, not `users.email` or `users.id`.

## `machines` has no direct link to personas

There is NO `user_id` or `persona_id` column on the `machines` table. To link a machine to a person, join through `user_machine_access → users → personas` (3 hops):

```sql
SELECT m.id, m.name, m.status
FROM machines m
JOIN user_machine_access uma ON m.id = uma.machine_id
JOIN users u ON uma.user_id = u.id
JOIN personas p ON u.persona_id = p.id
WHERE p.name = 'Alex Chen'
```

**Do NOT join through `history_events`** for ownership/access queries. `history_events` is an audit log — it records things that happened (simulations, predictions, maintenance), not who has access to a machine.

## machines.id values are lowercase with hyphens

Valid IDs: `"machine-a"`, `"machine-b"`, `"machine-c"`. Any capitalisation (`"Machine-A"`) will match nothing.

## Base table must own the answer columns

Set `"table"` to the table that DIRECTLY contains the columns you are returning, not the table you are filtering on.

- "What machines does Alex Chen work on?" → `table: "machines"` (you return machine columns), filter via joined `personas`
- "What is Alex Chen's shift?" → `table: "personas"` (you return persona columns), no join needed

## Do NOT join when a single table suffices

Only add joins when the answer requires columns from two or more tables. Unnecessary joins inflate the plan and introduce column ambiguity.

## Qualify column names in joins

When joining, prefix ALL column names with `"table.column"` in both `"columns"` and `"filters"` to avoid ambiguity. Example: `"machines.name"` not `"name"` when joining with personas.

## Machine B is synthetic — no prediction or simulation

Machine B (`machine_type = "synthetic"`) has no trained model. Do not suggest querying `predictions` for Machine B expecting meaningful results from `run_failure_prediction`.

## Machine C sessions vs. continuous data

Machine C data is organised in sessions separated by ~4-day gaps. Filtering by `session_id` is the correct way to scope to one session. Don't assume rows are continuous when computing time differences.

## PostgreSQL does not support ROUND(double precision, integer)

`ROUND(x, 2)` fails on `double precision` columns with:
`ERROR: function round(double precision, integer) does not exist`

**Always cast to numeric first:**
```sql
ROUND(x::numeric, 2)          -- correct
ROUND(x, 2)                    -- WRONG on float columns
```

This applies to any `Float` column (risk_score, health_score, vibration_*, temperature, etc.).
