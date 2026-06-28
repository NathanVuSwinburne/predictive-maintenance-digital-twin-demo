# machine_c forecasting — auto-research

This is an autonomous research loop for improving the machine_c time-series forecasting model.
The goal: predict the next 30–60 minutes of vibration (X/Y/Z) + temperature from a short history window.

---

## Setup

To set up a new experiment, work with the user to:

1. **Agree on a run tag**: propose a tag based on today's date (e.g. `apr18`). The branch `ml-research/<tag>` must not already exist.
2. **Create the branch**: `git checkout -b ml-research/<tag>` from current main.
3. **Read the in-scope files** for full context:
   - `ml/machine_c/CONTEXT.md` — dataset overview, sessions, data quality, model pipeline.
   - `ml/machine_c/scripts/preprocess_forecast.py` — builds windowed arrays; you may modify this.
   - `ml/machine_c/scripts/train_forecast.py` — the primary file you modify.
   - `ml/machine_c/scripts/evaluate_forecast.py` — rolling long-horizon rollout; you may modify this.
   - `ml/machine_c/scripts/benchmark.mjs` — the evaluation harness. **Do not modify.**
   - `ml/machine_c/models/eval_metrics.json` — current test-set per-feature metrics.
   - `ml/machine_c/models/long_horizon_eval.json` — current 5/10/30/60 min rollout metrics.
4. **Verify data exists**: check that `ml/machine_c/data/processed/forecast/` contains `X_train.npy`, `config.json`, etc. If not, run `python ml/machine_c/scripts/preprocess_forecast.py` first.
5. **Initialise results.tsv**: create it with only the header row (see Logging section below). The baseline will be recorded after the first run.
6. **Confirm and go**.

---

## Experimentation

### What you CAN modify

- `train_forecast.py` — model architecture, loss function, optimizer, training strategy, hyperparameters. This is the primary target. Everything is fair game.
- `preprocess_forecast.py` — window size, stride, feature engineering, normalisation strategy. **If you change this, you must re-run preprocessing before training.** The windowed arrays in `data/processed/forecast/` must stay consistent with the model's expected input shape.
- `evaluate_forecast.py` — only if required by an architectural change (e.g. the rollout chunk size must match your new horizon). Keep its session assignments and horizon marks intact.

### What you CANNOT modify

- `benchmark.mjs` — the fixed evaluation harness. It defines the ground truth metric.
- Raw data in `ml/machine_c/data/processed/simulation/machine_c_clean.csv` or any upstream CSVs.
- Session split assignments — train / val / test sessions are fixed in `config.json`. Do not leak test sessions into training.

### What to optimise

The primary metric is `COMBINED SCORE` from `benchmark.mjs` — **maximise it**.

```
combined = (vib_skill + temp_skill + stability + gen_score) / 4
```

A combined score > 0.7 is the target. All four components matter equally.

Hard constraints that must never be violated:
- `vibration skill > 0` — model must beat the persistence (repeat-last-value) baseline on vibration.
- `temperature skill > 0` — model must beat the persistence baseline on temperature.
- `generalisation_gap ≤ 2` — model must not catastrophically overfit to training sessions.

A run that violates any hard constraint is automatically `discard`, regardless of combined score.

**Do not sacrifice temperature for vibration gains.** The baseline temperature RMSE is large (session 68: ~3.6 at 5 min) — there is substantial room to improve it, and the scoring weights it equally with vibration.

### Simplicity criterion

All else being equal, simpler is better. A +0.01 combined score improvement that adds 100 lines of hacky code is probably not worth it. A +0.01 improvement from deleting regularisation that was doing nothing? Keep it. When the combined score is similar, prefer the smaller, cleaner model.

### The first run

Always run the training pipeline as-is first to establish the baseline. Do not change anything.

---

## Running an experiment

Each experiment follows this sequence:

```bash
# Step 1 — (only if you changed preprocess_forecast.py)
python ml/machine_c/scripts/preprocess_forecast.py

# Step 2 — train
python ml/machine_c/scripts/train_forecast.py > run.log 2>&1

# Step 3 — long-horizon rollout (used by benchmark criterion 5)
python ml/machine_c/scripts/evaluate_forecast.py >> run.log 2>&1

# Step 4 — benchmark
node ml/machine_c/scripts/benchmark.mjs > bench.log 2>&1
```

Extract the key numbers:

```bash
grep "COMBINED SCORE\|Vibration skill\|Temperature skill\|Generalisation gap\|STATUS" bench.log
grep "Best val MSE" run.log
```

If `bench.log` is empty or contains `Python error`, the benchmark crashed — check `run.log` for the stack trace.

**Training duration**: there is no fixed time budget. Training runs until early stopping fires (patience = 10 epochs). A typical run is 20–60 epochs. If a run exceeds 30 minutes wall clock, kill it and treat it as a crash.

---

## Logging results

Log every experiment to `results.tsv` (tab-separated). Do not commit this file.

Header and columns:

```
commit	combined	vib_skill	temp_skill	gen_gap	status	description
```

1. `commit` — 7-char git hash.
2. `combined` — combined score from benchmark (e.g. `0.6823`). Use `0.0000` for crashes.
3. `vib_skill` — vibration skill score. Use `0.0000` for crashes.
4. `temp_skill` — temperature skill score. Use `0.0000` for crashes.
5. `gen_gap` — generalisation gap. Use `0.0000` for crashes.
6. `status` — `keep`, `discard`, or `crash`.
7. `description` — short description of what changed.

Example:

```
commit	combined	vib_skill	temp_skill	gen_gap	status	description
a1b2c3d	0.6012	0.42	0.51	1.21	keep	baseline
b2c3d4e	0.6340	0.45	0.55	1.18	keep	temperature loss weight x2
c3d4e5f	0.5900	0.48	0.30	1.45	discard	larger hidden size — temp degraded
d4e5f6g	0.0000	0.0000	0.0000	0.0000	crash	transformer encoder OOM
e5f6g7h	0.6580	0.46	0.58	1.10	keep	Huber loss + LayerNorm in decoder
```

---

## The experiment loop

The branch is `ml-research/<tag>`.

LOOP FOREVER:

1. **Check git state**: current branch and commit.
2. **Pick an idea** and edit the relevant script(s). Commit the change.
3. **Run the pipeline** (preprocess if needed → train → evaluate → benchmark).
4. **Read results**: extract combined score and check hard constraints.
5. **Handle crashes**: if training or benchmark crashes and the fix is trivial (typo, missing import), fix and re-run. If the idea is fundamentally broken, log as `crash` and move on.
6. **Log** the result to `results.tsv`.
7. **Decide**:
   - Combined score improved AND no hard constraints violated → `keep` (advance the branch).
   - Combined score same or worse, OR any hard constraint violated → `discard` (`git reset --hard` to last `keep` commit).
8. **Repeat**.

**NEVER STOP**: once the loop begins, do not pause to ask the human for permission to continue. Do not ask "should I keep going?". The human expects you to run autonomously until manually interrupted. If you run out of ideas, think harder — re-read the data context, study per-feature errors from `eval_metrics.json`, look at what changed in the training log. Try more radical changes. The loop runs until stopped.

---

## Exploration ideas

You are free to try anything. The list below is a starting point, not a constraint.

**Architecture**
- Bidirectional encoder LSTM
- Replace decoder with a Transformer decoder
- Add multi-head attention between encoder output and decoder steps
- Dilated convolutions as encoder (longer receptive field without extra parameters)
- Separate output heads for vibration vs temperature (enables per-group loss weighting)

**Loss functions**
- Per-feature loss weights — upweight temperature (it has the highest absolute RMSE and most room for improvement)
- Huber loss instead of MSE (more robust to sensor spike outliers)
- Log-cosh loss
- Auxiliary reconstruction loss on the input window (denoising autoencoder style)

**Training strategy**
- Faster teacher forcing decay (the model may be over-relying on TF and not learning to roll out)
- Scheduled sampling: curriculum where GT is replaced gradually by own predictions during training
- Gradient clipping threshold tuning (currently 1.0 — try 0.5 or 2.0)
- Learning rate warm-up before decay
- AdamW with weight decay instead of Adam

**Feature engineering** (requires preprocess changes)
- Add within-session time index as an input feature
- Add rolling mean / std of each sensor over the input window as extra channels
- Log-transform vibration magnitude (compresses outlier spikes)
- Increase or decrease window size (currently 120 steps = 60 s context)
- Increase stride during preprocessing to reduce window overlap (may improve cross-session generalisation)

**Regularisation**
- Input noise injection during training (makes the model robust to sensor jitter and improves generalisation)
- Dropout tuning (currently 0.2 — try 0.1 or 0.3)
- Weight decay
- Mixup between windows from different training sessions

**Known weaknesses to prioritise**
- Temperature RMSE at 5 min on session 68 is ~3.6 — this is the single biggest improvement opportunity. The model is likely just predicting a slow drift and not capturing the true temperature dynamics. Try a higher temperature loss weight, a separate temperature head, or a larger hidden size.
- Session 12 shows a sharp RMSE spike at 10 min then partial recovery — suggests instability in the autoregressive rollout for certain sessions. Look at the teacher forcing schedule and gradient clipping.
- If generalisation_gap keeps rising across experiments, try: adding Gaussian noise to inputs during training, increasing stride in preprocessing, or reducing model capacity.
