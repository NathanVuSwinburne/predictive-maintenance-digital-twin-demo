/**
 * The root pages: the conventions, the catalogue, and the log.
 *
 * `AGENT-WIKI` is the schema — the one page that is co-evolved rather than owned by either side.
 * `index` is the content catalogue, and navigating it is meant to be faster than searching.
 * `log` is append-only, and every write in the pane lands there with the reason the writer gave.
 */

export const ROOT_PAGES: Record<string, string> = {
  "AGENT-WIKI": `---
title: How This Wiki Works
namespace: root
type: reference
tags: [meta, conventions]
updated: 2026-08-28
updated_by: seed
confidence: high
---

# How This Wiki Works

This is the assistant's second brain. It is not a corpus that gets queried and forgotten — it is a
persistent artifact that compounds. Every diagnosis that held, every threshold learned from a real
machine, every dataset quirk that cost an hour to find belongs here: written down once, linked, and
never re-derived.

The vault is plain markdown with YAML frontmatter. The graph is not stored anywhere — it is derived
from the files on read, so nothing can drift out of sync with the text, because **the text is the
graph**. Edit a page and the assistant uses the new words on its next turn. There is no reindex and
no embedding to rebuild.

## Three layers

| Layer | Where | Who owns it |
|---|---|---|
| **Raw sources** — immutable | \`raw/\` | dropped in by a person. Read, never modified. |
| **The wiki** — compiled, interlinked | \`domain/\` \`concepts/\` \`fleet/\` \`sources/\` \`agent/\` | the assistant writes; a person may edit anything |
| **The schema** — these conventions | this page | co-evolved. If a convention stops fitting, change it here first. |

## Namespaces

| Namespace | Holds |
|---|---|
| \`domain/\` | Engineering knowledge about this class of machine: failure physics, condition-monitoring practice, standards. What the textbook says. |
| \`concepts/\` | The modelling side: RUL, class imbalance, drift, leakage, thresholds. The language needed to *explain* this application's own ML output. |
| \`fleet/\` | One page per registered machine. What each machine actually does. |
| \`sources/\` | One page per external document, carrying its citation and what was taken from it. Provenance anchors. |
| \`agent/\` | Operational knowledge: routing, the tool catalogue, the data contract. How the assistant works, not what it knows. |
| \`raw/\` | Immutable originals. |

\`domain/\` and \`fleet/\` are allowed to disagree. The standard says one thing; a real machine on a
real floor does another. When they disagree, say so on both pages and link them — that disagreement
is often the most useful thing in the vault.

## Page format

\`\`\`markdown
---
title: Rolling-Element Bearing Failure
namespace: domain
type: failure-mode          # failure-mode | concept | entity | source | reference | index | log
tags: [bearing, vibration, rotating-equipment]
aliases: [bearing fault, bearing spall]
sources:
  - "[[sources/iso-20816-3]]"
relates_to:
  - "[[domain/vibration-severity-zones]]"
caused_by:
  - "[[domain/lubrication-failure]]"
detected_by:
  - "[[domain/envelope-analysis]]"
updated: 2026-08-28
updated_by: agent           # agent | user | seed
confidence: high            # high | medium | low — the writer's own assessment
---

# Rolling-Element Bearing Failure

Body prose, with \`[[wikilinks]]\` used liberally.
\`\`\`

Any list-valued frontmatter key whose values are wikilinks becomes a **typed edge** in the graph.
Invent \`mitigated_by\` or \`precedes\` when a relationship deserves a name — no code change is needed
for it to appear.

## Rules

- **Link liberally.** A \`[[link]]\` to a page that does not exist yet is not a mistake; it marks a
  page worth writing. Those are the wanted pages in the pane and in the lint report.
- **One concept per page.** Past roughly 400 lines, split it and link the pieces.
- **Never write to \`raw/\`.** Originals are immutable. Summarise them into \`sources/\` instead.
- **Every write is logged**, with a reason. Give a real one; "updated" tells a future reader nothing.
- **Flag contradictions, do not resolve them silently.** When a new source disagrees with a page, add
  a \`> **Conflict (YYYY-MM-DD):** …\` callout and link both. Quietly picking a winner destroys the
  information that there was ever a disagreement.
- **Cite numbers.** No threshold, frequency formula or failure-mode claim belongs on a page without a
  \`sources:\` entry naming a real, fetchable document. If it cannot be sourced, leave it out or mark
  the page \`confidence: low\` and add an \`> **Unsourced:** …\` callout.
- **Mark speculation.** \`confidence: low\` is cheap and honest.
- **Never write personal data or credentials into the vault.** It is shared plain text.
- **Update [[index]]** when a page is created or deleted.

## The three operations

**Ingest.** A document arrives in \`raw/\`. Read it, write \`sources/<slug>\` describing what it covers,
then update every page it touches, flagging contradictions. Log it.

**Query.** Navigate: [[index]] → the page → its outbound links. Search only when navigation does not
find it. Read the backlinks — what points *at* a page is often more informative than the page.

**Lint.** Periodically: which pages are orphans, which wanted pages are unwritten, which links are
broken, which numbers are unsourced. Fix what it reports. Everything the lint names is a piece of
work, not a violation.

## Undo

Every write snapshots the previous version, so nothing written here is unrecoverable — which is
exactly why the assistant is allowed to write freely.
`,

  index: `---
title: Wiki Index
namespace: root
type: index
tags: [meta]
updated: 2026-08-28
updated_by: seed
confidence: high
---

# Wiki Index

The content catalogue. Every page, one line each. Start here and follow the links — that is faster
and more reliable than searching.

Conventions live in [[AGENT-WIKI]]. Every write is recorded in [[log]].

## domain — condition monitoring and failure physics

What the standards and the literature say. Values here are the textbook's, not this fleet's;
observed values live in \`fleet/\`, and the two are allowed to disagree.

| Page | What it covers |
|---|---|
| [[domain/condition-monitoring-architecture]] | The ISO 13374 six-block model, and which block each part of this app is |
| [[domain/vibration-severity-zones]] | ISO 20816-3 / 10816-3 zones A–D, the actual mm/s boundaries, and why a limit without a machine group is not a limit |
| [[domain/bearing-failure-modes]] | BPFO / BPFI / BSF / FTF, the formulas, and reading sidebands to tell which component failed |
| [[domain/bearing-degradation-stages]] | The six-stage progression, why detection moves down in frequency, and why stage 6 looks like recovery |
| [[domain/envelope-analysis]] | Demodulation: what sees a bearing defect before velocity does |
| [[domain/thermal-failure-modes]] | Overheating, thermal cycling, heat-dissipation loss. Operating bands, marked unsourced |
| [[domain/lubrication-failure]] | Film breakdown, contamination, wash-out — upstream of most bearing failure |
| [[domain/misalignment-and-unbalance]] | 1× vs 2×, axial vs radial, and why these are causes rather than just faults |
| [[domain/tool-wear]] | Flank wear, overstrain, and the wear × torque interaction |
| [[domain/p-f-curve]] | Potential to functional failure, and how the interval sets the sampling rate |
| [[domain/fmea-and-criticality]] | RPN, why AIAG-VDA replaced it with Action Priority, and where severity enters the model |
| [[domain/maintenance-strategies]] | Reactive / preventive / condition-based / predictive, and when each is right |

## concepts — modelling and evaluation

The language for explaining this application's own ML output.

| Page | What it covers |
|---|---|
| [[concepts/class-imbalance-in-failure-data]] | The majority-class baseline rule, and the accuracy that loses to it |
| [[concepts/precision-recall-vs-accuracy]] | Which metric to lead with, and the arithmetic of alarm fatigue |
| [[concepts/model-evaluation-for-rare-events]] | What to report, in what order, and why ROC-AUC flatters |
| [[concepts/threshold-selection]] | Why 0.5 is a decision, not a default |
| [[concepts/derived-features]] | Row-wise computed columns, and the unit trap |
| [[concepts/feature-engineering-for-telemetry]] | Where the accuracy actually lives |
| [[concepts/resampling-and-aggregation]] | Fixed time grids, session boundaries, never averaging a label |
| [[concepts/train-test-leakage-in-time-series]] | The five routes, and why a great score is suspicious |
| [[concepts/labelling-failure-windows]] | Choosing the horizon, and reporting it |
| [[concepts/remaining-useful-life]] | What RUL needs, censoring, and why this fleet does not publish one |
| [[concepts/data-drift]] | Covariate shift vs concept drift, and why a dying sensor looks like both |

## fleet — the machines in this registry

What *these* machines actually do. Every number here is one the MLOps workspace will show you.

| Page | |
|---|---|
| [[fleet/ai4i-milling-machine]] | \`mach-ai4i-mill\`. Snapshot detection only — no time axis, so nothing can be forecast |
| [[fleet/utility-pump-02]] | \`mach-utility-pump\`. Five sensors on a 30-second grid, both goals, real dropouts |
| [[fleet/packaging-drive-01]] | \`mach-packaging-drive\`. Three axes at 500 ms in sessions days apart |
| [[fleet/schema-generalisation]] | Why the drive's bespoke pipeline was rewritten as a registry entry, and what that cost |

## sources — provenance

Every numeric claim in \`domain/\` and \`concepts/\` traces to one of these.

| Page | Kind |
|---|---|
| [[sources/iso-13374-1]] | Primary — the standard's own text, read from the publisher's preview |
| [[sources/iso-20816-3]] | Paywalled; catalogue as authority, secondary for the numbers |
| [[sources/iso-10816-3]] | Superseded, still what the field quotes |
| [[sources/crowe-2007-bearing-faults]] | Primary — conference paper, read in full |
| [[sources/ai4i-2020-dataset]] | The published rules, and where this demo's reconstruction differs |
| [[sources/cmapss-turbofan]] | Secondary — NASA run-to-failure benchmark |
| [[sources/femto-pronostia]] | Secondary — measured bearing run-to-failure rig |
| [[sources/nowlan-heap-1978-rcm]] | Secondary — origin of the P-F curve |
| [[sources/aiag-vda-fmea-2019]] | Secondary — RPN replaced by Action Priority |
| [[sources/repo-maintenance-guidelines]] | Internal, uncited, superseded — kept so its claims stay traceable |
| [[sources/industrial-predictive-maintenance-guidelines]] | Written by the assistant from the raw file, not yet reviewed by a person |

## agent — operational knowledge

How the assistant works, rather than what it knows. Read-only to the assistant itself.

| Page | |
|---|---|
| [[agent/supervisor/index]] | Supervisor entry point |
| [[agent/supervisor/routing-guide]] | Intent → which tool first, and what to capture afterwards |
| [[agent/supervisor/tool-catalog]] | Every tool: purpose, arguments, what it refuses |
| [[agent/supervisor/machine-capabilities]] | What each machine supports, and the baseline to quote |
| [[agent/supervisor/error-handling]] | Common failures and recovery |
| [[agent/sql/index]] | Query planner entry point |
| [[agent/sql/data-contract]] | Entities, fields, relationships |
| [[agent/sql/gotchas]] | Where the contract surprises you |

## raw — immutable

| Page | |
|---|---|
| [[raw/legacy-maintenance-guidelines]] | The original document this project shipped with, unedited |

## Open disagreements

The corpus records its conflicts rather than quietly picking winners. The ones worth knowing before
you lean on a number:

- The legacy vibration table is roughly four times too permissive at the top end —
  [[domain/vibration-severity-zones]], [[sources/repo-maintenance-guidelines]].
- The AI4I file disagrees with its own published description on TWF and RNF counts, and RNF barely
  connects to the failure label — [[sources/ai4i-2020-dataset]].
- The two vibration standards disagree in the last digit of one zone boundary —
  [[sources/iso-20816-3]].
- This demo's reconstruction of AI4I has a different failure rate from the published file, so the
  two baselines are not interchangeable — [[fleet/ai4i-milling-machine]].
- [[fleet/packaging-drive-01]] reports acceleration in g while the ISO zones are written in mm/s
  velocity; no zone letter applies to that machine.
`,

  log: `---
title: Wiki Log
namespace: root
type: log
tags: [meta]
updated: 2026-08-28
updated_by: seed
---

# Wiki Log

Append-only chronology of every ingest, write and lint pass. A reason is required, and "updated" is
not a reason — this line is the only thing a future reader gets.

## [2026-08-26 15:01 UTC] seed | vault — 49 pages seeded, 0 local edits preserved (seed)
## [2026-08-27 04:46 UTC] ingest | sources/industrial-predictive-maintenance-guidelines — compiled from raw/legacy-maintenance-guidelines; flagged as unreviewed (agent)
## [2026-08-27 04:47 UTC] update | index — catalogued the ingested source (agent)
## [2026-08-27 09:12 UTC] update | domain/vibration-severity-zones — recorded the conflict with the legacy table rather than silently replacing it (agent)
## [2026-08-28 07:30 UTC] create | fleet/schema-generalisation — wrote down why the drive's bespoke pipeline was replaced, before anyone forgot what it cost (user)
## [2026-08-28 07:52 UTC] update | fleet/ai4i-milling-machine — separated the published dataset counts from this build's reconstruction; they were being read as the same number (user)
`,
};
