/**
 * The `domain/` namespace: condition monitoring and failure physics.
 *
 * Compiled from public standards and published literature. Every numeric claim carries a
 * `sources:` entry or an explicit Unsourced callout, because a threshold without a citation is
 * folklore. Nothing here describes a machine on a real floor; that is what `fleet/` is for, and
 * the two namespaces are allowed to disagree.
 */

export const DOMAIN_PAGES: Record<string, string> = {
  "domain/bearing-degradation-stages": `---
title: Bearing Degradation Stages
namespace: domain
type: concept
tags: [bearing, vibration, prognostics]
aliases: [bearing stages, bearing progression]
sources:
  - "[[sources/crowe-2007-bearing-faults]]"
  - "[[sources/femto-pronostia]]"
relates_to:
  - "[[domain/bearing-failure-modes]]"
  - "[[domain/p-f-curve]]"
detected_by:
  - "[[domain/envelope-analysis]]"
updated: 2026-08-27
updated_by: seed
confidence: high
---

# Bearing Degradation Stages

A bearing does not fail suddenly; it walks down a predictable path, and **the detection technique
that works changes at each step**. The single most useful property: damage is first visible at high
frequency and only later at low frequency, so the earliest warning comes from the technique nobody
looks at by default.

## The progression

| Stage | What is visible | What sees it |
|---|---|---|
| 1 | nothing in ordinary velocity or acceleration data | demodulation / PeakVue / spike energy / high-frequency band; [[domain/envelope-analysis]] |
| 2 | peaks at the defect frequency, high in the acceleration spectrum; fundamental often still absent | acceleration spectrum |
| 3 | waveform amplitude rising; the **fundamental** defect frequency now visible in velocity; sidebands appear if inner-race or rolling-element | velocity spectrum + waveform |
| 4 | more harmonics, higher amplitudes, sideband amplitudes growing | any |
| 5 | *other* components' frequencies appear from debris and impacting; frequencies shift slightly as geometry changes; peaks start to smear | any |
| 6 | waveform amplitude may **fall** as impact edges smooth; peaks spread; noise floor rises; 1× and harmonics grow as clearance lets the mass centre shift | any |

**Stage 6 is the trap.** A falling amplitude late in life reads like recovery and is the opposite. If
the peaks are smearing and the noise floor is climbing, a smaller number is worse news, not better.

## How long the stages take

Not a fixed number, and anyone who gives you one is guessing. Observed spans:

- **hours**: friction and overheating, e.g. coolant washing the grease out ([[domain/lubrication-failure]])
- **months**: adequate lubrication but overloaded
- **years**: mounting or handling damage that never progresses. One fan motor bearing showed
  outer-race defect frequencies from first start in April 2000 and was still not in alarm in
  June 2006.

This is exactly why the [[domain/p-f-curve]] interval is per failure mode and per technique rather
than per component, and why a fixed "replace within 30 days on detection" rule is unsupportable.

> **Conflict (2026-08-27):** the legacy document in [[sources/repo-maintenance-guidelines]] gives a
> four-stage model with specific frequency bands (250-350 kHz, 2-60 kHz, 1-10 kHz) and fixed
> remaining-life figures ("plan replacement in 30 days"). It cites nothing, its 250-350 kHz band is
> far above where accelerometers usefully respond, and its fixed timelines contradict the
> hours-to-years range above. This page follows [[sources/crowe-2007-bearing-faults]].

Run-to-failure data with real stage transitions is available from
[[sources/femto-pronostia]], though on an accelerated rig, so its absolute durations are compressed
by design.
`,

  "domain/bearing-failure-modes": `---
title: Rolling-Element Bearing Failure Modes
namespace: domain
type: failure-mode
tags: [bearing, vibration, rotating-equipment, diagnostics]
aliases: [bearing fault, bearing defect frequencies, BPFO, BPFI, BSF, FTF]
sources:
  - "[[sources/crowe-2007-bearing-faults]]"
caused_by:
  - "[[domain/lubrication-failure]]"
  - "[[domain/misalignment-and-unbalance]]"
detected_by:
  - "[[domain/envelope-analysis]]"
relates_to:
  - "[[domain/bearing-degradation-stages]]"
  - "[[domain/vibration-severity-zones]]"
updated: 2026-08-27
updated_by: seed
confidence: high
---

# Rolling-Element Bearing Failure Modes

Every defect on a bearing surface produces an impact each time a rolling element passes over it. The
*rate* of those impacts is fixed by the bearing's geometry and the shaft speed, so each component
announces itself at its own frequency.

## The four defect frequencies

With \`Nb\` rolling elements, \`Pd\` pitch diameter, \`Bd\` element diameter, \`Ca\` contact angle and \`Ts\`
shaft turning speed:

\`\`\`
BPFI = Nb/2 * Ts * (1 + Bd/Pd * cos Ca)      inner race
BPFO = Nb/2 * Ts * (1 - Bd/Pd * cos Ca)      outer race
BSF  = Pd/(2*Bd) * Ts * [1 - (Bd/Pd)^2 * (cos Ca)^2]   rolling element
FTF  = Ts/2 * (1 - Bd/Pd * cos Ca)           cage, inner rotating
FTF  = Ts/2 * (1 + Bd/Pd * cos Ca)           cage, outer rotating
\`\`\`

When the geometry is unknown, these approximations land within about ±20 %:

| Defect | Approximation |
|---|---|
| inner race | \`0.6 * Nb * Ts\` |
| outer race | \`0.4 * Nb * Ts\` |
| rolling element, under 10 elements | \`0.23 * Nb * Ts\` |
| rolling element, 10 or more | \`0.18 * Nb * Ts\` |
| cage | \`0.4 * Ts\` |

**These frequencies are never exact multiples of shaft speed.** That is the property that makes them
identifiable: a peak at 3.00× is looseness, a peak at 3.07× is a bearing. Anything synchronous is
[[domain/misalignment-and-unbalance]], not a bearing.

## Which component failed: read the sidebands

The frequency tells you *a* bearing is damaged. The sideband pattern tells you *which part*:

| Defect | Sidebands | Why |
|---|---|---|
| **Inner race** | spaced at **shaft speed** | the defect rotates in and out of the load zone once per revolution, so impact amplitude is modulated at 1× |
| **Rolling element** | spaced at **cage frequency** | the element travels with the cage; often only *even* multiples of BSF appear, because the element strikes both races each revolution |
| **Outer race** | **none** | the defect sits in the load zone, so every impact is the same size and there is nothing to modulate |

## Measurement requirements

- Enough spectral resolution to separate defect frequencies from everything else.
- A waveform covering **at least 12 shaft revolutions**, or the cage frequency cannot be resolved.
- The shaft speed must be known. On a multi-shaft machine, every shaft speed must be known.
- Early defects appear at high frequency: the first peaks visible are usually *harmonics*, with the
  fundamental absent. Look in acceleration, not velocity. See [[domain/envelope-analysis]].

## What amplitude does not tell you

Absolute amplitude is not severity. An inner-race defect reads lower than an identical outer-race
defect purely because its energy travels through a rolling element before reaching the housing, and
moving the sensor a few inches changes the number again. Watch the rate of change and the pattern.

Bearings fail at an exponential rate: past a certain point the remaining time is very short. See
[[domain/bearing-degradation-stages]] and [[domain/p-f-curve]].
`,

  "domain/condition-monitoring-architecture": `---
title: Condition Monitoring Architecture
namespace: domain
type: concept
tags: [architecture, condition-monitoring, standards]
aliases: [OSA-CBM, six-block model, ISO 13374 model]
sources:
  - "[[sources/iso-13374-1]]"
relates_to:
  - "[[domain/vibration-severity-zones]]"
  - "[[domain/maintenance-strategies]]"
  - "[[concepts/remaining-useful-life]]"
updated: 2026-08-27
updated_by: seed
confidence: high
---

# Condition Monitoring Architecture

ISO 13374-1 breaks machine condition assessment into **six layered processing blocks**. The value of
the model is not that it is prescriptive; it is that it gives every stage a name, so a conversation
about "the model isn't working" can be pinned to the block where it actually isn't working.

| # | Block | What it does |
|---|---|---|
| 1 | **Data Acquisition (DA)** | turns a transducer output into a digital parameter plus its context: time, calibration, data quality, sensor configuration |
| 2 | **Data Manipulation (DM)** | signal analysis, meaningful descriptors, virtual sensor readings derived from the raw measurements |
| 3 | **State Detection (SD)** | maintains normal baseline profiles, looks for abnormality on each new reading, decides which zone it falls in: alert, alarm, or neither |
| 4 | **Health Assessment (HA)** | diagnoses faults and rates current health, considering all state information |
| 5 | **Prognostic Assessment (PA)** | projects future health states and failure modes given current health and expected load, including remaining useful life |
| 6 | **Advisory Generation (AG)** | produces the actionable recommendation |

The first three are **technology-specific**: a vibration pipeline and an oil-analysis pipeline share
nothing at these layers. The last three **combine technologies**, because a diagnosis worth acting on
almost never rests on one sensor.

The standard names the technologies it expects to see fused: shaft displacement, bearing vibration,
tribology, infrared thermography, performance, acoustics, and motor current.

## Where this application sits

| Block | Here |
|---|---|
| DA | telemetry ingestion: batch upload and MQTT |
| DM | preprocessing recipes: resampling, derived features, encoding ([[concepts/feature-engineering-for-telemetry]]) |
| SD | thresholds and zone comparison ([[domain/vibration-severity-zones]], [[domain/thermal-failure-modes]]) |
| HA | the trained classifier: failure probability and severity |
| PA | the simulator, projecting risk over a horizon |
| AG | the chat agent proposing a recommendation for human approval |

Naming the blocks separates two questions that get conflated constantly: *is the model wrong* (HA),
or *is it being fed the wrong thing* (DM)? A drifting feature is a DM problem wearing an HA costume.
See [[concepts/data-drift]].

## What the standard does not give you

Any number. ISO 13374 is an interoperability guideline: it defines the blocks and what passes
between them, and deliberately sets no thresholds and no algorithms. Every limit in this corpus comes
from somewhere else.

> The sixth block is **Advisory Generation (AG)** in the standard's own text. Most secondary material,
> including OSA-CBM literature, calls it "Advisory Presentation (AP)". Same block.
`,

  "domain/envelope-analysis": `---
title: Envelope Analysis
namespace: domain
type: concept
tags: [vibration, bearing, signal-processing, diagnostics]
aliases: [demodulation, PeakVue, spike energy, high-frequency demodulation]
sources:
  - "[[sources/crowe-2007-bearing-faults]]"
detects:
  - "[[domain/bearing-failure-modes]]"
  - "[[domain/bearing-degradation-stages]]"
relates_to:
  - "[[domain/vibration-severity-zones]]"
updated: 2026-08-27
updated_by: seed
confidence: high
---

# Envelope Analysis

Early bearing damage is low in amplitude and high in frequency: precisely the combination a
broadband velocity measurement discards. Envelope analysis (demodulation, and the vendor variants
PeakVue, spike energy, HFD) high- or band-pass filters to isolate that high-frequency impact energy,
then demodulates it so the *repetition rate* of the impacts becomes visible at low frequency.

## Why it beats broadband RMS early on

- In ordinary acceleration data, an early defect shows only as **harmonics**: the fundamental defect
  frequency is missing, so a cursor placed where the fault "should" be finds nothing.
- Under demodulation the **fundamental appears**, which is what makes the defect identifiable rather
  than merely present.
- It routinely indicates a defect before anything is visible in velocity or acceleration at all.

The documented case: a bearing with an early rolling-element defect showed the defect frequency
clearly under PeakVue while velocity data from the *same accelerometer at the same moment*, cursor on
the same frequency, showed nothing.

## When it is the wrong tool

Once the defect is advanced, the fundamental and its harmonics are visible in ordinary spectra and
the extra processing buys little. Envelope analysis is a stage-1 and stage-2 instrument; see
[[domain/bearing-degradation-stages]].

## Slow machines

It works at very low speed, at a cost. Resolving closely spaced frequencies needs a low f-max and
high resolution, and that means long acquisitions. A roll chock bearing turning under 0.4 rpm took
nearly **25 minutes for a single average**; its inner-race defect frequency was 23.56 orders of
running speed and the first twelve orders were still below 2 Hz.

If your sampling window is short, you are not measuring slow machinery; you are measuring noise.
That constraint is the same one behind [[concepts/resampling-and-aggregation]].
`,

  "domain/fmea-and-criticality": `---
title: FMEA and Criticality
namespace: domain
type: concept
tags: [fmea, risk, criticality, strategy]
aliases: [failure mode effects analysis, RPN, Action Priority]
sources:
  - "[[sources/aiag-vda-fmea-2019]]"
relates_to:
  - "[[domain/maintenance-strategies]]"
  - "[[concepts/threshold-selection]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# FMEA and Criticality

Failure Mode and Effects Analysis is how a fleet decides *which* machines are worth instrumenting at
all. Every predictive-maintenance programme is a resource allocation before it is a modelling
problem, and FMEA is the allocation method.

## RPN, and why it was retired

The classic score is the **Risk Priority Number**: Severity × Occurrence × Detection, each rated
1-10, product 1-1 000.

Its flaw is structural. Multiplying treats the three as interchangeable, so a failure mode that
kills someone scores low if it is rare and easy to detect, and drops below a frequent, harmless,
hard-to-spot nuisance. The arithmetic lets severity be traded away.

The **2019 AIAG-VDA FMEA Handbook replaced RPN with Action Priority (AP)**: a fixed table mapping all
1 000 S/O/D combinations to High, Medium or Low, ordered by **Severity first**, then Occurrence, then
Detection. Severity can no longer be bought off with good detection.

The AP table is not reproduced here: it is copyrighted, and paraphrasing 1 000 rows from a summary
would be exactly the kind of unsourced number this corpus refuses to publish. See
[[sources/aiag-vda-fmea-2019]].

## Why this belongs next to the ML work

Two reasons, both practical:

1. **It tells you what to model.** A high-AP failure mode with poor detectability is precisely where
   a sensor and a model earn their cost. A low-AP mode is not worth a pipeline no matter how good the
   data is.
2. **It sets the cost matrix.** Severity is the missing input in
   [[concepts/threshold-selection]]: whether a false negative is a hundred times worse than a false
   positive, or twice as bad, is an FMEA question, not a modelling one. Picking a threshold without
   it is picking one arbitrarily.

The same reasoning drives [[domain/maintenance-strategies]]: which failures get watched, and how.
`,

  "domain/lubrication-failure": `---
title: Lubrication Failure
namespace: domain
type: failure-mode
tags: [lubrication, tribology, bearing, unsourced]
aliases: [film breakdown, grease failure, over-greasing]
sources:
  - "[[sources/repo-maintenance-guidelines]]"
  - "[[sources/crowe-2007-bearing-faults]]"
causes:
  - "[[domain/bearing-failure-modes]]"
  - "[[domain/thermal-failure-modes]]"
relates_to:
  - "[[domain/maintenance-strategies]]"
updated: 2026-08-27
updated_by: seed
confidence: low
---

# Lubrication Failure

Lubrication failure is upstream of most bearing failure. It is also the fastest path to catastrophe:
[[sources/crowe-2007-bearing-faults]] records a bearing going from first indication to catastrophic
failure **in a few hours** when coolant washed the grease out, against months for the same
progression on a merely overloaded bearing.

## Mechanisms

- **Film breakdown**: the elastohydrodynamic film thins until asperities contact. Friction and heat
  rise, which thins the film further.
- **Contamination ingress**: particles act as abrasive; water destroys the film and corrodes.
- **Wash-out**: coolant or process fluid displaces grease. The fastest mode.
- **Over-greasing**: churning raises temperature and can blow the seal that was keeping
  contamination out, so the "safe" error mode is not safe.
- **Under-greasing**: increased vibration and audible bearing noise before anything else changes.

## Field signs

| Sign | Reading |
|---|---|
| milky appearance | water ingress |
| gritty feel | particulate contamination |
| elevated temperature *and* seal damage | over-greased |
| rising vibration and bearing noise | under-greased |

## Intervals

> **Unsourced:** from [[sources/repo-maintenance-guidelines]], which cites nothing. Intervals are
> properly set by the bearing manufacturer's relubrication calculation from speed factor, temperature
> and load, not from a table. These are recorded for traceability, not endorsed.

| Component | Lubricant | Interval |
|---|---|---|
| Rolling bearings under 3 000 rpm | NLGI #2 grease | 2 000 h |
| Rolling bearings over 3 000 rpm | NLGI #1 grease | 500 h |
| Plain bearings | ISO VG 46 oil | monthly |
| Gearboxes | ISO VG 220 oil | 4 000 h |

## Why it matters to the model

Lubrication state is rarely instrumented, so it acts as a **hidden variable**: two machines with
identical telemetry can have completely different remaining life because one is being washed out and
the other is not. A model that has never seen the lubrication state cannot distinguish them, and its
confidence on both will look the same. That is a limit of the data, not of the algorithm; see
[[concepts/remaining-useful-life]].
`,

  "domain/maintenance-strategies": `---
title: Maintenance Strategies
namespace: domain
type: concept
tags: [strategy, reliability, economics]
aliases: [reactive, preventive, condition-based, predictive maintenance]
sources:
  - "[[sources/nowlan-heap-1978-rcm]]"
  - "[[sources/repo-maintenance-guidelines]]"
relates_to:
  - "[[domain/p-f-curve]]"
  - "[[domain/fmea-and-criticality]]"
  - "[[domain/condition-monitoring-architecture]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# Maintenance Strategies

Four strategies, and the honest position is that all four are correct somewhere. Choosing is an
economics question answered per failure mode, not a technology question answered once.

| Strategy | Trigger | Right when |
|---|---|---|
| **Reactive** | it broke | consequence is low, spares are cheap, redundancy exists. Running a light to failure is not negligence, it is arithmetic. |
| **Preventive** | elapsed time or cycles | failure really is age-related, and inspection costs more than the part |
| **Condition-based** | a measured condition crosses a line | the condition is measurable and the [[domain/p-f-curve]] interval is longer than the response time |
| **Predictive** | a model projects a future condition | there is enough history to learn a degradation trajectory, and acting early is cheaper than acting late |

Nowlan and Heap's finding was that condition-based intervention outperforms age-based replacement for
most failure patterns: most components do not wear out on a schedule, so replacing them on one both
wastes life and misses failures. That result is the reason this application exists.

## Where predictive stops being worth it

Predictive maintenance costs sensors, pipelines, models and attention. It repays that when:

- the failure mode is high-consequence; see [[domain/fmea-and-criticality]]
- the P-F interval is long enough to act within
- the degradation is actually observable in the data you have

Fail any of those and condition-based, or even preventive, is the better engineering answer. A model
predicting a failure nobody can act on in time is a more expensive way of being surprised.

## Prioritisation matrix

> **Unsourced:** from [[sources/repo-maintenance-guidelines]]. It is a reasonable shape for a
> triage rule and it is not traceable to any standard. Response times in particular are a property of
> a specific site's staffing, not a general fact.

| Risk score | Health score | Priority | Response |
|---|---|---|---|
| >70 % | <50 | Critical | immediate, under 4 h |
| 50-70 % | 50-70 | High | same day, under 8 h |
| 30-50 % | 70-85 | Medium | within 48 h |
| <30 % | >85 | Low | next planned cycle |

The thresholds in that table are choices, not measurements. What makes them defensible is the cost
reasoning behind them; see [[concepts/threshold-selection]].
`,

  "domain/misalignment-and-unbalance": `---
title: Misalignment and Unbalance
namespace: domain
type: failure-mode
tags: [vibration, rotating-equipment, diagnostics]
aliases: [unbalance, imbalance, misalignment, 1x, 2x]
sources:
  - "[[sources/crowe-2007-bearing-faults]]"
  - "[[sources/repo-maintenance-guidelines]]"
causes:
  - "[[domain/bearing-failure-modes]]"
detected_by:
  - "[[domain/vibration-severity-zones]]"
relates_to:
  - "[[domain/envelope-analysis]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# Misalignment and Unbalance

The two most common rotating-machinery faults, and the two most commonly confused. Both are
**synchronous** (they live at exact multiples of shaft speed), which is what separates them cleanly
from [[domain/bearing-failure-modes]], whose frequencies never land on an exact multiple.

| | Dominant order | Direction | Typical cause |
|---|---|---|---|
| **Unbalance** | 1× | radial | mass distribution: debris, erosion, a lost balance weight |
| **Misalignment** | 2× (with 1×) | often strong **axial** | coupling, soft foot, thermal growth, pipe strain |

The axial component is the discriminator worth remembering: unbalance is a radial phenomenon, so a
strong axial reading at 2× points at alignment rather than balance.

> **Unsourced:** the further rule of thumb that looseness shows at 3-5× shaft speed comes from
> [[sources/repo-maintenance-guidelines]] and is not attributable to a standard or a primary
> reference. It is widely repeated in the field and is recorded here as folklore, not as fact.

## Why they belong in a predictive-maintenance corpus

Because they are *causes*, not just faults. Misalignment loads a bearing outside its design envelope
and shifts the load zone, which is one of the ways an otherwise healthy bearing starts down
[[domain/bearing-degradation-stages]]. Fixing the bearing without fixing the alignment buys a repeat
failure.

They also matter diagnostically: [[sources/crowe-2007-bearing-faults]] warns that a bearing defect
must never be mistaken for unbalance, misalignment, looseness or vane pass, because all of those
generate exact harmonics of turning speed. If the peak is at exactly 2.00×, stop looking for a
bearing.

## Where this shows up here

Both are visible in broadband severity ([[domain/vibration-severity-zones]]) because both raise
overall velocity, unlike early bearing damage, which does not. A machine whose overall velocity has
climbed into zone C without any high-frequency signature is far more likely misaligned than
bearing-damaged.
`,

  "domain/p-f-curve": `---
title: The P-F Curve
namespace: domain
type: concept
tags: [reliability, strategy, prognostics]
aliases: [P-F interval, potential failure, functional failure]
sources:
  - "[[sources/nowlan-heap-1978-rcm]]"
  - "[[sources/crowe-2007-bearing-faults]]"
relates_to:
  - "[[domain/maintenance-strategies]]"
  - "[[domain/bearing-degradation-stages]]"
  - "[[concepts/remaining-useful-life]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# The P-F Curve

From Nowlan and Heap's 1978 *Reliability-Centered Maintenance*, the idea the whole
condition-monitoring discipline rests on.

- **P, potential failure**: "an identifiable physical condition which indicates that a functional
  failure is imminent". The first moment anything is detectable.
- **F, functional failure**: the point at which the item no longer meets a stated standard of
  performance. **Not** catastrophic failure: a machine can be running, and already functionally
  failed.
- **The P-F interval**: the time between them. This is the number that matters.

## Why the interval sets the sampling rate

To catch a failure you must inspect more often than the P-F interval, conventionally at least twice
within it, so that a single missed or ambiguous reading does not cost you the whole warning. That
single relationship decides:

- how often telemetry must be sampled and retained
- how far ahead a forecast has to reach to be actionable
- whether a detection technique is worth deploying at all

A technique whose P-F interval is shorter than your response time is useless no matter how accurate
it is. Detecting a failure four hours out, when parts take two days to arrive, buys nothing.

## The interval is per technique, not per component

This is the part most often got wrong. The same bearing has a long P-F interval under
[[domain/envelope-analysis]] and a short one under broadband velocity, because envelope analysis sees
stage 1 and velocity does not see it until stage 3. Choosing a detection technique *is* choosing a
P-F interval.

And the interval is not a constant even then. [[sources/crowe-2007-bearing-faults]] reports the same
bearing progression taking hours (coolant wash-out), months (overload) or years (handling damage). A
single "P-F interval for bearings" figure does not exist, and this corpus does not state one; see
[[domain/bearing-degradation-stages]].

## Relationship to RUL

Remaining useful life is a quantitative estimate of where you are on the interval. The P-F curve is
the qualitative frame that makes the RUL number mean something: an RUL of 10 cycles is actionable or
not depending entirely on how long it takes to act. See [[concepts/remaining-useful-life]].
`,

  "domain/thermal-failure-modes": `---
title: Thermal Failure Modes
namespace: domain
type: failure-mode
tags: [temperature, thermal, unsourced]
aliases: [overheating, thermal cycling, coolant fouling]
sources:
  - "[[sources/repo-maintenance-guidelines]]"
  - "[[sources/ai4i-2020-dataset]]"
caused_by:
  - "[[domain/lubrication-failure]]"
relates_to:
  - "[[domain/condition-monitoring-architecture]]"
  - "[[fleet/ai4i-milling-machine]]"
updated: 2026-08-27
updated_by: seed
confidence: low
---

# Thermal Failure Modes

Heat is the cheapest thing on a machine to measure and the slowest to move, which makes it a
confirming signal rather than an early one. By the time a bearing runs hot, vibration has usually
been telling you for weeks; see [[domain/bearing-degradation-stages]].

## Mechanisms

- **Overheating.** Sustained operation above nominal degrades the lubricant, which raises friction,
  which raises temperature. It is a runaway, not a plateau. See [[domain/lubrication-failure]].
- **Thermal cycling.** Repeated heat/cool cycles fatigue fasteners, seals and joints. The damage is
  driven by the number and depth of cycles, not by peak temperature, so a machine that never trips a
  high-temperature alarm can still fail this way.
- **Heat-dissipation loss.** Fouled exchangers, blocked fins, failing fans and low coolant flow all
  present the same way: the *difference* between the process and its cooling medium narrows while
  absolute temperature may barely move.

That last mechanism is worth dwelling on, because it is the one this application actually models.
The AI4I heat-dissipation failure mode fires when the **air-to-process temperature difference falls
below 8.6 K while rotational speed is below 1 380 rpm**: a differential-and-load condition, not a
temperature threshold ([[sources/ai4i-2020-dataset]], [[fleet/ai4i-milling-machine]]). A single-sensor
temperature alarm would never catch it.

## Operating bands

> **Unsourced:** the table below comes from [[sources/repo-maintenance-guidelines]], an internal
> document with no citations of its own, which was wired to a retrieval path that nothing ever
> called. The values are plausible and were used as a starting point. They are **not** traceable to a
> standard or an OEM specification, and no machine in this fleet has been checked against them.
> Treat them as a prompt to go and find the real OEM limit, not as the limit.

| Equipment | Normal (°C) | Warning | Critical |
|---|---|---|---|
| CNC spindle motors | 60-75 | 85 | 95 |
| Hydraulic systems | 40-60 | 70 | 80 |
| Compressors | 70-85 | 95 | 105 |
| Heat exchangers | 50-80 | 90 | 100 |
| Conveyor motors | 40-55 | 65 | 75 |

## Reading a temperature signal

- A single-point spike is usually the sensor or the coolant flow, not the machine.
- A slow rise against a stable ambient is the one to act on. Always compare against ambient or against
  the cooling medium, never against a fixed number alone: a 70 °C reading means different things in
  winter and in August.
- Observed values for a specific machine belong on that machine's \`fleet/\` page, not here.
`,

  "domain/tool-wear": `---
title: Tool Wear
namespace: domain
type: failure-mode
tags: [machining, tool-wear, cnc]
aliases: [flank wear, TWF, OSF, overstrain]
sources:
  - "[[sources/ai4i-2020-dataset]]"
  - "[[sources/repo-maintenance-guidelines]]"
causes:
  - "[[domain/thermal-failure-modes]]"
relates_to:
  - "[[fleet/ai4i-milling-machine]]"
  - "[[domain/p-f-curve]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# Tool Wear

Tool wear is the mechanism behind two of the five AI4I failure modes, and it is the cleanest example
in this corpus of a failure that is **cumulative and monotonic** rather than event-driven, which
changes how it should be modelled.

## The two mechanisms in the data

- **TWF, tool wear failure**: the tool is replaced or fails at a randomly chosen accumulated wear
  between **200 and 240 minutes**. Wear alone, no interaction.
- **OSF, overstrain failure**: **tool wear × torque** exceeds **11 000 minNm** for the L quality
  variant, **12 000** for M, **13 000** for H. This is the interesting one: neither wear nor torque
  alone predicts it, and a model given only the two raw columns has to learn the product. Supplying
  \`tool_wear * torque\` as a derived feature turns a non-linear boundary into a linear one. See
  [[concepts/derived-features]].

Both from [[sources/ai4i-2020-dataset]], which is the data behind [[fleet/ai4i-milling-machine]].

## Wear modes

> **Unsourced:** the categories and their responses come from
> [[sources/repo-maintenance-guidelines]] and are not traceable to a standard.

| Mode | Typical driver | Response quoted |
|---|---|---|
| Flank wear (VB) | normal abrasive wear | replace at VB = 0.3 mm |
| Crater wear | high cutting speed | reduce spindle speed |
| Thermal cracking | coolant problem | check coolant concentration |
| Chipping | interrupted cut | reduce feed rate |

The same document quotes the Taylor tool-life relation \`T × V^n = C\` with \`n ≈ 0.25\`, and the
consequence that doubling cutting speed cuts tool life by roughly 16×. Taylor's equation is genuine
and standard machining theory; the exponent is material- and tool-specific, and \`0.25\` is a
representative value, not a constant.

## Why wear is a good prognostic target

Tool wear is one of the rare industrial signals that is genuinely monotonic and observable, so
remaining-life estimation on it is unusually well-posed: the P in the [[domain/p-f-curve]] sense is
simply "wear crossed a line", and the interval to F is measurable in minutes of cutting. Contrast
[[domain/bearing-degradation-stages]], where the same question has an answer spanning hours to years.
`,

  "domain/vibration-severity-zones": `---
title: Vibration Severity Zones
namespace: domain
type: reference
tags: [vibration, thresholds, standards, rotating-equipment]
aliases: [ISO vibration zones, vibration severity, zone A B C D]
sources:
  - "[[sources/iso-20816-3]]"
  - "[[sources/iso-10816-3]]"
  - "[[sources/repo-maintenance-guidelines]]"
relates_to:
  - "[[domain/condition-monitoring-architecture]]"
detects:
  - "[[domain/misalignment-and-unbalance]]"
updated: 2026-08-27
updated_by: seed
confidence: high
---

# Vibration Severity Zones

The broadband severity check: one number, **RMS vibration velocity in mm/s over 10-1 000 Hz**,
measured on non-rotating parts: bearing housings, horizontal, vertical and axial. It answers "is
this machine acceptable", not "what is wrong with it". For the second question see
[[domain/bearing-failure-modes]] and [[domain/misalignment-and-unbalance]].

## The four zones

| Zone | Meaning |
|---|---|
| **A** | the vibration of a newly commissioned machine in good condition |
| **B** | acceptable for unrestricted long-term operation |
| **C** | unsatisfactory for long-term running; operate on a limited basis until you can intervene |
| **D** | severe enough to cause damage |

## Boundaries

Two standards are in play. **ISO 20816-3:2022** is current and supersedes **ISO 10816-3**, but the
older numbers are what most instruments, spreadsheets and plant procedures still quote, so both are
recorded.

ISO 10816-3, by machine group and support class: group by power, class by whether the machine and
its foundation are rigid or flexible:

| Class | A/B | B/C | C/D |
|---|---|---|---|
| Group 2 (≈15-300 kW), rigid | 1.4 | 2.8 | 4.5 |
| Group 2, flexible | 2.3 | 4.5 | 7.1 |
| Group 1 (≈300 kW to 50 MW), rigid | 2.3 | 4.5 | 7.1 |
| Group 1, flexible | 3.5 | 7.1 | 11.0 |

ISO 20816-3 keeps the same ladder and extends the speed range to 120-30 000 r/min (ISO 10816-3
stopped at 15 000 r/min), for machines rated above 15 kW.

**The single most important thing on this page:** the boundary depends on the machine. 4.5 mm/s is
the *stop* line for a 30 kW rigid-mounted pump and merely the *watch* line for a 2 MW flexible-mounted
machine. A threshold quoted without its machine group and support class is not a threshold.

> **Conflict (2026-08-27):** the C/D boundary for the largest flexible class is quoted as 11.0 mm/s
> by the ISO 10816-3 secondary and 11.2 mm/s by the ISO 20816-3 secondary. Neither was verified
> against a purchased standard. Do not lean on that last digit.

> **Conflict (2026-08-27):** the legacy guidelines this project shipped with state A = 0-2.8,
> B = 2.8-7.1, C = 7.1-18, D = >18 mm/s; see [[sources/repo-maintenance-guidelines]]. Those figures
> match no machine group in either standard and are roughly four times too permissive at the top end.
> A machine at 6 mm/s reads "acceptable, monitor closely" on that table and "stop" on this one. Use
> this page.

## Using it honestly

- **Change matters more than magnitude.** A machine that has doubled from 1.0 to 2.0 mm/s is telling
  you something even though both readings sit in zone A. The standards evaluate change against a
  baseline as well as absolute level.
- **Broadband velocity is deaf to early bearing damage.** [[sources/crowe-2007-bearing-faults]]
  documents a bearing with a clear inner-race defect and 7 g of impacting whose overall velocity
  trend read 0.0625 in/s. Zone checks and [[domain/envelope-analysis]] answer different questions;
  running only the first is how bearing failures get missed.
- The band matters. Below 10 Hz and above 1 000 Hz is outside the measurement, by definition.
`,
};
