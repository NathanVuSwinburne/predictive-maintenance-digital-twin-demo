<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&amp;weight=700&amp;size=28&amp;duration=2600&amp;pause=700&amp;color=2563EB&amp;center=true&amp;vCenter=true&amp;multiline=true&amp;width=850&amp;height=130&amp;lines=From+raw+sensor+data...;to+failure+forecasts...;to+an+AI-powered+digital+twin." alt="From raw sensor data to an AI-powered predictive maintenance digital twin" />

# Predictive Maintenance Digital Twin

**The story of how a data problem grew into a full-stack AI engineering system.**

[![Live Demo](https://img.shields.io/badge/Explore_the_live_demo-2563EB?style=for-the-badge&logo=vercel&logoColor=white)](https://predictive-maintenance-digital-twin.vercel.app/dashboard)
[![Next.js](https://img.shields.io/badge/Next.js_16-111827?style=for-the-badge&logo=nextdotjs&logoColor=white)](apps/frontend)
[![FastAPI](https://img.shields.io/badge/FastAPI-059669?style=for-the-badge&logo=fastapi&logoColor=white)](apps/backend)
[![AI Agents](https://img.shields.io/badge/Agentic_AI-7C3AED?style=for-the-badge&logo=openai&logoColor=white)](#the-dashboard-needed-a-brain)

`DATA ANALYSIS` → `DATA SCIENCE` → `MLOPS` → `DIGITAL TWIN` → `AI ENGINEERING`

**[Start anywhere ↓](#start-anywhere)**

[The story](#the-short-version) · [MLOps](#a-trained-model-is-not-yet-a-workflow) · [Knowledge wiki](#memory-the-agent-can-read-and-so-can-you) · [Screens](#the-demo-in-pictures) · [Architecture](#under-the-hood) · [Run locally](#run-it-yourself) · [Glossary](#plain-english-glossary)

</div>

---

## Start anywhere

Connected pages, not a sequence. Read it straight through or drop into the part you came for. The later pages get technical, but each opens with a plain summary first, and the [glossary](#plain-english-glossary) defines every term in one sentence.

| Page | What it answers |
|---|---|
| [The short version](#the-short-version) | What this is, and the three data profiles behind it |
| [First, understand the machines](#first-understand-the-machines) | What each dataset could honestly support |
| [Then make the signal predictive](#then-make-the-signal-predictive) → [what survived](#what-survived-the-experiments) | The models, and the results that held up |
| [A trained model is not yet a workflow](#a-trained-model-is-not-yet-a-workflow) | **MLOps**: getting from a trained model to a workflow anyone can rerun |
| [A prediction you can challenge](#a-prediction-is-more-useful-when-you-can-challenge-it) | The digital twin: baseline against simulated intervention |
| [The dashboard needed a brain](#the-dashboard-needed-a-brain) | The supervisor agent, its tools, and its visible traces |
| [Memory the agent can read](#memory-the-agent-can-read-and-so-can-you) | **Knowledge wiki**: why the agent's memory is readable pages and not a numeric index |
| [Close the loop](#close-the-loop-with-live-ingestion) | The MQTT ingestion prototype |
| [The demo, in pictures](#the-demo-in-pictures) | Every screen, and where it is explained |
| [Under the hood](#under-the-hood) | Architecture, stack, and what gets persisted |
| [Run it yourself](#run-it-yourself) | Demo mode in four commands, or the whole stack |
| [What this leans on](#what-this-leans-on) | The datasets, standards and the paper behind the wiki |
| [Plain-English glossary](#plain-english-glossary) | Every term used here, one sentence each |
| [Scope, credit and provenance](#scope-credit-and-provenance) | Who built what, and what is deliberately not here |

---

## The short version

Machines do not fail on schedule. They drift: vibration changes, temperature moves, risk piles up quietly. Someone has to catch it before it gets expensive.

One question started this:

> **Can we turn noisy machine telemetry into a useful maintenance decision before the machine fails?**

Answering it meant doing three jobs:

| The role | The actual work |
|---|---|
| **Data analyst** | Work out how the sensors behave, how good the data is, where it is missing, and what the numbers can honestly support. |
| **Data scientist** | Build the models that score risk and the models that predict the next readings, test whether generated data helps, and keep the rare cases visible instead of averaged away. |
| **AI engineer** | Put the models behind an API, store what happens, add simulations, and build an assistant that can use real tools and show what it did. |

What came out is neither a notebook nor a dashboard. It is a working digital twin: inspect fleet health, forecast risk, test an intervention, and ask an agent to investigate, with every tool call it made on screen.

### Three data sources, three machine profiles

Each source is treated as a machine:

| Machine | Data source | Role in the system |
|---|---|---|
| **Machine A** | Public AI4I dataset | Snapshot failure classification |
| **Machine B** | Public synthetic multi-sensor dataset | Telemetry and interface testing |
| **Machine C** | Private client sensor dataset | Vibration forecasting and simulation |

These names identify data profiles, not three physical machines connected to the hosted demo.

> [!IMPORTANT]
> The public Vercel experience is a **sanitized portfolio demo**. Its “live” values are deterministic demo data. Machine C uses sanitized client-derived fixtures and clearly labelled synthetic continuations. Private raw readings, backend services, databases, and API keys are not deployed.
>
> Two panes are an exception worth knowing about. The [MLOps workspace](#a-trained-model-is-not-yet-a-workflow) and the [knowledge wiki](#memory-the-agent-can-read-and-so-can-you) are frontend-only but not scripted: they really compute, in your browser, over public and synthetic data only.

<sub>↑ [Map](#start-anywhere) · → **Next:** [First, understand the machines](#first-understand-the-machines) · ↔ **Related:** [Run it yourself](#run-it-yourself)</sub>

---

## First, understand the machines

A and B were straightforward: a public classification baseline, and multi-sensor telemetry for testing the interface. Machine C was the problem. It brought high-frequency vibration and temperature data from the client, and it brought very few failures.

That matters more than it sounds. A small, lopsided dataset still produces an impressive-looking score, because the model gets good at the common case and is barely tested on the rare one. So the missing coverage was treated as a data problem to solve, not something to hide behind a bigger model.

<table>
  <tr>
    <td width="55%">
      <img src="assets/ml_architecture.png" alt="Early hybrid machine-learning architecture across three datasets" />
      <br />
      <strong>The first map:</strong> connect each data source to the prediction task it could genuinely support.
    </td>
    <td width="45%">
      <img src="assets/real_synthetic_data_example_with_tsgm.png" alt="Comparison between observed and TSGM-generated vibration data" />
      <br />
      <strong>The join test:</strong> inspect whether generated vibration continues the observed signal without pretending it is real.
    </td>
  </tr>
</table>

### The synthetic-data decision

We used a generative model (TSGM) to produce extra vibration and temperature data in the style of the real readings, because the client set was small. Before using any of it, we compared the generated signal against the real one, including how its energy is spread across frequencies, which is where a plausible-looking fake usually gives itself away.

Observed fixture, synthetic continuation and deterministic demo state stay three separate things in this repository, and are labelled as such.

<sub>↑ [Map](#start-anywhere) · → **Next:** [Then make the signal predictive](#then-make-the-signal-predictive) · ↔ **Related:** [What this leans on](#what-this-leans-on)</sub>

---

## Then make the signal predictive

Maintenance needs two different predictions, so the system does both:

- **Classification:** how risky is the machine, and what kind of failure may be developing?
- **Forecasting:** where are the sensor readings heading next?
- **Simulation:** what changes if an operator adjusts the conditions?

<div align="center">

<img src="assets/ml_architecture_2.png" alt="Expanded hybrid classification and time-series forecasting architecture" width="850" />

<strong>Two paths, one decision:</strong> state simulation on the left, failure-type prediction on the right.

</div>

The forecaster is an LSTM, a model built for sequences rather than single snapshots. It reads **20 minutes** of telemetry (2,400 samples at 500 ms) and predicts the next **10 minutes** (1,200 samples), stepping forward in **5-minute** increments. Feed its own output back in six times and you get an hour.

An automated search tried model variants for us, changing architecture, training settings and data preparation while the test it had to pass stayed locked. Not "AI trains AI." Just a lot of experiments without quietly moving the goalposts between them.

## What survived the experiments

Held-out results from checked-in Machine C artifacts. Not the fictional live values the Vercel demo shows.

| Retained artifact | Result |
|---|---:|
| Risk classifier | **91.28% accuracy** · **0.9631 macro OvR AUC** |
| Low-risk class | F1 **0.9502** (107 samples) |
| High-risk class | F1 **0.8333** (39 samples) |
| 10-minute LSTM · Vibration X | MAE 0.0479 · RMSE 0.1262 |
| 10-minute LSTM · Vibration Y | MAE 0.1102 · RMSE 0.2335 |
| 10-minute LSTM · Vibration Z | MAE 0.0612 · RMSE 0.1301 |
| 10-minute LSTM · Temperature | MAE 0.2425 · RMSE 0.3123 |

**The catch:** the medium-risk test subset has three samples (F1 0.4000). Three. The overall score is useful; it is not evidence the model performs evenly across every class.

<sub>↑ [Map](#start-anywhere) · → **Next:** [A trained model is not yet a workflow](#a-trained-model-is-not-yet-a-workflow) · ↔ **Related:** [A prediction you can challenge](#a-prediction-is-more-useful-when-you-can-challenge-it)</sub>

---

## A trained model is not yet a workflow

> **In plain terms:** training a model is the easy half. The hard half is being able to do it again next month and get the same thing back. This page is about turning a one-off training script into a workflow anyone can rerun, inspect and disagree with.

I worked as an **ML engineer intern** before this, and what stuck was not the modelling. It was the gap between training a model once and having something a colleague can rerun. Three ordinary things went wrong:

- The data preparation lived in a notebook cell, so nobody could rerun it exactly.
- The scaler, the step that puts every sensor onto a comparable numeric range, was written once for training and written again, slightly differently, for serving. Two copies of one rule drift apart.
- The score arrived in a chat message, with no record of which rows produced it.

So here, preparing data, scoring a model, approving it and serving it are **steps in the product**, not things you had to be in the room for.

### Machine C was never generic

> **In plain terms:** the first version of this pipeline only worked for one specific machine, because facts about that machine were baked into the code. Making it work for any machine meant writing down what a machine *is*, in configuration, instead of assuming it.

The Machine C pipeline was written for exactly one machine, and it showed.

| Before | After |
|---|---|
| Column order fixed in code: position 0 was X, position 1 was Y, position 2 was Z | Columns declared by name, type and unit in a registry entry |
| How much history to read was a number typed into the training script, and typed again into the serving path | How much history to read is part of the recipe, versioned with the dataset |
| Time was assumed everywhere: windows, lags and session boundaries throughout | `timestamp` and `session_id` are **labels on a row, never model inputs**, and a machine is allowed to have neither |
| One model path, because there was only ever one machine | Each machine **declares what it can support**: detection, forecasting, or both |
| Data preparation lived in the notebook | A recipe frozen into a dataset version that cannot change, with a fingerprint of the exact rows |
| A scaler fitted twice, in two places | Statistics fitted on **Train only**, stored with the dataset, reused verbatim at inference |

The AI4I machine forced the rewrite. Its rows are independent snapshots with **no usable time axis at all**, and every assumption in the hand-written path depended on time. No number of history rows can express *"there is no history here."* So: copy the pipeline and edit it, or describe what a machine **is** in a way that covers both. Copying is the fast answer and the wrong one. Two copies become five, and the fifth is where two definitions of one rule quietly stop matching.

It cost something. Domain knowledge moved out of code and into configuration, where you can read it but the compiler can no longer check it, and the general path is slower than a hand-written one for any single machine. With one machine and no plans for a second, hand-written would have been right.

What the rewrite bought is everything below.

![The MLOps machine registry, with the schema history of the AI4I machine beside it](assets/mlops_machine_registry.png)

<strong>The registry is deliberately dull.</strong> A list and a register form, the same shape the production app uses, with the register button off because writing one needs a database. Open **Schema history** and each machine unfolds every version of its own column contract, ending where it stopped needing code written specially for it.

### Four stages, and a decision that is not the trainer's to make

The workflow ships as a frontend-only workspace at **`/mlops`**, over three public or synthetic machines. Nothing is scripted: the recipe recomputes and the models fit, in your browser, on every click.

| Stage | What happens |
|---|---|
| **Machine** | The registry, plus each machine's **column history** as a timeline. Five versions for the drive, because a version number with no record of what changed is a number, not a history. |
| **Data** | The columns, where they came from, and a readiness check per goal. A machine with no time axis is told plainly that it cannot forecast, instead of being offered a button that would fail. |
| **Prepare** | Split, missing values, scaling, resampling, and an editor for writing **new columns as formulas** over the existing ones. Freezing the recipe produces a dataset version that can no longer change. |
| **Train** | Model types split into *runs in your browser* and *production worker only*, and hyperparameters edited as **JSON**, the way the production app edits them. There were per-parameter number fields here once; two ways to set one value is only ever a way for the two to disagree. |

Training ends there, and deliberately. It produces candidates, nothing more. Moving one to production is an admin decision on a separate page, **`/admin/models`**, which is where it lives in the real app too.

![Hyperparameters edited as JSON, with the read-only parameter hints above the editable box](assets/mlops_training_config.png)

<strong>One place a value is written.</strong> The hints above are read-only and list every parameter the model accepts; the box below is the payload the run will carry. Copy, edit, apply, and it is validated before anything is applied.

![The preprocessing recipe, with the three calculated features this machine's failure rules are written in offered as suggestions](assets/mlops_prepare_recipe.png)

<strong>The recipe is the deliverable, not just the model.</strong> Split, missing values, scaling and calculated columns on the left; what they do to the actual rows on the right. The three formulas the AI4I rules are written in are offered rather than pre-applied, and every statistic on the screen is fitted on Train only, so the test rows stay honest.

### The calculated-feature moment

> **In plain terms:** sometimes the useful signal is not in any one sensor, but in two of them multiplied or subtracted. Hand the model those combinations directly and it catches far more real failures.

The published AI4I failure rules are written on *combinations* of columns: power is `torque × speed`, heat dissipation is a temperature *difference*, overstrain is `wear × torque`. A model handed only the six raw columns has to rediscover each of those products for itself, from a handful of failure rows.

Spelling them out in the formula editor, with the same model, the same settings and the same split:

| | Raw columns | With `power_w`, `temp_difference_k`, `overstrain` |
|---|---:|---:|
| Balanced accuracy | 83.7% | **93.1%** |
| Recall on failures | 69.6% | **87.0%** |
| Plain accuracy | 96.3% | 98.5% |

Read those numbers against 94.3%, which is how often a row in this split is simply not a failure. A model that answered "no failure" every single time would already score 94.3% plain accuracy while catching nothing at all, which is why the middle row, how many real failures were found, matters far more than the bottom one. Those are the workspace's own default settings, so the screenshot below is a run anyone can reproduce by clicking. A unit test holds this gap in place, so the argument for having a formula editor at all cannot quietly stop being true.

![Two training runs compared: the same forest on raw columns and on the calculated ones](assets/mlops_model_scorecard.png)

<strong>Two runs, one screen:</strong> the newer run uses dataset v2 and finds 87% of the failures; the older one, same model on the raw columns, finds 69.6%. Both are scored against the same 94.3% trivial answer.

### Honesty is the feature

> **In plain terms:** a score on its own means nothing. Every number here is shown next to what you would have scored by not trying at all.

- **Every run sits next to the trivial answer**, the score you would get by always guessing the most common outcome. An accuracy figure with nothing to compare it against is decoration.
- **The gate tells a bad model apart from a deliberate trade.** A model tuned for rare failures usually gives up plain accuracy for it. That gets `borderline` and an explanation, not `not_recommended`.
- **Drop the informative columns and the model really does lose to the baseline**, and the gate really does block it. None of that path is mocked.
- **Models the browser cannot honestly train refuse to run.** LSTM, GRU, TCN and XGBoost describe themselves, then decline and say they train on the production worker. An invented score would have been easier and worthless.

![The approvals table comparing candidate runs against the trivial answer before one is allowed to serve](assets/mlops_promotion_gate.png)

<strong>Approval moves a pointer, not a file.</strong> Every candidate sits next to the trivial answer with a verdict attached, a blocked one needs a written reason before it can be overridden, and nothing serves until a person picks it. A caller gets an honest error rather than a silently out-of-date model.

<sub>↑ [Map](#start-anywhere) · → **Next:** [A prediction you can challenge](#a-prediction-is-more-useful-when-you-can-challenge-it) · ↔ **Related:** [Memory the agent can read](#memory-the-agent-can-read-and-so-can-you) · [Under the hood](#under-the-hood)</sub>

---

## A prediction is more useful when you can challenge it

> **In plain terms:** being told a machine is 80% likely to fail does not tell you what to do about it. So the models were wired into a digital twin, a software copy of the machine where you can try a change and see what it would do before touching the real thing.

![Digital-twin simulation comparing observed sensor readings with a generated future](assets/similation_pane_with_mockdata.png)

The simulator keeps both futures on screen at once, the one you are heading for and the one a change would give you:

1. Select a real or fixture-backed source window.
2. Change the operating scenario.
3. Generate a future sensor horizon.
4. Compare baseline risk with projected risk.
5. Turn the result into a maintenance recommendation.

The product question stops being **"Will it fail?"** and becomes **"What do we do now, and what would that change?"**

<sub>↑ [Map](#start-anywhere) · → **Next:** [The dashboard needed a brain](#the-dashboard-needed-a-brain) · ↔ **Related:** [Then make the signal predictive](#then-make-the-signal-predictive)</sub>

---

## The dashboard needed a brain

> **In plain terms:** the first assistant was a long list of if-this-then-that rules, which broke a little more with every question we added. It was replaced by an agent that picks its own tools for each request and shows you which ones it used.

The replacement is a **supervisor agent**: it picks tools at runtime and hands specialist work to sub-agents. It can:

- run failure predictions and what-if simulations
- extract useful signals from operator complaints
- create maintenance proposals
- delegate database questions to a read-only SQL sub-agent
- read machine and maintenance knowledge from a Karpathy-style LLM wiki stored in an Obsidian vault
- keep working memory across conversation turns

![Supervisor agent architecture with action tools, a read-only SQL sub-agent, and a knowledge wiki](assets/chatbot_architecture.png)

### From a complaint to an investigation

An operator asks **"why was this machine so noisy yesterday?"** and the supervisor turns it into an investigation:

1. Read the machine capabilities and maintenance guidance from the Obsidian LLM wiki.
2. Identify noise as a possible vibration signal.
3. Delegate a read-only historical telemetry query to the SQL sub-agent.
4. Pass the retrieved row or time window to the prediction tool.
5. Combine the evidence into a clear explanation and useful next action.

It reaches each machine through the same tools the app itself uses, so the answer comes from retrieved evidence rather than from how the question was phrased.

<table>
  <tr>
    <td width="50%">
      <img src="assets/chatbot_telemetry_retrieval.png" alt="Assistant retrieving and summarizing Machine C vibration telemetry" />
      <br />
      <strong>Ask in plain English.</strong> The supervisor retrieves evidence and turns it into an operational summary.
    </td>
    <td width="50%">
      <img src="assets/chatbot_example_message_2.png" alt="AI assistant rendering machine telemetry as dashboard components" />
      <br />
      <strong>Return more than text.</strong> Responses can surface machine health, risk, temperature, and vibration as UI components.
    </td>
  </tr>
</table>

<table>
  <tr>
    <td width="50%">
      <img src="assets/chatbot_tracing.png" alt="Visible four-step agent tool trace" />
      <br />
      <strong>Show the actions.</strong> The trace shows which tool the supervisor selected, what it delegated to the SQL sub-agent, and how the result reached the final response.
    </td>
    <td width="50%">
      <img src="assets/chatbot_example_message.png" alt="Assistant recalling earlier maintenance context from working memory" />
      <br />
      <strong>Keep the thread.</strong> Working memory lets the assistant recap prior reasoning and unresolved actions.
    </td>
  </tr>
</table>

The team measured roughly a **75% improvement in typical response time** after the redesign. Internal estimate, not a controlled benchmark, but it matched what the design predicted: less rigid routing, fewer wasted steps, tools chosen when they were needed.

> [!NOTE]
> The trace shows which tools ran, what was handed to a sub-agent, and what came back. It does not expose the model's private reasoning. In the frontend-only demo these traces are scripted examples of the real response format. Running the full stack connects the same workflow to FastAPI, PostgreSQL, the model services, and the Obsidian knowledge vault.

<sub>↑ [Map](#start-anywhere) · → **Next:** [Memory the agent can read](#memory-the-agent-can-read-and-so-can-you) · ↔ **Related:** [Under the hood](#under-the-hood)</sub>

---

## Memory the agent can read, and so can you

> **In plain terms:** most AI systems store their reference material as unreadable numbers and fetch passages that *sound* like the question. Here it is ordinary markdown pages that link to each other, so the agent can follow a trail from one page to the next, and so a person can read, check and correct the very same pages.

The [supervisor](#the-dashboard-needed-a-brain) reads from a maintenance wiki. Why a **wiki**, and not the usual numeric search index?

The design was inspired by **["Retrieval as Reasoning: Self-Evolving Agent-Native Retrieval via LLM-Wiki"](https://arxiv.org/abs/2605.25480)**, which argues for knowledge an agent *walks through* rather than only searches, and reports promising results on questions whose answer is spread across several documents. The paper inspired the design here; this project has not reproduced its benchmarks and does not claim its results.

The idea in one breath: **fast keyword search (BM25) to find the first page, a lasting interlinked wiki to hold the knowledge, links the agent can follow when one lookup is not enough, and pages that stay readable and editable by people instead of sitting in a store nobody can inspect.**

The standard approach, chopping documents into chunks and converting each one into a list of numbers, is very good at *"find me a passage that sounds like this"* and weak at *"what caused this, what detected it, and what did we decide last time?"*, where the answer is spread across four pages and lives in the links between them. So the corpus here is plain markdown with `[[wikilinks]]`, and a few decisions follow from that:

- **Nothing is stored as a graph.** Each page is a dot, each link written inside a page is a line, so both the graph and the search index are worked out from the text every time it is read. Edit a page and the graph changes shape in the same frame, because the text *is* the graph.
- **Links say what kind of link they are:** `sources`, `caused_by`, `detected_by`, `mitigated_by`. Invent a new kind at the top of any page and the graph draws it, with no code change anywhere.
- **A link to a page nobody has written yet becomes a *wanted page*:** drawn hollow and dashed in the graph rather than silently dropped. That is the to-do list, not an error.
- **Numbers need a source.** A figure in a `domain/` or `concepts/` page either links to the document it came from or gets flagged as unsourced, and a checking panel counts how many are still outstanding.
- **Disagreements are kept, not resolved.** Where a checked-in original contradicts the standards, a `Conflict` callout says so and both stay. The seeded vault carries seven.
- **Where each number came from is a view of its own**, and the original documents in `raw/` can never be edited, so the claim that an old in-house guideline's vibration limits are four times too permissive can be *checked* rather than taken on trust.

![The knowledge wiki: a force-directed graph of 50 pages beside the index page](assets/knowledge_wiki_graph.png)

<strong>50 pages, 409 links.</strong> Colour is the section of the vault, a dot grows with how many other pages point at it, and every count in the header is worked out from the markdown rather than stored next to it.

<table>
  <tr>
    <td width="50%">
      <img src="assets/knowledge_wiki_page.png" alt="Searching the wiki and reading a page, with the graph dimming everything that did not match" />
      <br />
      <strong>Search, then follow the links.</strong> Keyword search ranks the matches, the graph dims everything that did not match, and every backlink says which relation it arrived by. Eleven pages point at this one along fifteen links, because a page is allowed to point at another twice for two different reasons.
    </td>
    <td width="50%">
      <img src="assets/knowledge_wiki_provenance.png" alt="The provenance panel listing each source, what it is, and how many pages cite it" />
      <br />
      <strong>Where the numbers come from.</strong> One page per outside document, marked primary, secondary or internal, each stating what was actually read and what was not, with a count of how many pages depend on it. One entry admits the handbook behind it is paid and was never opened.
    </td>
  </tr>
</table>

The assistant writes through this same pane, so two rules live in the store rather than the interface: `raw/` is not editable at all, and `agent/`, which holds the assistant's own operating instructions, is not editable from the pane the assistant writes through. Every save needs a written reason, appended to a log that is never rewritten, because that note is all a future reader gets to explain why a page changed.

The vault at **`/knowledge`** carries 50 interlinked pages: ISO vibration zones, how bearings degrade, envelope analysis, what to do when failures are rare, where each public dataset came from, and the fleet registry. Public-domain knowledge plus this project's own decisions. The client machine has no page, and a test enforces that no page mentions it or any of its sensors.

<sub>↑ [Map](#start-anywhere) · → **Next:** [Close the loop](#close-the-loop-with-live-ingestion) · ↔ **Related:** [What this leans on](#what-this-leans-on) · [A trained model is not yet a workflow](#a-trained-model-is-not-yet-a-workflow)</sub>

---

## Close the loop with live ingestion

The bridge back to the physical machines. Configurable MQTT subscriptions, so a telemetry source can be mapped without hard-coding one broker or one machine.

<table>
  <tr>
    <td width="42%">
      <img src="assets/MQTT_subscription.png" alt="Form for configuring a new MQTT subscription" />
      <br />
      <strong>Configure the source:</strong> endpoint, port, QoS, and topic.
    </td>
    <td width="58%">
      <img src="assets/MQTT_subscription_2.png" alt="MQTT topic-to-machine subscription management interface" />
      <br />
      <strong>Manage the mapping:</strong> see connection state and assign topics to machine streams.
    </td>
  </tr>
</table>

This is a prototype for future data ingestion. The public Vercel demo is not connected to live industrial equipment, and nothing here claims otherwise.

<sub>↑ [Map](#start-anywhere) · → **Next:** [The demo, in pictures](#the-demo-in-pictures) · ↔ **Related:** [Under the hood](#under-the-hood)</sub>

---

## The demo, in pictures

Every screen appears somewhere above. Jump straight to one:

| Screen | Explained in |
|---|---|
| [Machine registry and schema history](assets/mlops_machine_registry.png) | [Machine C was never generic](#machine-c-was-never-generic) |
| [Preprocessing recipe with calculated features](assets/mlops_prepare_recipe.png) | [Four stages](#four-stages-and-a-decision-that-is-not-the-trainers-to-make) |
| [Two runs on one scorecard](assets/mlops_model_scorecard.png) | [The calculated-feature moment](#the-calculated-feature-moment) |
| [Hyperparameters as JSON](assets/mlops_training_config.png) | [Four stages](#four-stages-and-a-decision-that-is-not-the-trainers-to-make) |
| [The approvals table](assets/mlops_promotion_gate.png) | [Honesty is the feature](#honesty-is-the-feature) |
| [The knowledge graph](assets/knowledge_wiki_graph.png) | [Memory the agent can read](#memory-the-agent-can-read-and-so-can-you) |
| [A searched-and-opened wiki page](assets/knowledge_wiki_page.png) | [Memory the agent can read](#memory-the-agent-can-read-and-so-can-you) |
| [The provenance panel](assets/knowledge_wiki_provenance.png) | [Memory the agent can read](#memory-the-agent-can-read-and-so-can-you) |
| [Digital-twin simulation](assets/similation_pane_with_mockdata.png) | [A prediction you can challenge](#a-prediction-is-more-useful-when-you-can-challenge-it) |
| [Agent traces and telemetry retrieval](assets/chatbot_tracing.png) | [From a complaint to an investigation](#from-a-complaint-to-an-investigation) |
| [MQTT subscription prototype](assets/MQTT_subscription_2.png) | [Close the loop](#close-the-loop-with-live-ingestion) |

---

## Under the hood

```mermaid
flowchart LR
    Sensors["Sensor data<br/>public · sanitized · synthetic"] --> MLOps["MLOps workflow<br/>registry · recipe · train · promote"]
    MLOps --> Models["ML services<br/>RF · XGBoost · LSTM"]
    Models --> API["FastAPI<br/>inference · simulation · agents"]
    API --> DB[(PostgreSQL)]
    API --> UI["Next.js digital twin<br/>fleet · machine · simulation · chat"]
    Wiki["Knowledge wiki<br/>markdown · wikilinks · BM25"] --> Agent["Supervisor agent"]
    DB --> Agent
    Models --> Agent
    Agent --> UI
    Demo["Vercel demo provider<br/>deterministic + frontend-only"] -. same interface .-> UI
```

One interface, `DigitalTwinDataProvider`, decides where data comes from. Everything above it is identical in both modes:

- `NEXT_PUBLIC_DEMO_MODE=true` → deterministic frontend-only portfolio experience
- unset or `false` → FastAPI provider with the local Docker stack

### Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind CSS · Recharts |
| Backend | FastAPI · SQLAlchemy · Pydantic · PostgreSQL |
| ML | PyTorch LSTM · XGBoost · Random Forest · scikit-learn · pandas · NumPy |
| Agent system | Supervisor · six domain tools · read-only SQL sub-agent · working memory · knowledge wiki · persisted traces |
| MLOps workspace | Registry schema versions · frozen recipes with content digests · JSON training configuration · in-browser logistic regression, CART forest, gradient boosting, MLP and ridge-lag forecaster · quality gates |
| Knowledge wiki | Markdown + YAML frontmatter corpus · `[[wikilinks]]` · BM25 retrieval · d3-force graph · lint and provenance |
| Quality | Vitest · Playwright · linting · production build checks |

<details>
<summary><strong>What gets persisted?</strong></summary>

Machines, telemetry profiles, predictions, recommendations, history, simulations, user access, sessions, chat memory, MFA state, and agent traces are represented in the PostgreSQL/SQLAlchemy model. The source of truth is [`apps/backend/app/db/models.py`](apps/backend/app/db/models.py).

</details>

<details>
<summary><strong>What can I explore in the interface?</strong></summary>

- Fleet health, risk, uptime, weekly events, and machine telemetry
- Random Forest classification and autoregressive LSTM forecasting flows
- Baseline-versus-intervention simulations
- A four-stage MLOps workspace that really prepares data and really trains models in the browser, and an admin approvals page that decides which version serves
- An agent knowledge wiki: graph, BM25 search, editable pages, backlinks, provenance and lint
- AI-assisted investigation with visible tool traces
- Roles, per-machine access, history, and account security
- Frontend-only demo mode or the full FastAPI/PostgreSQL stack

</details>

<sub>↑ [Map](#start-anywhere) · → **Next:** [Run it yourself](#run-it-yourself) · ↔ **Related:** [The demo, in pictures](#the-demo-in-pictures)</sub>

---

## Run it yourself

### Fastest path: frontend demo mode

```bash
cd apps/frontend
npm ci
cp .env.example .env.local
# Set NEXT_PUBLIC_DEMO_MODE=true
npm run dev
```

Open `http://localhost:3000`.

### Full stack

```bash
cp apps/backend/.env.example apps/backend/.env
docker compose up --build
```

FastAPI documentation is available at `http://localhost:8000/docs`. The seeded local account is `admin` / `admin`; the hosted Vercel demo needs no credentials.

### Verify it

```bash
cd apps/frontend
npm run test:unit
npm run lint
npm run build
npm run test:e2e
```

### Deploy the portfolio mode

Import the repository into Vercel and set the root directory to `apps/frontend`. The included `vercel.json` enables demo mode without external services or secrets.

<sub>↑ [Map](#start-anywhere) · → **Next:** [What this leans on](#what-this-leans-on) · ↔ **Related:** [Memory the agent can read](#memory-the-agent-can-read-and-so-can-you)</sub>

---

## What this leans on

Almost nothing here was invented from scratch. What came from somewhere says so, in the wiki's sources panel and here.

| Source | What it gave the project |
|---|---|
| [AI4I 2020 Predictive Maintenance Dataset](https://archive.ics.uci.edu/dataset/601/ai4i+2020+predictive+maintenance+dataset) | The public classification baseline, and the five published failure rules the [MLOps demo](#a-trained-model-is-not-yet-a-workflow) regenerates its rows from |
| ISO 10816-3 / 20816-3 and ISO 13374-1 | Vibration severity zones and the condition-monitoring block model the wiki's `domain/` pages are written against |
| Bearing fault literature (envelope analysis, the P-F curve) | The physics the assistant reasons with, cited page by page rather than in bulk |
| Time-series generative modelling (TSGM) | The [synthetic continuation](#the-synthetic-data-decision) used to expand the Machine C development set |
| ["Retrieval as Reasoning: Self-Evolving Agent-Native Retrieval via LLM-Wiki"](https://arxiv.org/abs/2605.25480) | Inspired the design of the [knowledge wiki](#memory-the-agent-can-read-and-so-can-you): retrieval an agent navigates rather than only queries. The paper reports promising multi-hop and cross-document gains; this project has not reproduced them and does not claim them. |
| Working as an ML engineer intern | Why there is a frozen recipe and an [approval gate](#honesty-is-the-feature) at all, rather than a notebook and a number |

<sub>↑ [Map](#start-anywhere) · → **Next:** [Plain-English glossary](#plain-english-glossary) · ↔ **Related:** [Memory the agent can read](#memory-the-agent-can-read-and-so-can-you)</sub>

---

## Plain-English glossary

Every term this README uses, in one sentence. Nothing here assumes you have trained a model before.

**The machines and their data**

| Term | What it means |
|---|---|
| **Telemetry** | The stream of readings a machine's sensors produce: vibration, temperature, torque, rotation speed. |
| **Digital twin** | A software copy of a real machine, kept close enough to the original that you can try a change on the copy first. |
| **Synthetic data** | Generated readings that continue the pattern of real ones, used to enlarge a dataset that is too small. Always labelled as generated here. |
| **MQTT** | The lightweight messaging protocol industrial sensors normally use to publish their readings. |

**Models and their scores**

| Term | What it means |
|---|---|
| **Training a model** | Showing a program many past examples so that it can judge new ones. What comes out is the model. |
| **Classification** | Sorting a single snapshot into a category: low, medium or high risk, or a type of failure. |
| **Forecasting** | Predicting where the readings themselves are heading over the next minutes. |
| **Feature** | One input column the model reads. A *calculated* feature is one you work out from others, such as torque × speed. |
| **Random Forest, XGBoost** | Two common model types that reach a decision by combining many small decision trees. |
| **LSTM** | A model built for sequences: it learns from a run of readings over time rather than one snapshot. |
| **Accuracy vs. recall** | Accuracy is how often the model is right overall. Recall on failures is how many of the real failures it actually caught. When failures are rare, recall is the honest number. |
| **The trivial answer (baseline)** | The score you would get by always guessing the most common outcome. A model has to beat it to be worth anything. |

**Getting a model into a product**

| Term | What it means |
|---|---|
| **MLOps** | The practice of making the whole model lifecycle repeatable: prepare, train, evaluate, approve, serve. |
| **Schema** | The description of a machine's columns: their names, units, types and meanings. |
| **Recipe / dataset version** | The written-down preparation steps, frozen together with a fingerprint of the exact rows they produced, so the same run can be reproduced later. |
| **Scaler** | The step that puts columns measured in different units onto a comparable numeric range. |
| **Promotion gate** | The checkpoint where a trained candidate is compared with the baseline and then either approved to serve traffic or blocked. Here it lives on the admin approvals page, not in the training workflow. |

**The AI assistant and its memory**

| Term | What it means |
|---|---|
| **Agent** | A language model that can take actions, not just produce text. |
| **Tool call** | One of those actions: run a query, run a prediction, read a page. Each one is shown in the trace. |
| **Supervisor agent** | The agent that decides which tool or sub-agent should handle a request, replacing a fixed set of rules. |
| **Embeddings / vector index** | The usual way to give an AI reference material: text is turned into lists of numbers, and passages that *sound* like the question are pulled back. Effective, but not readable by a person. |
| **BM25** | Classic keyword search ranking, the kind used before embeddings. Fast, exact and inspectable. |
| **Wikilink** | A `[[page name]]` written inside a page. Here, these links are the connections in the knowledge graph. |
| **Provenance** | The record of where a number or claim came from, and which pages rely on it. |

<sub>↑ [Map](#start-anywhere) · → **Next:** [Scope, credit and provenance](#scope-credit-and-provenance)</sub>

---

## Scope, credit, and provenance

A sanitized portfolio repository from Swinburne University **COS40005 Computing Technology Project A/B**, built by a six-person team.

I owned the **ML/AI engineering layer**: diagnosing the original router's limits, migrating the assistant to a native tool-calling supervisor, the read-only SQL sub-agent, the knowledge wiki and its connection to the agent, visible agent traces, session-level working memory, and moving the bespoke Machine C pipeline onto a generic machine schema with a visible prepare, train and approve workflow.

The full team and individual contributions are documented in [CONTRIBUTORS.md](CONTRIBUTORS.md).

<sub>↑ [Back to the map](#start-anywhere)</sub>

Private client readings, credentials, internal documents, and proprietary material are intentionally excluded. The hosted application uses ten fictional fleet instances derived from three model profiles; these are demo assets, not ten independently trained models.

<div align="center">

### Data told us what happened. Models suggested what happens next. The agent made it actionable.

[![Explore the demo](https://img.shields.io/badge/OPEN_THE_DIGITAL_TWIN-2563EB?style=for-the-badge&logo=vercel&logoColor=white)](https://predictive-maintenance-digital-twin.vercel.app/dashboard)

</div>
