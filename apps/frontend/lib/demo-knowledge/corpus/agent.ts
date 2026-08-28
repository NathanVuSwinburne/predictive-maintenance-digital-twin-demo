/**
 * The `agent/` namespace — how the assistant works, rather than what it knows.
 *
 * Routing, the tool catalogue, the data contract, the traps. Deliberately rewritten for this demo
 * rather than carried over: the production vault's operational pages describe a real database and a
 * real fleet, and neither belongs in a public portfolio build.
 *
 * The assistant reads this namespace and never writes to it. Everything here is a convention a
 * person decided, so an agent editing it would be editing its own instructions.
 */

export const AGENT_PAGES: Record<string, string> = {
  "agent/supervisor/index": `---
title: Supervisor Wiki
namespace: agent/supervisor
type: index
tags: [agent, routing, meta]
relates_to:
  - "[[agent/sql/index]]"
updated: 2026-08-28
updated_by: seed
---

# Supervisor Wiki — Index

How the supervisor decides which tool to call and how to chain them. Read this index first, then
drill into the page you need.

| Page | One line |
|---|---|
| [[agent/supervisor/routing-guide]] | User intent → which tool first, and what to write down afterwards |
| [[agent/supervisor/tool-catalog]] | Every tool: what it does, when to use it, what it will not do |
| [[agent/supervisor/machine-capabilities]] | What each registered machine supports |
| [[agent/supervisor/error-handling]] | Common failures and how to recover from them |

## Quick rules, always

- Pass the \`machine_id\` (\`mach-utility-pump\`), never the display name ("Utility Pump 02").
- Detection is available on all three machines. **Forecasting is not available on
  [[fleet/ai4i-milling-machine]]** — it has no time axis. Explain that rather than calling the tool.
- Every number you report needs the baseline it is being compared against. See
  [[concepts/class-imbalance-in-failure-data]].
- Conventions for the wiki itself live in [[AGENT-WIKI]]; the content catalogue is [[index]].

## What is different about this build

This is a **frontend-only demo**. There is no server, no database and no model server: the data
provider runs in the browser and every fixture is seeded, so the same question gives the same answer
on every load. The tool names and the chain shapes are the real ones; what sits behind them is not.
Say so if a user asks whether they are looking at live equipment.
`,

  "agent/supervisor/routing-guide": `---
title: Supervisor — Routing Guide
namespace: agent/supervisor
type: concept
tags: [agent, routing]
relates_to:
  - "[[agent/supervisor/tool-catalog]]"
  - "[[agent/supervisor/machine-capabilities]]"
updated: 2026-08-28
updated_by: seed
---

# Routing Guide

## Step 1 — identify the machine

Look up the exact \`machine_id\` in [[agent/supervisor/machine-capabilities]] before calling any
action tool. If the user is ambiguous, call \`query_database("list the machines, their ids and
status")\` first. Always pass the id, never the display name.

## Step 2 — classify the intent

| User intent | First tool | Chain |
|---|---|---|
| Current reading, temperature, vibration | \`query_database("latest telemetry for <id>")\` | → \`run_failure_prediction\` if it looks anomalous |
| Trend, min, max, average | \`query_database("telemetry summary for <id> over the last N hours")\` | |
| Risk, failure probability, health | \`run_failure_prediction(<id>)\` | → \`propose_recommendation\` when high |
| What-if, scenario, horizon | \`run_demo_simulation(<id>, horizon)\` | → \`propose_recommendation\` |
| Past incidents, maintenance history | \`query_database("history events for <id>")\` | |
| An operator describing a symptom | \`extract_signal_from_complaint\` | → route from the returned signal |
| A domain or capability question | \`search_knowledge\` → \`read_knowledge_note\` | → \`get_knowledge_graph\` if the answer spans pages |
| "What do we know about X?" | \`search_knowledge("X")\` | → \`read_knowledge_note\` on the top hit |
| Unclear | \`query_database("list the machines and status")\` to orient, then re-route | |

## Standard chains

- **Anomaly investigation** — \`query_database(telemetry)\` → \`run_failure_prediction\` →
  \`query_database(history)\` → \`propose_recommendation\`
- **Complaint triage** — \`extract_signal_from_complaint\` → \`query_database(telemetry)\` →
  \`run_failure_prediction\`
- **Knowledge lookup** — \`search_knowledge\` → \`read_knowledge_note\` → follow \`[[links]]\` and
  backlinks

Navigate before you search. \`index\` → the page → its outbound links is faster and more reliable
than a query, and it is the reason the wiki is interlinked at all.

## Step 3 — capture what is durable

After answering, ask whether this turn produced something still true next week: a diagnosis that
held, a threshold observed on a specific machine, a dataset quirk, a correction the user gave you.

| What you learned | Where it goes |
|---|---|
| How *this* machine actually behaves | the machine's \`fleet/\` page, under \`## Observations\` |
| A general failure mechanism or a standard | \`domain/\` |
| A modelling insight — imbalance, drift, leakage | \`concepts/\` |
| An external document you leaned on | \`sources/\` |

Then link it to what was already there. Nothing else re-derives it afterwards.

**Do not write** restatements of tool output, anything you are guessing at without marking
\`confidence: low\`, or anything naming a person. Do not write to \`agent/\` or \`raw/\` at all — see
[[AGENT-WIKI]].

## Capability guards

| Tool | Allowed | Refuse for |
|---|---|---|
| \`run_failure_prediction\` | all three machines | — |
| \`run_demo_simulation\` | \`mach-utility-pump\`, \`mach-packaging-drive\` | \`mach-ai4i-mill\` — no time axis |

Refusing is an answer. Explaining why a machine cannot be forecast is more useful than an error
message the user has to interpret.
`,

  "agent/supervisor/tool-catalog": `---
title: Supervisor — Tool Catalog
namespace: agent/supervisor
type: reference
tags: [agent, tools]
relates_to:
  - "[[agent/supervisor/routing-guide]]"
  - "[[agent/sql/index]]"
updated: 2026-08-28
updated_by: seed
---

# Tool Catalog

All data retrieval goes through \`query_database\`. The wiki is read *and* written through the
knowledge tools at the bottom.

## \`query_database(question)\`

The single tool for all data retrieval. Ask in plain English; the SQL sub-agent plans the query,
runs it read-only, and returns a formatted result. There are no separate \`get_machines\`,
\`get_telemetry\` tools.

Examples:

- \`"list the machines, their ids, types and status"\`
- \`"latest 5 telemetry readings for mach-packaging-drive"\`
- \`"telemetry summary (min/max/avg) for mach-utility-pump, session 7"\`
- \`"history events for mach-ai4i-mill in the last 30 days"\`

See [[agent/sql/index]] for how the sub-agent plans, and [[agent/sql/gotchas]] for what goes wrong.

## \`run_failure_prediction(machine_id)\`

Score the latest readings against the machine's promoted model.

- Returns a probability **and the baseline it beats**. A probability without its baseline is not a
  result — see [[concepts/class-imbalance-in-failure-data]].
- On [[fleet/ai4i-milling-machine]] this is snapshot detection, with **no time horizon**. Do not
  describe its output as a forecast.

## \`run_demo_simulation(machine_id, horizon_minutes)\`

Project risk forward over a horizon.

- Available on [[fleet/utility-pump-02]] and [[fleet/packaging-drive-01]] only.
- Refuses [[fleet/ai4i-milling-machine]], and the refusal is the correct answer rather than a bug.

## \`extract_signal_from_complaint(text)\`

Turn a free-text operator symptom — "it was noisy yesterday" — into a structured signal: machine,
symptom type, rough severity, time window. Call this **first** when the user describes a problem in
their own words, before fetching anything.

## \`propose_recommendation(...)\`

Draft a maintenance recommendation for human approval. Use it only once you hold telemetry, a
prediction or a simulation. Never fabricate the evidence line.

## The knowledge tools

The wiki is a second brain, not a lookup table. Read it to orient; write to it when a turn produced
something durable.

| Tool | What it is for |
|---|---|
| \`list_knowledge_notes(namespace)\` | what exists |
| \`read_knowledge_note(id)\` | a page **and its backlinks** — what points at a page is often more informative than the page |
| \`search_knowledge(query)\` | ranked search when you do not know the page's name. Each hit says *why* it scored |
| \`write_knowledge_note(id, content, reason)\` | create or replace. \`reason\` is required and lands in [[log]] |
| \`append_to_knowledge_note(id, section, content)\` | append under a heading. The common case, and it cannot lose the rest of the page |
| \`link_knowledge_notes(from, to, relation)\` | add a typed edge — \`relates_to\`, \`caused_by\`, \`detected_by\`, or one you invent |
| \`get_knowledge_graph(around, depth)\` | structure rather than prose: what else touches this subject |

### Where you may write

| Namespace | Holds | Writable |
|---|---|---|
| \`fleet/\` | what these machines actually do | yes |
| \`domain/\` | what the standards say | yes |
| \`concepts/\` | modelling knowledge | yes |
| \`sources/\` | one page per external document, with its citation | yes |
| \`agent/\` | this wiki — routing, tools, the data contract | **no** |
| \`raw/\` | immutable originals | **no** |

\`domain/\` and \`fleet/\` may disagree. When a real machine contradicts the standard, record it on the
fleet page, say so on both, and link them — that disagreement is usually the useful part.
`,

  "agent/supervisor/machine-capabilities": `---
title: Supervisor — Machine Capabilities
namespace: agent/supervisor
type: reference
tags: [agent, fleet, capabilities]
relates_to:
  - "[[fleet/ai4i-milling-machine]]"
  - "[[fleet/utility-pump-02]]"
  - "[[fleet/packaging-drive-01]]"
  - "[[fleet/schema-generalisation]]"
updated: 2026-08-28
updated_by: seed
---

# Machine Capabilities

| Machine | \`machine_id\` | Schema | Detection | Forecasting | Order by |
|---|---|---|---|---|---|
| [[fleet/ai4i-milling-machine]] | \`mach-ai4i-mill\` | 4 | yes — snapshot, no horizon | **no** | row index; there is no real time axis |
| [[fleet/utility-pump-02]] | \`mach-utility-pump\` | 3 | yes | yes | \`timestamp\`, within \`session_id\` |
| [[fleet/packaging-drive-01]] | \`mach-packaging-drive\` | 5 | yes | yes | \`timestamp\`, within \`session_id\` |

Always pass the id. \`"Packaging Drive 01"\` matches nothing.

## Baselines to quote alongside any accuracy

| Machine | Positive rate | Majority-class baseline |
|---|---|---|
| \`mach-ai4i-mill\` | 5.70 % (114 of 2 000) | **94.30 %** |
| \`mach-utility-pump\` | 1.59 % (21 of 1 320) | **98.41 %** |
| \`mach-packaging-drive\` | 36.1 % (328 of 908) | **63.9 %** |

An accuracy that does not beat the number in the right-hand column is not a result. See
[[concepts/class-imbalance-in-failure-data]].

## Session facts

| Machine | Sampling | Sessions | Gap between sessions |
|---|---|---|---|
| \`mach-ai4i-mill\` | — | 8 nominal, metadata only | none — the sessions are labels, not runs |
| \`mach-utility-pump\` | 30 s | 12 | about 26 h |
| \`mach-packaging-drive\` | 500 ms | 8 | days |

Never let a window span a session gap — see [[concepts/resampling-and-aggregation]]. Why every
machine carries \`timestamp\` and \`session_id\` even when they mean nothing is on
[[fleet/schema-generalisation]].
`,

  "agent/supervisor/error-handling": `---
title: Supervisor — Error Handling
namespace: agent/supervisor
type: reference
tags: [agent, errors]
relates_to:
  - "[[agent/supervisor/machine-capabilities]]"
updated: 2026-08-28
updated_by: seed
---

# Error Handling

| Message | Cause | Recovery |
|---|---|---|
| \`Machine 'X' not found\` | display name passed instead of an id | look the id up in [[agent/supervisor/machine-capabilities]] and retry once |
| \`No telemetry available\` | the requested window is empty | widen the window, or check whether the machine has a session there at all |
| \`Forecasting is not available for this machine\` | forecast asked for on the mill | explain the missing time axis, offer detection instead |
| \`This model trains on the production worker\` | a browser-only build was asked to fit XGBoost, an LSTM, a GRU or a TCN | say which architectures do fit here; do not report a score |
| \`No promoted model for this goal\` | nothing has been promoted yet | say so plainly — a stale model quietly served is worse than an honest gap |
| \`Note 'X' not found\` | wrong page id | \`list_knowledge_notes\` or \`search_knowledge\` for the real one |

## Two rules

**Never retry the same failed call unchanged.** If the first call failed for a reason, the second
will fail for the same one.

**A refusal is an answer.** "This machine cannot be forecast, because its dataset has no time axis;
here is what detection says instead" is a better turn than an error string, and it is usually the
more truthful one. The same principle runs through the MLOps workspace: an architecture the browser
cannot fit is described and refused rather than given an invented score.
`,

  "agent/sql/index": `---
title: SQL Sub-agent Wiki
namespace: agent/sql
type: index
tags: [agent, sql, data]
relates_to:
  - "[[agent/supervisor/index]]"
updated: 2026-08-28
updated_by: seed
---

# SQL Sub-agent Wiki — Index

Everything the query planner needs to turn a plain-English question into a correct read-only plan.

| Page | One line |
|---|---|
| [[agent/sql/data-contract]] | The entities, their fields, and how they relate |
| [[agent/sql/gotchas]] | Where the contract surprises you |

## Quick rules, always

1. **Read-only.** Only \`SELECT\`. A plan containing anything else is rejected before it runs, not
   after.
2. Machine ids are lowercase and hyphenated: \`mach-ai4i-mill\`, \`mach-utility-pump\`,
   \`mach-packaging-drive\`. Any other capitalisation matches nothing.
3. Telemetry is ordered **within a session**, never across one.
4. The base entity is whichever one owns the columns you are *returning*, not the one you are
   filtering on.
5. Do not join when a single entity answers the question.

## What is behind this in the demo

Nothing. There is no database in this build — the planner's target is the browser-side data
contract, and the "SQL" step exists to show the shape of the delegation, not to execute against a
server. The constraint that matters is preserved: the sub-agent may only read.
`,

  "agent/sql/data-contract": `---
title: SQL Sub-agent — Data Contract
namespace: agent/sql
type: reference
tags: [agent, sql, schema]
relates_to:
  - "[[agent/sql/gotchas]]"
  - "[[fleet/schema-generalisation]]"
updated: 2026-08-28
updated_by: seed
---

# Data Contract

The entities the planner can read. This is a contract, not a database schema — the same shape is
served by a browser fixture here and would be served by a real store elsewhere, which is exactly the
point of [[fleet/schema-generalisation]].

## \`machines\`

| Field | Type | Notes |
|---|---|---|
| \`id\` | string | \`mach-ai4i-mill\`, \`mach-utility-pump\`, \`mach-packaging-drive\` |
| \`name\` | string | display name — never use it as a key |
| \`line\` | string | production line |
| \`machine_type\` | string | \`ai4i\` / \`sensor\` / \`real-sensor\` |
| \`status\` | string | \`healthy\` / \`watch\` / \`risk\` / \`offline\` |
| \`health_score\` | float | 0–100 |
| \`risk_score\` | float | 0–100 |
| \`schema_version\` | int | which registry contract this machine is on |

## \`telemetry\`

One shape for every machine — the whole reason the schema was generalised.

| Field | Type | Notes |
|---|---|---|
| \`machine_id\` | string | FK → \`machines.id\` |
| \`timestamp\` | datetime | **metadata, never a model input.** Null on machines with no time axis |
| \`session_id\` | string | groups rows into one continuous run |
| \`values\` | object | the machine's declared columns, keyed by the names in its registry entry |

The columns inside \`values\` differ per machine and are declared, named and typed on the machine's
registry entry. Do not assume a column exists because another machine has it.

## \`predictions\`

| Field | Type | Notes |
|---|---|---|
| \`machine_id\` | string | |
| \`generated_at\` | datetime | |
| \`horizon_hours\` | int | **null for snapshot detection** — see [[fleet/ai4i-milling-machine]] |
| \`probability\` | float | 0–1 |
| \`baseline\` | float | what always guessing the common outcome would have scored |
| \`severity\` | string | low / medium / high / critical |

\`baseline\` is not decoration. A probability reported without it is exactly the failure
[[concepts/class-imbalance-in-failure-data]] describes.

## \`history_events\`

An audit log: what happened, when, to which machine. It records events — it is **not** an access
table and must not be used to answer "who works on this machine".

## \`recommendations\`

Drafted actions awaiting human approval: machine, title, detail, priority, estimated downtime.
Nothing here is auto-applied.

## Relationships

\`\`\`
machines ──── telemetry         (telemetry.machine_id = machines.id)
         ──── predictions       (predictions.machine_id = machines.id)
         ──── recommendations   (recommendations.machine_id = machines.id)
         ──── history_events    (history_events.machine_id = machines.id)
\`\`\`

There are no person records in this contract. The demo has personas for the sign-in experience and
they are deliberately outside what the query planner can reach.
`,

  "agent/sql/gotchas": `---
title: SQL Sub-agent — Gotchas
namespace: agent/sql
type: reference
tags: [agent, sql, pitfalls]
relates_to:
  - "[[agent/sql/data-contract]]"
  - "[[concepts/resampling-and-aggregation]]"
updated: 2026-08-28
updated_by: seed
---

# Gotchas

Known traps that produce a wrong plan, or a right-looking plan over the wrong rows.

## The mill has no time axis

\`ORDER BY timestamp\` on \`mach-ai4i-mill\` orders by a column that is null on every row. Order by the
row index instead, and do not offer the user a time window for that machine — see
[[fleet/ai4i-milling-machine]].

## Sessions are not one continuous stream

\`mach-packaging-drive\` runs in short bursts days apart, and \`mach-utility-pump\` about a day apart.
A time difference computed across a session boundary is the length of the gap, not the length of
anything that happened. Scope to a \`session_id\` before computing any delta or window. See
[[concepts/resampling-and-aggregation]].

## "Latest N rows" and "the last N minutes" are different questions

At 500 ms per row the last 30 rows of the drive is fifteen seconds; on the pump's 30-second grid it
is fifteen minutes. Ask which the user meant when it changes the answer, and say which you used.

## Columns live inside \`values\` and differ per machine

\`vibration_x_g\` exists only on the drive. \`flow_lpm\` only on the pump. \`Torque [Nm]\` only on the
mill. A filter naming a column the machine does not declare returns nothing, and returning nothing
looks identical to "the machine was fine".

## The base entity must own the answer columns

Set the base to the entity that directly contains the fields you are returning, not the one you are
filtering on. "Which machines had a high-severity event last week?" returns machine fields and
filters on events.

## Do not join when one entity suffices

An unnecessary join inflates the plan and introduces ambiguity for nothing. When you do join,
qualify every column name.

## \`history_events\` is not an access table

It records what happened. Using it to answer "who has access to this machine" gives you whoever
happened to act on it recently, which is a different question with a plausible-looking wrong answer.
`,
};
