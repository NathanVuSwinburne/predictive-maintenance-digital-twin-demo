/**
 * The `sources/` namespace: provenance.
 *
 * One page per external document, carrying its citation, what was taken from it, and what it
 * does not cover. Every number in `domain/` and `concepts/` traces back to one of these, which
 * is the only reason the corpus is allowed to state numbers at all.
 */

export const SOURCES_PAGES: Record<string, string> = {
  "sources/ai4i-2020-dataset": `---
title: AI4I 2020 Predictive Maintenance Dataset
namespace: sources
type: source
tags: [dataset, benchmark, tool-wear]
aliases: [AI4I 2020, AI4I]
relates_to:
  - "[[fleet/ai4i-milling-machine]]"
  - "[[concepts/class-imbalance-in-failure-data]]"
  - "[[domain/tool-wear]]"
updated: 2026-08-27
updated_by: seed
confidence: high
---

# AI4I 2020 Predictive Maintenance Dataset

| | |
|---|---|
| Publisher | UCI Machine Learning Repository |
| Record | <https://archive.ics.uci.edu/dataset/601/ai4i+2020+predictive+maintenance+dataset> |
| Donor | S. Matzka, donated 2020-08-29 |
| DOI | 10.24432/C5HS5C |
| Licence | CC BY 4.0 |
| Accessed | 2026-08-27 |
| Kind | **Primary for the rules, secondary for the counts.** The published generative rules are reproduced below from the UCI record. The counts in the next section were recomputed from the real 10 000-row file in the parent project, not from this demo. |

This is the dataset behind [[fleet/ai4i-milling-machine]], the first machine in the MLOps
registry. **This demo does not ship the file.** It reconstructs rows in the browser from the five
published rules below, which is why its own failure counts differ from the ones recorded here; see
[[fleet/ai4i-milling-machine]] for what the reconstruction actually produces.

## What the dataset is

10 000 rows, synthetic but built to mirror a real milling machine. 14 columns:

| Column | Unit | How it is generated |
|---|---|---|
| \`UDI\` | none | 1-10 000 |
| \`Product ID\` | none | quality variant letter L / M / H plus a serial |
| \`Type\` | none | L / M / H, **6 000 / 2 997 / 1 003** rows (verified) |
| \`Air temperature [K]\` | K | random walk, σ ≈ 2 K, around 300 K |
| \`Process temperature [K]\` | K | random walk, σ ≈ 1 K, air temperature + 10 K |
| \`Rotational speed [rpm]\` | rpm | derived from a 2 860 W power draw, plus noise |
| \`Torque [Nm]\` | Nm | normal, mean 40 Nm, σ = 10 Nm |
| \`Tool wear [min]\` | min | +5 / +3 / +2 min per part for H / M / L |
| \`Machine failure\` | 0/1 | the label |
| \`TWF HDF PWF OSF RNF\` | 0/1 | five independent failure-mode flags |

## The five failure modes, as documented

- **TWF** tool wear failure: the tool is replaced or fails at a randomly chosen wear between 200
  and 240 min.
- **HDF** heat dissipation failure: air-to-process temperature difference below 8.6 K *and*
  rotational speed below 1 380 rpm.
- **PWF** power failure: torque × angular velocity below 3 500 W or above 9 000 W.
- **OSF** overstrain failure: tool wear × torque exceeds 11 000 minNm (L), 12 000 (M) or
  13 000 (H).
- **RNF** random failure: a 0.1 % chance per process, independent of everything else.

## Verified counts, and where they disagree with the description

Recomputed from the real 10 000-row file on 2026-08-27, in the project this demo is drawn from:

| | Count |
|---|---|
| \`Machine failure = 1\` | **339** (3.39 %) |
| TWF | 46 |
| HDF | 115 |
| PWF | 95 |
| OSF | 98 |
| RNF | 19 |
| rows tripping more than one mode | 24 |
| rows with a mode flag but \`Machine failure = 0\` | 18 |

> **Conflict (2026-08-27):** the UCI description says TWF occurs 120 times, of which 51 are
> failures, and that RNF occurs 5 times. The file has **TWF = 46** and **RNF = 19**. The file is
> what the real models were trained on, so the file wins, but do not quote the
> published figures as if they described this data.

> **Conflict (2026-08-27):** RNF is documented as a failure mode, yet **18 of its 19 rows carry
> \`Machine failure = 0\`**. In practice RNF is very nearly disconnected from the label. A model
> trained to predict \`Machine failure\` is not learning RNF at all, and a *cause* classifier trained
> on the five flags will see an RNF class that does not correspond to a failure. This is the single
> most common way people misread this dataset.

## What it does not cover

It is synthetic. The distributions are drawn, not measured, so it is a benchmark for method
comparison and not evidence about how any real milling machine behaves. It carries no timestamps and
no machine identity, so nothing about sequence, drift, or per-unit history can be learned from it;
see [[concepts/train-test-leakage-in-time-series]] for why that matters elsewhere.

At 3.39 % positives it is severely imbalanced: predicting "no failure" for every row scores
**96.61 % accuracy**. See [[concepts/class-imbalance-in-failure-data]].
`,

  "sources/aiag-vda-fmea-2019": `---
title: AIAG-VDA FMEA Handbook (2019)
namespace: sources
type: source
tags: [fmea, risk, criticality]
aliases: [AIAG-VDA FMEA, Action Priority]
relates_to:
  - "[[domain/fmea-and-criticality]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# AIAG-VDA FMEA Handbook, 1st edition (2019)

| | |
|---|---|
| Publishers | Automotive Industry Action Group (AIAG) and Verband der Automobilindustrie (VDA) |
| Edition | 1st, 2019 |
| Secondary sources read | Quality Assist, *RPN vs Action Priority*, <https://quasist.com/fmea/rpn-vs-ap-action-priority/>; *FMEA Action Priority (AIAG-VDA Standard)*, <https://quasist.com/fmea/action-priority-in-fmea/> |
| Accessed | 2026-08-27 |
| Kind | **Secondary.** The handbook is a paid publication and was not read. |

## What was taken from it

That the 2019 handbook **replaced the Risk Priority Number with Action Priority**, and why.

RPN is Severity × Occurrence × Detection, each rated 1-10, giving 1-1 000. Its flaw is that it treats
the three factors as interchangeable: a safety-critical failure mode scores low if occurrence and
detection happen to be good, and a genuinely dangerous risk drops down the list.

Action Priority instead maps all 1 000 S/O/D combinations to **High / Medium / Low** through a fixed
table, ordered by Severity first, then Occurrence, then Detection. Severity can no longer be traded
away.

Used by [[domain/fmea-and-criticality]].

## What it does not cover

The AP table itself is not reproduced here: it is 1 000 rows of copyrighted content, and
paraphrasing it from a summary would be exactly the kind of unsourced numeric claim this corpus
refuses to make. Anyone doing a real FMEA needs the handbook.
`,

  "sources/cmapss-turbofan": `---
title: NASA C-MAPSS Turbofan Degradation Dataset
namespace: sources
type: source
tags: [dataset, benchmark, rul, prognostics]
aliases: [C-MAPSS, CMAPSS]
relates_to:
  - "[[concepts/remaining-useful-life]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# NASA C-MAPSS Turbofan Engine Degradation Simulation Dataset

| | |
|---|---|
| Origin | NASA Prognostics Center of Excellence data repository |
| Primary citation | A. Saxena, K. Goebel, D. Simon and N. Eklund, *Damage Propagation Modeling for Aircraft Engine Run-to-Failure Simulation*, IEEE PHM 2008 |
| Mirror consulted | <https://ieee-dataport.org/documents/c-mapss-dataset> |
| Accessed | 2026-08-27 |
| Kind | **Secondary.** The dataset description was read from mirrors and survey literature; the original Saxena et al. paper was not fetched, and the data is not bundled here. |

## What was taken from it

Simulated run-to-failure trajectories from the Commercial Modular Aero-Propulsion System Simulation.
Four subsets, each with **21 sensor channels** and **3 operational settings** (altitude, Mach number,
throttle resolver angle), plus an engine unit id and a cycle counter.

| Subset | Operating conditions | Fault modes | Train / test trajectories |
|---|---|---|---|
| FD001 | 1 (sea level) | 1 (HPC degradation) | 100 / 100 |
| FD002 | 6 | 1 | none |
| FD003 | 1 | 2 | none |
| FD004 | 6 | 2 (HPC and fan degradation) | 248 / 249 |

The structural point, which is why this page exists: **training trajectories run to failure, test
trajectories are truncated at an arbitrary point**, and the task is to predict how many cycles
remain. That framing (not the engine physics) is what makes C-MAPSS the reference example for
[[concepts/remaining-useful-life]] and for [[concepts/labelling-failure-windows]].

## What it does not cover

Aero engines under simulated degradation. Nothing here transfers numerically to a milling machine or
a bench rig; only the *problem shape* transfers. Counts for FD002 and FD003 were not verified and
are deliberately left blank rather than guessed.
`,

  "sources/crowe-2007-bearing-faults": `---
title: Crowe 2007, Understanding and Detecting Rolling Element Bearing Faults
namespace: sources
type: source
tags: [bearing, vibration, diagnostics]
aliases: [Crowe 2007]
relates_to:
  - "[[domain/bearing-failure-modes]]"
  - "[[domain/bearing-degradation-stages]]"
  - "[[domain/envelope-analysis]]"
updated: 2026-08-27
updated_by: seed
confidence: high
---

# Crowe (2007), Understanding and Detecting Rolling Element Bearing Faults

| | |
|---|---|
| Author | Jim Crowe, Jim Crowe Vibration Technologies |
| Published in | 2007 Conference Proceedings, Reliability Engineering track, pp. 301-306 |
| Retrieved from | <http://media.noria.com/downloads/ml/Crowe-Understanding.pdf> |
| Accessed | 2026-08-27 |
| Kind | **Primary.** All six pages were read in full. |

## What was taken from it

**The defect-frequency formulas**, with \`Nb\` rolling elements, \`Pd\` pitch diameter, \`Bd\` ball or
roller diameter, \`Ca\` contact angle, \`Ts\` shaft turning speed, used by
[[domain/bearing-failure-modes]]:

\`\`\`
BPFI = Nb/2 * Ts * (1 + Bd/Pd * cos Ca)
BPFO = Nb/2 * Ts * (1 - Bd/Pd * cos Ca)
BSF  = Pd/(2*Bd) * Ts * [1 - (Bd/Pd)^2 * (cos Ca)^2]
FTF  = Ts/2 * (1 - Bd/Pd * cos Ca)     inner race rotating, outer fixed
FTF  = Ts/2 * (1 + Bd/Pd * cos Ca)     inner race fixed, outer rotating
\`\`\`

**The approximations**, stated by the paper to land within ±20 % when the bearing geometry is not
known: \`0.6 * Nb * Ts\` inner race, \`0.4 * Nb * Ts\` outer race, \`0.23 * Nb * Ts\` for ball spin under
10 rolling elements and \`0.18 * Nb * Ts\` at 10 or more, \`0.4 * Ts\` for the cage.

**The sideband signatures**, the part that actually identifies which component failed:

- inner race defect → sidebands spaced at **shaft speed**, because the defect passes in and out of
  the load zone once per revolution
- rolling-element defect → sidebands spaced at **cage frequency**, because the element travels with
  the cage; often only *even* multiples of BSF appear, since the element strikes both races each
  revolution
- outer race defect → **no sidebands**, because the defect sits in the load zone and every impact is
  the same size

**The six-stage progression** and the observation that detection moves down in frequency as damage
grows, used by [[domain/bearing-degradation-stages]].

**Two cautions that matter more than the formulas.** First: overall velocity is a bad screen for
bearing damage. The paper shows a bearing with a clear inner-race defect and 7 g impacting whose
overall velocity trend read 0.0625 in/s. Second: absolute amplitude is not severity. An inner-race
defect reads lower than an identical outer-race defect purely because its energy travels through a
rolling element first, and sensor position relative to the load zone changes the number again, so
watch rate of change and pattern, not the absolute value.

**Time to failure is not a constant.** The paper reports the same progression taking hours when
coolant washes out the grease, months when the bearing is merely overloaded, and years for what the
author took to be mounting or handling damage: one fan bearing showed outer-race defect frequencies
from April 2000 and was still not in alarm in June 2006.

## What it does not cover

No thresholds, no alarm levels, no ISO zone mapping. It is a pattern-recognition paper: it tells you
what a defect *looks* like, not when to act. Do not cite it for a limit; see
[[domain/vibration-severity-zones]] for those.
`,

  "sources/femto-pronostia": `---
title: FEMTO / PRONOSTIA Bearing Degradation Platform
namespace: sources
type: source
tags: [dataset, benchmark, bearing, prognostics]
aliases: [PRONOSTIA, FEMTO-ST bearing dataset, PHM 2012 challenge]
relates_to:
  - "[[domain/bearing-degradation-stages]]"
  - "[[concepts/remaining-useful-life]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# PRONOSTIA (FEMTO-ST) accelerated bearing degradation platform

| | |
|---|---|
| Origin | FEMTO-ST Institute, Besançon |
| Primary citation | P. Nectoux *et al.*, *PRONOSTIA: An experimental platform for bearings accelerated degradation tests*, IEEE PHM 2012 |
| Landing page | <https://publiweb.femto-st.fr/tntnet/entries/1528/documents/author/data> |
| Dataset mirror | <https://github.com/wkzs111/phm-ieee-2012-data-challenge-dataset> |
| Accessed | 2026-08-27 |
| Kind | **Secondary.** Platform description and challenge structure read from the landing page and mirrors; the paper itself was not fetched. |

## What was taken from it

A rig that degrades real bearings to failure in hours rather than years, instrumented with:

- two orthogonal accelerometers at **25.6 kHz**
- a PT-100 temperature probe at **10 Hz**
- speed, torque and force at **100 Hz**

The IEEE PHM 2012 Prognostic Challenge used it: three operating conditions defined by speed and
radial load, **17 complete run-to-failure runs** for training and **11 truncated runs** held back for
RUL scoring.

Why it is in this corpus: it is the counter-example to [[sources/ai4i-2020-dataset]]. AI4I is
synthetic, snapshot-shaped and labelled by rule; PRONOSTIA is measured, trajectory-shaped and
labelled by the bearing actually failing. The contrast is the cleanest way to explain why a model
that scores well on one says nothing about the other. See [[concepts/remaining-useful-life]].

> **Unsourced:** a widely repeated detail (that vibration is recorded as 2 560-sample snapshots
> every 10 s) was not confirmed from the platform's own documentation and is deliberately omitted
> from the numbers above.

## What it does not cover

Bearings under accelerated radial load on one rig. Run-to-failure times on PRONOSTIA are compressed
by design and are not an estimate of service life.
`,

  "sources/industrial-predictive-maintenance-guidelines": `---
title: Industrial Predictive Maintenance Guidelines
namespace: sources
type: source
tags:
  - ingested
  - predictive-maintenance-pdm
  - vibration-analysis
  - temperature-monitoring
  - hydraulic-systems
  - lubrication-management
  - root-cause-analysis-rca
relates_to:
  - '[[domain/maintenance-strategies]]'
  - '[[domain/fmea-and-criticality]]'
  - '[[domain/misalignment-and-unbalance]]'
  - '[[domain/vibration-severity-zones]]'
  - '[[domain/envelope-analysis]]'
  - '[[domain/bearing-degradation-stages]]'
  - '[[domain/condition-monitoring-architecture]]'
  - '[[concepts/data-drift]]'
updated: 2026-08-27
updated_by: agent
confidence: medium
---

# Industrial Predictive Maintenance Guidelines

| | |
|---|---|
| Citation | unknown |
| Kind | **Primary** |
| Ingested from | [[raw/legacy-maintenance-guidelines]] |
| Ingested | 2026-08-27 |

> **Unsourced:** this page was compiled by the assistant from the raw file and has not
> been reviewed by a person. Check the citation against the document before relying on it.

## What this source establishes

- Temperature monitoring thresholds for CNC Spindle Motors (60-75°C, Warning 85°C, Critical 95°C)
- Vibration severity zones based on RMS Velocity (ISO 10816): A (0-2.8 mm/s), B (2.8-7.1 mm/s), C (7.1-18 mm/s), D (>18 mm/s)
- Tool life model using Taylor's Equation: T × V^n = C (where n ≈ 0.25)
- Tool life reduction: Doubling cutting speed reduces tool life by approximately 16×
- Hydraulic system failure response: Pressure drop >20% schedules action within 24 hours
- Bearing failure progression stages: Stage 1 (250-350 kHz), Stage 2 (2-60 kHz), Stage 3 (1-10 kHz), Stage 4 (<1 kHz)
- Lubrication intervals: Rolling bearings (<3000 RPM) require NLGI #2 grease every 2000 hours; Gear boxes require ISO VG 220 oil every 4000 hours

## What it does not cover

- Specific OEM pressure specifications for hydraulic systems
- Detailed procedures for implementing the 5-Why or Fishbone diagram analysis
- Specific material properties for tool wear calculations

## Topics

Predictive Maintenance (PdM), Vibration Analysis, Temperature Monitoring, Hydraulic Systems, Lubrication Management, Root Cause Analysis (RCA)

The original is preserved unedited at [[raw/legacy-maintenance-guidelines]]; \`raw/\` is immutable.
`,

  "sources/iso-10816-3": `---
title: ISO 10816-3
namespace: sources
type: source
tags: [standard, vibration, superseded]
relates_to:
  - "[[domain/vibration-severity-zones]]"
  - "[[sources/iso-20816-3]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# ISO 10816-3

**Full title.** *Mechanical vibration - Evaluation of machine vibration by measurements on
non-rotating parts - Part 3: Industrial machines with nominal power above 15 kW and nominal speeds
between 120 r/min and 15 000 r/min when measured in situ.*

| | |
|---|---|
| Status | **Superseded** by ISO 20816-3:2022 ([[sources/iso-20816-3]]), and still what most field instruments, spreadsheets and plant standards actually quote |
| Catalogue (authority) | <https://www.iso.org/standard/50528.html> |
| Accessed | 2026-08-27 |
| Kind | **Paywalled.** Numbers below are from a secondary source. |

## Secondary source used for the numbers

Fabrico, *ISO 10816-3 Vibration Severity: Zones, Limits and How to Read Them*,
<https://www.fabrico.io/blog/iso-10816-3-vibration-severity/>, accessed 2026-08-27.

## What was taken from it

- Measured quantity: broadband **RMS vibration velocity in mm/s**, band **10-1 000 Hz**, taken on
  the non-rotating parts: bearing housings, horizontal / vertical / axial.
- Machine groups: **Group 1** large machines above about 300 kW up to 50 MW; **Group 2** medium
  machines about 15 kW to 300 kW. Speed range 120-15 000 r/min.
- Support class: rigid or flexible, which shifts every boundary.

| Class | A/B | B/C | C/D |
|---|---|---|---|
| Group 2, rigid | 1.4 | 2.8 | 4.5 |
| Group 2, flexible | 2.3 | 4.5 | 7.1 |
| Group 1, rigid | 2.3 | 4.5 | 7.1 |
| Group 1, flexible | 3.5 | 7.1 | 11.0 |

Zone meanings: A "the vibration of a newly commissioned machine in good condition"; B "acceptable
for unrestricted long-term operation"; C "unsatisfactory for long-term running"; D "severe enough to
cause damage".

Used by [[domain/vibration-severity-zones]].

## Why a superseded standard is in this corpus at all

Because the field still quotes it. A number a technician reads off an analyser or a plant procedure
is far more likely to be an ISO 10816-3 number than an ISO 20816-3 one, and the two are close enough
that the difference is easy to miss and wrong to ignore. Keeping both, and keeping the disagreement
visible, is the point.
`,

  "sources/iso-13374-1": `---
title: ISO 13374-1:2003
namespace: sources
type: source
tags: [standard, condition-monitoring, architecture]
aliases: [ISO 13374, ISO 13374-1]
relates_to:
  - "[[domain/condition-monitoring-architecture]]"
updated: 2026-08-27
updated_by: seed
confidence: high
---

# ISO 13374-1:2003

**Full title.** *Condition monitoring and diagnostics of machines - Data processing, communication
and presentation - Part 1: General guidelines.*

| | |
|---|---|
| Designation | ISO 13374-1:2003(E) |
| Edition | First edition, 2003-03-15 |
| Committee | ISO/TC 108 *Mechanical vibration and shock*, SC 5 *Condition monitoring and diagnostics of machines* |
| Catalogue | <https://www.iso.org/standard/21832.html> |
| Read | Publicly available preview PDF, <https://cdn.standards.iteh.ai/samples/21832/4f282cf6f5594b73be0bbca7590719f1/ISO-13374-1-2003.pdf> |
| Accessed | 2026-08-27 |
| Kind | **Primary.** Clause 1 and clause 2 were read in full from the publisher's own preview. |

## What was taken from it

The six data-processing blocks and their normative one-line definitions, quoted directly from
clause 2.2.1, into [[domain/condition-monitoring-architecture]]:

| Block | The standard's own words |
|---|---|
| Data Acquisition (DA) | "converts an output from the transducer to a digital parameter representing a physical quantity and related information" |
| Data Manipulation (DM) | "performs signal analysis, computes meaningful descriptors, and derives virtual sensor readings from the raw measurements" |
| State Detection (SD) | "facilitates the creation and maintenance of normal baseline 'profiles', searches for abnormalities whenever new data are acquired, and determines in which abnormality zone, if any, the data belong" |
| Health Assessment (HA) | "diagnoses any faults and rates the current health of the equipment or process, considering all state information" |
| Prognostic Assessment (PA) | "determines future health states and failure modes based on the current health assessment and projected usage loads" |
| Advisory Generation (AG) | "provides actionable information regarding maintenance or operational changes required to optimize the life of the process and/or equipment" |

Also taken: that the first three blocks are technology-specific and the last three combine
technologies; the list of monitoring technologies the standard names (shaft displacement, bearing
vibration, tribology, infrared thermography, performance, acoustic, motor current); that ISO 13374
has four parts (general guidelines, data-processing requirements, communication requirements,
presentation requirements); and that Annex A points at the MIMOSA XML schema.

## Naming discrepancy worth knowing

Secondary summaries of ISO 13374 (including MIMOSA/OSA-CBM material) routinely call the sixth
block **"Advisory Presentation (AP)"**. The standard's own text calls it **"Advisory Generation
(AG)"**. This corpus follows the standard.

## What it does not cover

Nothing quantitative. ISO 13374-1 is an interoperability and architecture guideline: it defines
*what the blocks are and what flows between them*, not thresholds, not algorithms, and not any
numeric limit. Do not cite this page for a number. For vibration limits see
[[sources/iso-20816-3]].

Clauses 3, 4 and 5 (communication methodologies, display formats, responsible personnel) are past
the free preview and were **not** read.
`,

  "sources/iso-20816-3": `---
title: ISO 20816-3:2022
namespace: sources
type: source
tags: [standard, vibration, thresholds]
aliases: [ISO 20816, ISO 20816-3]
relates_to:
  - "[[domain/vibration-severity-zones]]"
  - "[[sources/iso-10816-3]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# ISO 20816-3:2022

**Full title.** *Mechanical vibration - Measurement and evaluation of machine vibration - Part 3:
Industrial machinery with a power rating above 15 kW and operating speeds between 120 r/min and
30 000 r/min.*

| | |
|---|---|
| Catalogue (authority) | <https://www.iso.org/standard/78311.html> |
| Committee | ISO/TC 108/SC 2 |
| Supersedes | ISO 10816-3:2009 (see [[sources/iso-10816-3]]) |
| Accessed | 2026-08-27 |
| Kind | **Paywalled.** The ISO catalogue entry is the authority for the standard's existence, scope and title. The numeric zone limits below come from a secondary source and are recorded as such. |

## Secondary source used for the numbers

Wertek, *ISO 20816 Vibration Severity Guide*, <https://wertek.ai/engineering/vibration/iso-20816-severity/>,
accessed 2026-08-27.

## What was taken from it

Scope: rated power above 15 kW, operating speed 120 r/min to 30 000 r/min. Measurement band
10 Hz to 1 000 Hz. Four evaluation zones, with the same A/B/C/D meaning ISO 10816-3 used.

Zone boundaries in mm/s RMS velocity, as tabulated by the secondary source:

| Boundary | Group 1 | Group 2 | Group 3 | Group 4 |
|---|---|---|---|---|
| A/B | 2.3 | 1.4 | 3.5 | 2.3 |
| B/C | 4.5 | 2.8 | 7.1 | 4.5 |
| C/D | 7.1 | 4.5 | 11.2 | 7.1 |

Used by [[domain/vibration-severity-zones]].

> **Conflict (2026-08-27):** the C/D boundary for the largest flexible-support class is quoted as
> **11.2 mm/s** here and as **11.0 mm/s** by the ISO 10816-3 secondary in [[sources/iso-10816-3]].
> One of the two has rounded. Neither was checked against the purchased standard. Treat the last
> significant figure of that boundary as unverified.

## What it does not cover

The zone boundaries alone do not decide anything. The standard also evaluates displacement, sets
criteria for *change* from a baseline as well as absolute magnitude, and defines the machine groups
by power and support flexibility, none of which was read from the standard itself. Anything in this
corpus about machine-group assignment is inference from the secondary tables, not from ISO text.
`,

  "sources/nowlan-heap-1978-rcm": `---
title: Nowlan and Heap (1978), Reliability-Centered Maintenance
namespace: sources
type: source
tags: [reliability, rcm, p-f-curve, strategy]
aliases: [Nowlan and Heap, RCM 1978]
relates_to:
  - "[[domain/p-f-curve]]"
  - "[[domain/maintenance-strategies]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# Nowlan and Heap (1978), *Reliability-Centered Maintenance*

| | |
|---|---|
| Authors | F. Stanley Nowlan and Howard F. Heap, United Airlines |
| Published | 1978, report prepared for the U.S. Department of Defense |
| Secondary sources read | eMaint, *P-F Curve Explained*, <https://www.emaint.com/resources/blog/p-f-curve-explained-definition-and-explanation>; Reliabilityweb, *Completing the Curve*, <https://reliabilityweb.com/articles/entry/completing-the-curve> |
| Accessed | 2026-08-27 |
| Kind | **Secondary.** The 1978 report itself was not fetched. The definition below is quoted by both secondary sources as the report's own wording. |

## What was taken from it

The origin of the **P-F curve** and its two named points:

- **Potential failure (P)**: "an identifiable physical condition which indicates that a functional
  failure is imminent".
- **Functional failure (F)**: the point at which the item no longer meets a stated standard of
  performance. Crucially **not** the same as catastrophic failure: a machine can be running and
  already functionally failed.

The **P-F interval** is the time between the two, and it is the quantity that sets how often you have
to look. Nowlan and Heap's underlying finding (that condition-based intervention outperforms
age-based replacement for most failure patterns) is the argument this whole application rests on.
See [[domain/p-f-curve]] and [[domain/maintenance-strategies]].

## What it does not cover

No P-F interval values. The interval is per failure mode, per machine, per detection technique, and
the report does not tabulate them; anyone quoting "the P-F interval for bearings" without naming a
technique is quoting nothing. This corpus does not state one.
`,

  "sources/repo-maintenance-guidelines": `---
title: In-repo Maintenance Guidelines (legacy)
namespace: sources
type: source
tags: [internal, legacy, unsourced]
aliases: [maintenance_guidelines.md, rag_docs]
relates_to:
  - "[[domain/thermal-failure-modes]]"
  - "[[domain/lubrication-failure]]"
  - "[[domain/vibration-severity-zones]]"
updated: 2026-08-27
updated_by: seed
confidence: low
---

# In-repo Maintenance Guidelines (legacy document)

| | |
|---|---|
| Origin | \`maintenance_guidelines.md\`, the only domain document this project originally shipped with |
| Preserved at | [[raw/legacy-maintenance-guidelines]] in this vault: the original, unedited, so every claim below can be checked against it |
| Kind | **Internal, uncited.** It carries no references of its own and no author. Its provenance is unknown; its style suggests it was generated rather than compiled. |
| Status | Superseded by this corpus. Retained here so the claims it made can be traced. |
| Accessed | 2026-08-27 |

## Why it is recorded as a source at all

Because it was the only domain knowledge this application shipped with, it was wired into a FAISS
retrieval pipeline that **nothing ever called**: the retriever module had no callers, so the
document was unreachable at runtime for its entire life. Content that was never read cannot have
been validated by use. Everything it asserts should be treated as a claim to check, not a fact.

## What was taken from it

Operationally plausible, uncited material, carried forward **marked as unsourced**:

- per-equipment temperature bands (CNC spindles, hydraulics, compressors, heat exchangers, conveyor
  motors) → [[domain/thermal-failure-modes]]
- lubrication intervals and failure signs → [[domain/lubrication-failure]]
- tool wear categories and the Taylor tool-life relation → [[domain/tool-wear]]
- the risk/health priority matrix → [[domain/maintenance-strategies]]

## What was rejected

Its ISO 10816 table:

| Its zone | Its range (mm/s RMS) |
|---|---|
| A (Good) | 0-2.8 |
| B (Acceptable) | 2.8-7.1 |
| C (Warning) | 7.1-18 |
| D (Danger) | >18 |

> **Conflict (2026-08-27):** these are **not** ISO 10816-3 values for any machine group. The
> standard's Group 2 rigid boundaries are 1.4 / 2.8 / 4.5 mm/s and even the most permissive class in
> [[sources/iso-10816-3]] tops out at 11.0 mm/s, not 18. A machine sitting at 6 mm/s is "Acceptable"
> by this document and already past the C/D line (a *stop immediately* condition) for a Group 2
> rigid machine. The correct figures are on [[domain/vibration-severity-zones]]; this table is
> recorded only so that anyone who saw it can recognise where the wrong number came from.

Its bearing-stage frequency bands (250-350 kHz ultrasonic, 2-60 kHz, 1-10 kHz audible) and its
fixed remaining-life claims ("plan replacement in 30 days") are likewise uncited and are **not**
carried into [[domain/bearing-degradation-stages]], which uses [[sources/crowe-2007-bearing-faults]]
instead. Crowe's own finding is that the time through those stages ranges from hours to years, which
makes a fixed "30 days" untenable.
`,
};
