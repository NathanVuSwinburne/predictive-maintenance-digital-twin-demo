/**
 * The `concepts/` namespace — the modelling vocabulary.
 *
 * These are the pages the assistant reads before explaining one of its own numbers: what a
 * majority-class baseline is, why accuracy lies on rare events, where leakage comes from. The
 * MLOps workspace enforces several of these rules in code; these pages are why it does.
 */

export const CONCEPTS_PAGES: Record<string, string> = {
  "concepts/class-imbalance-in-failure-data": `---
title: Class Imbalance in Failure Data
namespace: concepts
type: concept
tags: [imbalance, metrics, evaluation, modelling]
aliases: [imbalanced data, majority class baseline, rare event]
sources:
  - "[[sources/ai4i-2020-dataset]]"
relates_to:
  - "[[concepts/precision-recall-vs-accuracy]]"
  - "[[concepts/model-evaluation-for-rare-events]]"
  - "[[concepts/threshold-selection]]"
  - "[[fleet/ai4i-milling-machine]]"
updated: 2026-08-27
updated_by: seed
confidence: high
---

# Class Imbalance in Failure Data

Failures are rare. That single fact breaks accuracy as a metric, and it is the most common way a
predictive-maintenance model gets shipped while being worthless.

## The number that makes it concrete

[[sources/ai4i-2020-dataset]] has **339 failures in 10 000 rows — 3.39 %**. A model that answers
"no failure" to every row scores **96.61 % accuracy** and has never once been right about the thing
it was built to find.

This is not hypothetical here. An earlier version of this project's own MLOps walkthrough presented
a snapshot fleet model as an **89.5 % success** when always answering "no failure" scored
**90.1 %** on the same data. The reported model was *worse than doing nothing*, and the results
panel gave the operator no way to see it. That is why the rebuild described in
[[fleet/schema-generalisation]] made the majority-class baseline a required output of every
training run rather than an optional one.

## The rule

**Always report the majority-class baseline next to accuracy.** An accuracy that does not beat it is
not a result. This costs one line of code and is the single highest-value guard in the whole
pipeline.

Then report metrics that cannot be gamed by silence:

- **balanced accuracy** — mean of per-class recall
- **macro precision and recall** — every class weighted equally regardless of size
- **per-class precision, recall, F1 and support** — support included, because a 100 % recall over
  three test examples is noise
- **train and test class counts** — so a reader can see the imbalance rather than infer it

See [[concepts/precision-recall-vs-accuracy]].

## Handling it

| Lever | What it does | Watch out for |
|---|---|---|
| Class weights / \`sample_weight\` | reweights the loss so minority errors cost more | changes calibration — predicted probabilities are no longer frequencies |
| Oversampling the minority | duplicates rare rows | duplicates can straddle a train/test split; see [[concepts/train-test-leakage-in-time-series]] |
| Undersampling the majority | discards data | throws away the variety that defines "normal" |
| Synthetic minority sampling | interpolates new minority rows | interpolating between two different failure *modes* invents a failure that cannot happen |
| Moving the decision threshold | keeps the model, changes the cut | usually the best first move — see [[concepts/threshold-selection]] |

Class weighting is the default worth reaching for first because it leaves the data alone. But note
what it costs: a reweighted model's output is no longer a calibrated probability, so "70 % risk"
stops meaning "seven times in ten".

## The subtler trap

Imbalance is not only about the label. In AI4I the *cause* labels are imbalanced against each other
too — TWF 46, HDF 115, PWF 95, OSF 98, RNF 19 — so a multi-class cause classifier faces a harder
version of the same problem, on a dataset where 18 of the 19 RNF rows are not even labelled as
failures. See [[sources/ai4i-2020-dataset]].
`,

  "concepts/data-drift": `---
title: Data Drift
namespace: concepts
type: concept
tags: [drift, monitoring, production, modelling]
aliases: [concept drift, covariate shift, model decay]
sources:
  - "[[sources/ai4i-2020-dataset]]"
relates_to:
  - "[[domain/condition-monitoring-architecture]]"
  - "[[concepts/threshold-selection]]"
  - "[[concepts/model-evaluation-for-rare-events]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# Data Drift

A deployed model's accuracy decays because the world moves and the model does not. Two distinct
things get called drift and they need different responses:

- **Covariate shift** — the inputs change distribution. Seasonal ambient temperature, a new raw
  material, a rebuilt machine, a replaced sensor. The relationship between input and failure is
  intact; the model is simply extrapolating.
- **Concept drift** — the relationship itself changes. A bearing upgrade, a new control strategy, a
  maintenance regime change. The old mapping is now wrong, and no amount of input monitoring reveals
  it.

Covariate shift is detectable without labels. Concept drift is not — it only shows up when outcomes
arrive, which on rare failures can be months.

## Detecting the detectable part

| Signal | What it catches |
|---|---|
| Feature distribution vs. the training distribution | covariate shift |
| Prediction distribution over time | the model quietly moving |
| Alarm rate vs. historical base rate | a threshold that has stopped meaning what it meant |
| Missing-value and out-of-range rates | a dying sensor, which looks like drift and is not |

That last row is worth separating out. **A failing sensor is the most common cause of apparent
drift**, and the response is opposite: retraining on a broken sensor's output bakes the fault in.
Check the instrument before the model.

## Why this application is exposed

The [[fleet/ai4i-milling-machine]] rows are synthetic and drawn from fixed distributions
([[sources/ai4i-2020-dataset]]), so nothing drifts and a model trained on them will never show
decay. That is a property of the benchmark, not evidence about the pipeline. A real drive on a real
line does drift, and the difference between the two is the difference between a demo and a
deployment — see [[fleet/packaging-drive-01]].

## Responding

Do not retrain reflexively. Retraining on drifted-and-unlabelled data propagates whatever caused the
drift. The order is: confirm the instrument, confirm the labels, then decide whether the new regime is
one the model should learn or one it should refuse to predict on. Failing closed on out-of-range input
is often better than answering confidently — the same argument as
[[concepts/threshold-selection]].
`,

  "concepts/derived-features": `---
title: Derived Features
namespace: concepts
type: concept
tags: [features, preprocessing, product]
aliases: [calculated features, computed columns]
sources:
  - "[[sources/ai4i-2020-dataset]]"
relates_to:
  - "[[concepts/feature-engineering-for-telemetry]]"
  - "[[domain/tool-wear]]"
  - "[[fleet/ai4i-milling-machine]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# Derived Features

A derived feature is a named, row-wise arithmetic expression over declared columns, computed before
every other transform, baked into the dataset artifact, and recomputed identically at inference.

In this application they are part of the preprocessing recipe, so the *same* expression that produced
the training column produces the serving column. That property is the whole point: a feature defined
in a notebook and re-implemented in a serving path is two features that happen to share a name.

## Why they exist here

Because the failure modes in [[sources/ai4i-2020-dataset]] are defined on combinations, not columns:

| Failure mode | Defined on |
|---|---|
| Overstrain (OSF) | \`tool_wear * torque\` |
| Heat dissipation (HDF) | \`process_temp - air_temp\`, together with rotational speed |
| Power (PWF) | \`torque * rotational_speed\` converted to watts |

Without derived features, a model has to learn each of those products or differences from the raw
columns, using only the handful of positive rows that exhibit them. With them, the target is already
in the feature space.

## Rules that keep them honest

- **Row-wise only.** A derived feature must depend on nothing but the current row's declared columns.
  The moment it looks at other rows it becomes a rolling feature, and rolling features can leak across
  a split — see [[concepts/train-test-leakage-in-time-series]].
- **Computed before other transforms**, so scaling and encoding see the final column set.
- **Baked into the immutable artifact**, so a dataset version is reproducible even if the expression
  is later edited.
- **Evaluated by a whitelisted evaluator**, not by \`eval\`. A user-supplied expression is untrusted
  input.
- **Named for what they mean**, not for their formula. \`mechanical_power\` beats \`torque_x_speed\`.

## The unit trap

\`torque * rotational_speed\` is not power until the speed is in radians per second. AI4I's PWF
thresholds — 3 500 W and 9 000 W — are only reproducible if that conversion is done. A derived feature
with the wrong units still trains, still scores, and is still wrong. Put the unit in the name or the
description.
`,

  "concepts/feature-engineering-for-telemetry": `---
title: Feature Engineering for Telemetry
namespace: concepts
type: concept
tags: [features, preprocessing, modelling]
aliases: [feature engineering, telemetry features]
sources:
  - "[[sources/ai4i-2020-dataset]]"
relates_to:
  - "[[concepts/derived-features]]"
  - "[[concepts/resampling-and-aggregation]]"
  - "[[domain/condition-monitoring-architecture]]"
  - "[[concepts/train-test-leakage-in-time-series]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# Feature Engineering for Telemetry

This is the DM — Data Manipulation — block of [[domain/condition-monitoring-architecture]], and it is
where most of the achievable accuracy actually lives. A better feature beats a better model on
industrial telemetry almost every time, because the physics is known and the model would otherwise
have to rediscover it from a few thousand rows.

## What earns its place

| Family | Examples | Why |
|---|---|---|
| **Physical combinations** | power = torque × angular velocity; temperature *difference* rather than two absolutes | the failure mode is defined on the combination, not the parts |
| **Rolling statistics** | mean, std, min/max over a window | the level is often normal while the variability is not |
| **Rates of change** | first difference, slope over a window | degradation is a trend; a snapshot cannot see one |
| **Deviation from baseline** | current minus this machine's own normal | absolute thresholds cannot span a fleet |
| **Cumulative counters** | operating hours, cycles, accumulated wear | wear is an integral, not a reading |

## The worked example

AI4I's overstrain mode fires when **tool wear × torque** crosses a limit. Given the two raw columns, a
model has to learn a hyperbolic boundary from a handful of positive examples. Given
\`tool_wear * torque\` as one column, the boundary is a straight line and a trivial model finds it.

The heat-dissipation mode is the same story: it depends on the **difference** between air and process
temperature, not on either value. See [[concepts/derived-features]] and [[domain/tool-wear]].

## What to avoid

- **Anything computed across the whole dataset before splitting** — normalisation statistics, rolling
  windows that span the split boundary, any target encoding. That is
  [[concepts/train-test-leakage-in-time-series]], and it is the most common way a good-looking model
  fails in production.
- **Features not available at inference time.** If it takes a lab result that arrives two days later,
  it cannot be in a real-time model, however predictive it is.
- **Windows longer than the sampling regime supports.** A one-hour rolling mean on a machine whose
  median session is a few minutes is mostly padding — see [[fleet/packaging-drive-01]].

## Recompute identically at serving time

The transformation applied at training must be applied, bit for bit, at inference. A feature computed
one way in a notebook and another way in the serving path is not the same feature, and the failure is
silent — the model returns a confident number computed from an input it has never seen.
`,

  "concepts/labelling-failure-windows": `---
title: Labelling Failure Windows
namespace: concepts
type: concept
tags: [labels, modelling, time-series]
aliases: [failure window, prediction horizon, label horizon]
sources:
  - "[[sources/ai4i-2020-dataset]]"
  - "[[sources/cmapss-turbofan]]"
relates_to:
  - "[[domain/p-f-curve]]"
  - "[[concepts/remaining-useful-life]]"
  - "[[concepts/class-imbalance-in-failure-data]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# Labelling Failure Windows

"Will this machine fail?" is not a question until you say *when*. The label definition is a design
decision that determines the difficulty of the problem, the base rate, and whether the answer is
actionable — and it is usually made implicitly.

## The choice

| Labelling | Question asked | Consequence |
|---|---|---|
| Row at the moment of failure only | "is it failing right now?" | detection, not prediction. Warning is zero. Base rate is at its lowest. |
| Every row within a window before failure | "will it fail within H?" | genuine prediction. Raises the positive rate, which helps [[concepts/class-imbalance-in-failure-data]]. |
| Cycles remaining | "how long left?" | regression — see [[concepts/remaining-useful-life]] |

[[sources/ai4i-2020-dataset]] uses the first: \`Machine failure\` marks the failing row, with no
timestamps and no unit identity, so no window can be constructed. It is a **detection** benchmark
being widely described as a prediction one.

## Choosing the horizon H

H is bounded on both sides and the bounds are not modelling facts:

- **Lower bound: the response time.** A warning shorter than the time to get a person and a part to
  the machine is worthless. This is site logistics, not data science.
- **Upper bound: the P-F interval.** Nothing is detectable before P, so a horizon reaching further
  back than the [[domain/p-f-curve]] interval labels rows in which no evidence exists. The model then
  learns to guess, and its confidence becomes meaningless.

Between those two, longer H means more positives and an easier-looking metric, which is exactly why H
gets quietly stretched. State it next to every metric.

## Two things that go wrong

- **The horizon is not reported.** "94 % accurate" over a 30-day window and over a 1-hour window are
  different products. A metric without its horizon is not comparable to anything.
- **The post-failure rows stay in.** Readings taken *after* a failure, during the fault or the repair,
  are trivially separable and inflate every score. They must be excluded, and the exclusion documented
  — this is a specific case of [[concepts/train-test-leakage-in-time-series]].
`,

  "concepts/model-evaluation-for-rare-events": `---
title: Model Evaluation for Rare Events
namespace: concepts
type: concept
tags: [evaluation, metrics, imbalance]
aliases: [rare event evaluation, PR curve, ROC]
sources:
  - "[[sources/ai4i-2020-dataset]]"
relates_to:
  - "[[concepts/class-imbalance-in-failure-data]]"
  - "[[concepts/precision-recall-vs-accuracy]]"
  - "[[concepts/threshold-selection]]"
  - "[[concepts/train-test-leakage-in-time-series]]"
updated: 2026-08-27
updated_by: seed
confidence: high
---

# Model Evaluation for Rare Events

An evaluation protocol that works at a 50 % base rate can be actively misleading at 3 %.

## Report these, in this order

1. **The majority-class baseline.** First line, always. If accuracy does not beat it there is no
   result to discuss. See [[concepts/class-imbalance-in-failure-data]].
2. **The confusion matrix**, with raw counts. False positives and false negatives cost different
   things; a single score hides which one you are buying.
3. **Per-class precision, recall, F1 and support.** Support included — recall over four positive test
   examples is a coin flip, and without support nobody can tell.
4. **Balanced accuracy and macro precision/recall.** Every class weighted equally.
5. **Train and test class counts.** So the reader sees the imbalance instead of having to ask.

## ROC-AUC is the wrong headline here

ROC-AUC uses the false positive rate, whose denominator is the enormous negative class. At a 3 % base
rate, thousands of false positives barely move it, so a model can post 0.95 AUC and still raise three
false alarms for every real one. **Precision-recall AUC** has the rare class in both terms and does
not flatter. Use PR; if ROC is reported, report the base rate beside it.

## Confidence intervals on tiny positive counts

With a few dozen positives in a test partition, the metric that matters rests on a handful of rows.
A 5-point difference between two models is usually noise. Either report an interval, or say plainly
how many positive examples the number rests on — and be sceptical of leaderboard-style comparisons
that do neither.

## The split has to be right first

None of the above means anything if the split leaks. Split by time or by unit, and fit every
statistic inside the training partition — see [[concepts/train-test-leakage-in-time-series]]. An
impressive number from a leaked split is not a good model; it is a broken measurement.

## Then, and only then, choose a threshold

Metrics describe the ranking. The decision is a separate act — see
[[concepts/threshold-selection]].
`,

  "concepts/precision-recall-vs-accuracy": `---
title: Precision, Recall and Why Accuracy Lies
namespace: concepts
type: concept
tags: [metrics, evaluation]
aliases: [precision, recall, F1, confusion matrix]
sources:
  - "[[sources/ai4i-2020-dataset]]"
relates_to:
  - "[[concepts/class-imbalance-in-failure-data]]"
  - "[[concepts/threshold-selection]]"
  - "[[concepts/model-evaluation-for-rare-events]]"
updated: 2026-08-27
updated_by: seed
confidence: high
---

# Precision, Recall and Why Accuracy Lies

For a rare positive class, accuracy measures how common the negative class is. Nothing else.

| Metric | Question it answers | Cost it protects against |
|---|---|---|
| **Precision** | of the alarms we raised, how many were real? | wasted call-outs, alarm fatigue |
| **Recall** | of the real failures, how many did we catch? | the failure you missed |
| **F1** | harmonic mean of the two | neither, specifically — it is a summary, not a decision |
| **Balanced accuracy** | mean per-class recall | a model that ignores the minority class |

## Which one to lead with

It depends entirely on what a mistake costs, and that is not a modelling question — it is the
severity question from [[domain/fmea-and-criticality]].

- Unplanned failure of a critical asset dwarfs an unnecessary inspection → **recall**.
- Every alarm sends a technician across a site and operators stop believing alarms that cry wolf →
  **precision**.

Most maintenance settings sit closer to the first, which is why a recall-blind accuracy headline is
so damaging. But "maximise recall" taken alone gives you a model that alarms on everything, which
destroys itself through alarm fatigue within a month.

## Alarm fatigue is a real failure mode

At 3.39 % base rate ([[sources/ai4i-2020-dataset]]), a detector with 90 % recall and 10 % false
positive rate raises roughly 305 true alarms and 966 false ones over 10 000 parts — **three quarters
of all alarms are false**, and precision is about 24 %. That model is defensible or useless depending
on what an inspection costs, and no metric decides it for you.

That arithmetic — base rate times error rates — is the calculation to run *before* promising anyone a
model will help.

## Reporting

Report the confusion matrix. Two numbers on a dashboard hide which mistake the model is making, and
the two mistakes have completely different consequences. See
[[concepts/model-evaluation-for-rare-events]].
`,

  "concepts/remaining-useful-life": `---
title: Remaining Useful Life
namespace: concepts
type: concept
tags: [rul, prognostics, modelling]
aliases: [RUL, remaining life]
sources:
  - "[[sources/cmapss-turbofan]]"
  - "[[sources/femto-pronostia]]"
relates_to:
  - "[[domain/p-f-curve]]"
  - "[[concepts/labelling-failure-windows]]"
  - "[[concepts/train-test-leakage-in-time-series]]"
updated: 2026-08-27
updated_by: seed
confidence: high
---

# Remaining Useful Life

RUL is a regression onto time-until-failure: given everything observed so far, how many cycles,
hours or minutes of useful operation remain? It is the quantitative form of the
[[domain/p-f-curve]] interval.

## What RUL needs that classification does not

**Run-to-failure histories.** You cannot learn how long something lasts from data in which nothing
ever failed. This is the constraint that decides, before any modelling, whether RUL is even
available:

| Dataset shape | RUL possible? |
|---|---|
| Snapshots with a failure flag, no unit identity, no time ([[sources/ai4i-2020-dataset]]) | **No.** There is no trajectory to regress along. |
| Trajectories per unit, run to failure ([[sources/cmapss-turbofan]], [[sources/femto-pronostia]]) | Yes |

That is why this fleet does failure *classification* on [[fleet/ai4i-milling-machine]] and
forecasting on [[fleet/utility-pump-02]] and [[fleet/packaging-drive-01]], and does not publish an
RUL number anywhere.

## The censoring problem

Most real fleet data is **right-censored**: units are still running, or were replaced before failing,
so their true failure time is unknown. Dropping censored units keeps only the ones that failed, which
biases every estimate towards early failure. Treating "last seen" as "failed" is worse. Survival
methods exist precisely for this; naive regression on the survivors is the standard mistake.

## The flat-then-decline convention

Sensors usually show nothing for most of a unit's life, so a linear RUL target forces the model to
predict a steadily falling number from evidence that is not changing. The common fix is a
**piecewise-linear target**: constant at some cap early on, declining only once degradation begins.
This is a modelling convention, not a physical fact, and the cap is a hyperparameter that materially
changes reported error. Two papers using different caps on the same dataset are not comparable.

## Evaluating it honestly

- Error is asymmetric. Predicting 40 cycles when 10 remain is dangerous; predicting 10 when 40 remain
  merely wastes life. Symmetric RMSE scores both the same and is the wrong loss for the decision.
- Late-life accuracy is what matters. A model with excellent average error that is wrong in the final
  10 % of life is useless.
- Report error *as a function of true RUL*, not as one number.

See [[concepts/model-evaluation-for-rare-events]] for the same argument on the classification side.
`,

  "concepts/resampling-and-aggregation": `---
title: Resampling and Aggregation
namespace: concepts
type: concept
tags: [preprocessing, time-series, product]
aliases: [resampling, time grid, aggregation rule]
sources:
  - "[[sources/cmapss-turbofan]]"
relates_to:
  - "[[concepts/feature-engineering-for-telemetry]]"
  - "[[concepts/train-test-leakage-in-time-series]]"
  - "[[fleet/packaging-drive-01]]"
updated: 2026-08-27
updated_by: seed
confidence: medium
---

# Resampling and Aggregation

Real telemetry does not arrive on a clean grid. Readings are irregular, sessions start and stop, and
a model trained on "the last 30 rows" is trained on a window whose *duration* varies. Resampling
collapses irregular readings onto a fixed interval so that a window means a fixed span of time.

## The rules that matter

- **Bin per session, never across sessions.** A bin that spans a gap between two sessions averages
  two different operating episodes into one row that never happened. On
  [[fleet/packaging-drive-01]] the gaps between sessions run to days.
- **Anchor each session's bins to its own first reading**, left-closed and left-labelled, so bin
  boundaries are reproducible and do not depend on wall-clock time.
- **Never average a category and never average a label.** Averaging a category is meaningless;
  averaging a label fabricates an outcome that did not occur. Both take the bin's last value.
- **Count what you dropped or carried forward.** Gaps are either dropped or forward-filled, and either
  way the count is the honest signal about how much of the resampled series is real. Silent
  forward-fill turns a sensor outage into a flat, confident-looking trend.

## Serving must match training

A model trained on a 10-second grid must be served on a 10-second grid. That means the serving path
resamples the live window before encoding it, and fails closed if it cannot supply each row's
timestamp. It also means inference must fetch a **wider** raw window than the model's context length,
because \`contextRows\` bins have to be filled with history rather than with the right *number* of raw
readings.

Getting this wrong produces the worst kind of bug: the model runs, returns a plausible number, and is
reading a window of a different length than it was trained on.

## Choosing the interval

Short enough to preserve the phenomenon, long enough to smooth noise. The upper bound comes from the
[[domain/p-f-curve]] interval — a grid coarser than the warning you are trying to catch cannot catch
it. The lower bound comes from the sensor. [[domain/envelope-analysis]] is the extreme case: a bearing
turning under 0.4 rpm needed a 25-minute acquisition for a single average.
`,

  "concepts/threshold-selection": `---
title: Threshold Selection
namespace: concepts
type: concept
tags: [thresholds, decisions, metrics, economics]
aliases: [decision threshold, operating point, alarm threshold]
sources:
  - "[[sources/ai4i-2020-dataset]]"
  - "[[sources/aiag-vda-fmea-2019]]"
relates_to:
  - "[[concepts/precision-recall-vs-accuracy]]"
  - "[[concepts/model-evaluation-for-rare-events]]"
  - "[[domain/fmea-and-criticality]]"
  - "[[domain/vibration-severity-zones]]"
updated: 2026-08-27
updated_by: seed
confidence: high
---

# Threshold Selection

A classifier outputs a score. Turning that score into "raise an alarm" requires a cut, and **0.5 is
not a neutral default** — it is a choice that says a false negative and a false positive cost the
same. On maintenance data they almost never do.

## The threshold is an economics decision

The inputs are not in the data:

- cost of a missed failure — downtime, damage, safety consequence. This is the **Severity** rating
  from [[domain/fmea-and-criticality]].
- cost of a false alarm — inspection labour, an unnecessary shutdown, and the slower cost of
  operators learning to ignore alarms.
- the base rate, which decides how many false alarms a given false-positive rate actually produces.

At AI4I's 3.39 % base rate ([[sources/ai4i-2020-dataset]]), a 10 % false positive rate means roughly
966 false alarms per 10 000 parts against about 305 true ones. Whether that is acceptable is a
business answer, and the model cannot supply it.

## How to pick one

1. Choose the metric that matches the cost asymmetry — usually recall at an acceptable precision, or
   precision at a required recall.
2. Sweep the threshold on the **validation** partition, never the test partition.
3. Read the operating point off the precision-recall curve.
4. Sanity-check the resulting alarm *volume* against what the site can absorb per week. A threshold
   that generates more work than there are people is not deployable regardless of its metrics.
5. Fix it, record it with the model version, and re-check it when the base rate moves — see
   [[concepts/data-drift]].

## Multiple thresholds beat one

The two-state alarm is rarely the right interface. Domain practice already knows this: the vibration
standards use four zones, not a pass/fail line ([[domain/vibration-severity-zones]]). A watch level
that adds a machine to a list and an act level that dispatches someone carry very different costs, and
splitting them lets you run high recall at the cheap tier without drowning the expensive one.

## Calibration

If the number is shown to a human as a percentage, it should mean what it says: of the cases scored
70 %, about seven in ten should fail. Class weighting and resampling both break this — see
[[concepts/class-imbalance-in-failure-data]]. Either calibrate afterwards, or stop calling the output
a probability.
`,

  "concepts/train-test-leakage-in-time-series": `---
title: Train-Test Leakage in Time Series
namespace: concepts
type: concept
tags: [evaluation, time-series, modelling, pitfall]
aliases: [leakage, data leakage, look-ahead bias]
sources:
  - "[[sources/cmapss-turbofan]]"
relates_to:
  - "[[concepts/feature-engineering-for-telemetry]]"
  - "[[concepts/resampling-and-aggregation]]"
  - "[[concepts/model-evaluation-for-rare-events]]"
updated: 2026-08-27
updated_by: seed
confidence: high
---

# Train-Test Leakage in Time Series

Leakage is when information from the evaluation set reaches the model during training. On time series
it is easy to cause, invisible in the metrics, and produces exactly the failure everyone fears: a
model that scores beautifully in the notebook and is useless in production.

The tell is a score that is *too good*. On industrial data, an unexpectedly excellent result is
evidence of leakage until proven otherwise.

## The five common routes

1. **Random splitting.** A random shuffle puts a row from 10:00:01 in train and 10:00:02 in test.
   Adjacent readings are nearly identical, so the model is being tested on what it memorised. Split
   **by time**, or better, **by unit** — the way [[sources/cmapss-turbofan]] does it, with whole
   engine trajectories held out.
2. **Fitting statistics before splitting.** Scalers, imputation values, encoders and PCA bases fitted
   on the whole dataset carry the test set's distribution into training. Fit on train, apply to test.
3. **Rolling windows spanning the boundary.** A 30-row rolling mean computed before the split writes
   test-set values into the last training rows. Compute windows after splitting, per partition.
4. **Oversampling before splitting.** Duplicated or interpolated minority rows land on both sides, so
   the model is tested on rows it trained on. Resample **inside** the training partition only.
5. **Features that depend on the outcome.** "Days since last maintenance" is only known after the
   maintenance happened. Anything recorded as part of responding to the failure is not a predictor.

## Splitting a fleet

Split by **machine**, not by row, whenever you have more than one machine and intend to generalise to
a new one. Same-machine rows in train and test measure how well the model memorised that machine,
which is a different — and much easier — question than the one being asked.

## The self-check

Before believing a result, answer: *at the moment of prediction, was every input in this row actually
available?* If any answer is no, the score is fiction. See
[[concepts/model-evaluation-for-rare-events]].
`,
};
