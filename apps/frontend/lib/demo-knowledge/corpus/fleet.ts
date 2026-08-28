/**
 * The `fleet/` namespace — the machines actually registered in this demo.
 *
 * These pages are written against the MLOps registry in `lib/demo-mlops/datasets.ts`, so a number
 * quoted here is a number the workspace will show you. Nothing in this namespace describes a real
 * customer machine: two of the three are seeded fixtures generated in the browser and the third is
 * a reconstruction of a public benchmark.
 *
 * `domain/` says what the standards say; `fleet/` says what these machines do. The two are allowed
 * to disagree, and where they do the disagreement is written on both pages.
 */

export const FLEET_PAGES: Record<string, string> = {
  "fleet/ai4i-milling-machine": `---
title: AI4I Milling Machine
namespace: fleet
type: entity
tags: [fleet, ai4i, milling, benchmark]
aliases: [mach-ai4i-mill, AI4I mill, machine a]
sources:
  - "[[sources/ai4i-2020-dataset]]"
relates_to:
  - "[[domain/tool-wear]]"
  - "[[domain/thermal-failure-modes]]"
  - "[[concepts/class-imbalance-in-failure-data]]"
  - "[[concepts/derived-features]]"
  - "[[fleet/schema-generalisation]]"
updated: 2026-08-28
updated_by: seed
confidence: high
---

# AI4I Milling Machine

| | |
|---|---|
| \`machine_id\` | \`mach-ai4i-mill\` |
| Schema version | 4 |
| Detection | **Yes** — snapshot classifier, no time horizon |
| Forecasting | **No** |
| Data | [[sources/ai4i-2020-dataset]], reconstructed in the browser |

## What it is

A milling machine standing in for a real one, and the first entry in the MLOps registry. Its data is
the AI4I 2020 benchmark: a synthetic dataset built to mirror a real mill, with five documented
failure rules and no time axis.

**The absence of a usable timestamp is the defining constraint.** No time means no trajectory, so no
windowing, no rolling features, and no remaining-useful-life estimate is available for this machine
at all — see [[concepts/remaining-useful-life]]. It supports *detection* — "does this snapshot look
like a failure?" — and cannot support prediction in the forecasting sense, whatever a product
screenshot might suggest. See [[concepts/labelling-failure-windows]].

The registry carries a \`timestamp\` and \`session_id\` column for this machine because every machine
in the shared schema does. Both are metadata here and neither is ever a model input — that
distinction is the whole subject of [[fleet/schema-generalisation]].

## What this demo actually bundles

This is the honest part, and it matters for reading every number in the MLOps workspace.

The real AI4I file is 10 000 rows and is **not** shipped here. What the demo ships is a **seeded
reconstruction**: 2 000 rows generated in the browser from the five published generative rules,
including the speed/torque anti-correlation the real file carries. Same rules, same shape, different
draw — so the counts differ and are stated separately rather than borrowed:

| | Real file (see [[sources/ai4i-2020-dataset]]) | This reconstruction |
|---|---|---|
| Rows | 10 000 | 2 000, across 8 nominal sessions |
| Failures | 339 (3.39 %) | **114 (5.70 %)** |
| Majority-class baseline | 96.61 % | **94.30 %** |

Any accuracy figure the workspace reports for this machine has to be read against **94.30 %**, not
against the published 96.61 %. See [[concepts/class-imbalance-in-failure-data]].

> **Conflict (2026-08-28):** quoting the published 339-failure figure next to a score computed on
> this reconstruction would compare two different datasets. The workspace computes its own baseline
> from the rows it actually splits, which is why the two numbers on this page disagree by design.

## Why the calculated features exist

The published rules are written on *combinations* of the raw columns, not on the columns
themselves:

| Rule | Fires on |
|---|---|
| Power (PWF) | \`torque × rotational speed\`, converted to watts |
| Heat dissipation (HDF) | \`process temperature − air temperature\`, with speed |
| Overstrain (OSF) | \`tool wear × torque\`, against a per-grade limit |

A model given only the six raw columns has to rediscover each product from a handful of positive
rows. Spelling them out as calculated features moves the boundary into the feature space, and on
this machine that is worth more than any hyperparameter — a measurable jump in balanced accuracy
that the workspace's own test suite pins in place. That result is the entire argument for having a
formula editor in the preprocessing stage. See [[concepts/derived-features]] and
[[domain/tool-wear]].

## Notes for the agent

This is synthetic data drawn from fixed distributions. It will never drift, its failures are
rule-generated rather than physical, and nothing measured here is evidence about a real milling
machine. Say so when a user reads a result as a statement about their plant — see
[[concepts/data-drift]].
`,

  "fleet/utility-pump-02": `---
title: Utility Pump 02
namespace: fleet
type: entity
tags: [fleet, pump, synthetic, forecasting]
aliases: [mach-utility-pump, utility pump, pump 02]
relates_to:
  - "[[concepts/resampling-and-aggregation]]"
  - "[[concepts/class-imbalance-in-failure-data]]"
  - "[[domain/lubrication-failure]]"
  - "[[domain/vibration-severity-zones]]"
  - "[[fleet/schema-generalisation]]"
updated: 2026-08-28
updated_by: seed
confidence: medium
---

# Utility Pump 02

| | |
|---|---|
| \`machine_id\` | \`mach-utility-pump\` |
| Schema version | 3 |
| Detection | **Yes** — degraded vs nominal |
| Forecasting | **Yes** — next readings on a 30-second grid |
| Data | seeded synthetic fixture, generated in the browser |

## What it is

A five-sensor process pump, and the machine that demonstrates **both** goals on one schema. It is
the counterexample to the mill: a real time axis, genuine sessions, and a slow degradation
trajectory that a forecaster can actually follow.

| Column | Unit | What it does |
|---|---|---|
| \`vibration_rms_g\` | g | rises with wear |
| \`bearing_temp_c\` | °C | drive-end housing; the confirming signal, never the early one |
| \`discharge_pressure_bar\` | bar | **has genuine dropouts — about 1 % of rows** |
| \`flow_lpm\` | L/min | falls as the impeller wears |
| \`motor_power_kw\` | kW | rises to hold flow |

1 320 rows across 12 sessions, 2026-05-04 to 2026-05-17.

## The two useful properties

**The dropouts are deliberate.** About one row in eighty is missing a discharge pressure, so
"missing values" is a decision the preprocessing recipe has to make rather than a hypothetical the
UI mentions. Drop the row, fill with the Train-partition mean, or fill with its median — each
changes the fitted statistics, and the workspace shows which.

**Power rising while flow falls is the story.** Neither column alone says much; the pair says the
impeller is wearing and the motor is compensating. That is the same argument as
[[concepts/feature-engineering-for-telemetry]], on a machine where the interesting feature is a
ratio rather than a product.

## Class balance

21 of 1 320 rows are labelled \`degraded\` — **1.59 %**, so the majority-class baseline is
**98.41 %**. A classifier here can post 98 % accuracy having never once identified a degraded
reading. This is the machine on which the promotion gate earns its keep: a class-balanced model that
catches the rare condition will usually *lose* plain accuracy to the class prior, and the gate calls
that a deliberate trade rather than a failure. See [[concepts/precision-recall-vs-accuracy]] and
[[concepts/threshold-selection]].

## Forecasting notes

Sessions are 26 hours apart, so a window that spans two of them averages two operating episodes into
a row that never happened. Bin per session, anchored to each session's own first reading — see
[[concepts/resampling-and-aggregation]]. The ridge-lag forecaster in the workspace beats a
persistence baseline (repeat the last reading) on this machine, which is the minimum bar a forecast
has to clear before it is worth anything at all.

## Notes for the agent

Generated from a seeded PRNG. It is deterministic, it will produce the same rows on every load, and
it is not evidence about any real pump. Its vibration figures are in **g**, not the mm/s the ISO
zones in [[domain/vibration-severity-zones]] are written in — do not compare the two without
converting, and do not quote a zone letter for this machine.
`,

  "fleet/packaging-drive-01": `---
title: Packaging Drive 01
namespace: fleet
type: entity
tags: [fleet, vibration, sessions, three-axis]
aliases: [mach-packaging-drive, packaging drive, drive 01]
relates_to:
  - "[[domain/misalignment-and-unbalance]]"
  - "[[domain/bearing-failure-modes]]"
  - "[[concepts/resampling-and-aggregation]]"
  - "[[concepts/train-test-leakage-in-time-series]]"
caused_the:
  - "[[fleet/schema-generalisation]]"
updated: 2026-08-28
updated_by: seed
confidence: medium
---

# Packaging Drive 01

| | |
|---|---|
| \`machine_id\` | \`mach-packaging-drive\` |
| Schema version | **5** — the most migrated machine in the registry |
| Detection | **Yes** — imbalance suspected vs nominal |
| Forecasting | **Yes** |
| Data | seeded synthetic fixture, generated in the browser |

## What it is

Three vibration axes and a drive temperature at 500 ms, in short sessions days apart. 908 rows
across 8 sessions, 2026-06-11 to 2026-07-09.

| Column | Unit | |
|---|---|---|
| \`vibration_x_g\` | g | radial, horizontal |
| \`vibration_y_g\` | g | radial, vertical |
| \`vibration_z_g\` | g | axial |
| \`drive_temp_c\` | °C | drifts upward within a session |
| \`line_speed_ppm\` | packs/min | **an operating condition, not a fault signal** |

That last row is the one people get wrong. Line speed explains vibration amplitude; it does not
indicate a fault. A model handed it without thought learns "fast line = risky machine", which is
true of the data and false of the world.

## The shape that broke the old pipeline

This is the machine profile that made a generic schema necessary, and it is worth being specific
about why. Three properties, none of which the earlier machines had:

1. **Sessions, not a continuous stream.** Runs are days apart. A rolling window that spans the gap
   averages two unrelated episodes — see [[concepts/resampling-and-aggregation]].
2. **A high sampling rate over a short span.** 500 ms rows in bursts of a few minutes. A one-hour
   rolling mean is mostly padding here, and a fixed "last 30 rows" window means a different
   *duration* on this machine than on [[fleet/utility-pump-02]].
3. **Three correlated axes plus a condition column.** The signal is the relationship between the
   axes, not any single one.

The full story of what that cost and what replaced it is on [[fleet/schema-generalisation]].

## Class balance, and why it is the easy one

328 of 908 rows are labelled \`imbalance suspected\` — **36.1 %**, a majority-class baseline of
**63.9 %**. Compared with the other two machines this is a comfortable problem, and that is exactly
why it is a good place to be suspicious. A model that scores well here has cleared a low bar; see
[[concepts/model-evaluation-for-rare-events]] on why a strong number on industrial data is evidence
to check rather than evidence to celebrate.

The imbalance grows across sessions 6 to 8, so **a random split leaks**. Rows either side of a
one-second boundary are nearly identical, and shuffling puts one in Train and one in Test. Split by
time, or by session. The preprocessing stage warns about this by name — see
[[concepts/train-test-leakage-in-time-series]].

## Reading the axes

A 1× radial component that grows while the axial channel stays flat is unbalance; a strong axial
component at 2× points at alignment instead. Both are *causes* that load a bearing outside its design
envelope rather than faults in themselves — see [[domain/misalignment-and-unbalance]]. Nothing on
this fixture is a real measurement, so the page states the reading rule and no threshold.

> **Conflict (2026-08-28):** [[domain/vibration-severity-zones]] gives its boundaries in mm/s RMS
> velocity over 10–1 000 Hz. This machine reports acceleration in g. The two are not comparable
> without an integration and a band, and no zone letter should be quoted for this drive.

## Notes for the agent

Seeded synthetic. Deterministic, reproducible, and not evidence about any real packaging line.
`,

  "fleet/schema-generalisation": `---
title: From a Bespoke Pipeline to a Generic Schema
namespace: fleet
type: concept
tags: [schema, mlops, migration, history]
aliases: [schema generalisation, generic schema, the rewrite]
relates_to:
  - "[[fleet/packaging-drive-01]]"
  - "[[fleet/ai4i-milling-machine]]"
  - "[[fleet/utility-pump-02]]"
  - "[[concepts/resampling-and-aggregation]]"
  - "[[concepts/class-imbalance-in-failure-data]]"
  - "[[agent/supervisor/machine-capabilities]]"
updated: 2026-08-28
updated_by: seed
confidence: high
---

# From a Bespoke Pipeline to a Generic Schema

The registry looks obvious now — machines have named, typed, versioned columns, declare which goals
they support, and train through the same stages. It did not start that way, and the history is worth
keeping because every rule in the current schema was bought by a specific failure.

## How it started

The third machine, [[fleet/packaging-drive-01]], arrived as a **bespoke pipeline**. Not a
configuration of a general system — a separate code path, written for that one machine:

- **Column order was fixed in code.** The loader read position 0 as X, 1 as Y, 2 as Z. Renaming a
  column in the export silently shifted every feature by one and the model still trained.
- **Window length was fixed in code.** \`contextRows = 30\` lived in the training script, and the
  serving path had its own copy of the number.
- **One model path.** Whatever the drive needed, the pipeline did. There was no way to express "this
  machine has no time axis" because no machine had needed to say it.
- **Preprocessing lived in the notebook.** Scalers were fitted in the training script and
  re-implemented by hand in the serving path — two functions with the same name computing different
  things, which is the failure mode [[concepts/feature-engineering-for-telemetry]] warns about.

It worked. It worked for exactly one machine, and every property above is invisible until a second
machine arrives.

## What forced the change

Adding [[fleet/ai4i-milling-machine]] broke it in a way that could not be patched. The mill has
**no usable time axis at all** — no timestamps, no unit identity, nothing to order by but a row
index. The bespoke pipeline's every assumption was temporal: windows, lags, session boundaries,
context rows. There was no value of \`contextRows\` that meant "there is no context".

The choices were to fork the pipeline a second time, or to say what a machine *is* in a way that
covers both. Forking was the fast answer and the wrong one — two forks become five, and the fifth
is where the two definitions of a scaler diverge.

## What replaced it

A machine became a **declaration** rather than a code path:

| Before | After |
|---|---|
| column order fixed in code | named, typed, unit-carrying columns in a registry entry |
| window length fixed in code | part of the recipe, versioned with the dataset |
| implicitly temporal | \`timestamp\` and \`session_id\` are **metadata**, never model inputs — and a machine may have neither |
| one model path | declared capabilities: this machine supports detection, forecasting, or both |
| preprocessing in the notebook | a recipe frozen into an immutable dataset version, with a content digest |
| a fitted scaler, twice | statistics fitted on Train only, stored with the dataset, reused verbatim at inference |

The drive walked through five schema versions to get there and the migration list is still on its
registry entry, because a schema version with no record of what changed is a number rather than a
history.

## What it cost, honestly

Forcing a bespoke machine into a general schema is not free.

- **Things that were implicit had to be said out loud.** "The window is 30 rows" became "the window
  is 30 rows *of the 500 ms grid, per session, never spanning the multi-day gap*", which is longer,
  and correct.
- **Some domain nuance moved out of code and into configuration**, where it is visible but no longer
  enforced by the type system. The gap column on the drive is a convention now, not a compiler
  error.
- **The generic path is slower** than a hand-written one for any single machine. That is the trade:
  one path that three machines share and that a fourth can join, against three paths that each work
  perfectly and drift apart.

The judgement was that the cost of a fourth fork exceeded the cost of the abstraction. On a system
with one machine and no plans for a second, the bespoke pipeline would have been the right answer.

## What it bought

The rules that only exist because the schema is shared:

- **A majority-class baseline is a required output of every training run**, because comparing across
  machines forced the question of what an accuracy figure is being compared *to*. See
  [[concepts/class-imbalance-in-failure-data]].
- **Train-only fitted statistics**, because the same recipe now runs on machines whose splits differ
  — see [[concepts/train-test-leakage-in-time-series]].
- **Session-aware binning**, because [[fleet/packaging-drive-01]] has multi-day gaps and
  [[fleet/utility-pump-02]] has 26-hour ones and the mill has none at all. See
  [[concepts/resampling-and-aggregation]].
- **An architecture the browser cannot fit gets refused rather than faked.** Once a machine declares
  its capabilities, "this model trains on the production worker" is something the system can say
  instead of printing a plausible score nobody computed.

None of that is visible on any one machine. It is what a second machine costs, paid once.
`,
};
