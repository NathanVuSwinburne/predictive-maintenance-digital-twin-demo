#!/usr/bin/env node
/**
 * benchmark.mjs — Forecasting evaluation for machine_c (sensordata, AutoregressiveLSTM).
 *
 * Usage: node ml/machine_c/scripts/benchmark.mjs
 *
 * Requires: Python with torch, numpy, joblib on PATH.
 *   Run preprocess_forecast.py and train_forecast.py first.
 *   Run evaluate_forecast.py first to generate long_horizon_eval.json (criterion 5).
 *
 * Evaluation criteria:
 *   1. Baseline skill score   — must beat persistence on both vibration AND temperature
 *   2. Multi-feature accuracy — MAE per vibration axis (X/Y/Z), RMSE for temperature
 *   3. Stability              — outlier_rate = % of predictions with error > 3× median
 *   4. Cross-session gap      — generalisation_gap = eval_error / train_error (must be ≤ 2)
 *   5. Long-horizon decay     — 5 / 10 / 30 / 60 min rollout from long_horizon_eval.json
 */

import { spawnSync }                 from 'node:child_process';
import { fileURLToPath }             from 'node:url';
import { dirname, join }             from 'node:path';
import { readFileSync, existsSync }  from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname = ml/machine_c/scripts/  →  parent = ml/machine_c/
const ROOT_MC    = join(__dirname, '..');
const PYTHON_BIN = process.env.PYTHON ?? 'python';

// ─────────────────────────────────────────────────────────────────────────────
// Python: load windowed data + trained model → predictions as JSON
// Spawned with cwd = ml/machine_c/scripts/ so Path.cwd().parent = ml/machine_c/
// ─────────────────────────────────────────────────────────────────────────────
const PYTHON_EVAL = `
import os, json, numpy as np, torch, torch.nn as nn, joblib
from pathlib import Path

ROOT     = Path(os.getcwd()).parent                       # ml/machine_c/
DATA_DIR = ROOT / 'data' / 'processed' / 'forecast'
MOD_DIR  = ROOT / 'models'
CKPT     = MOD_DIR / 'forecast_lstm_best.pt'

for p in (DATA_DIR, CKPT):
    if not p.exists():
        raise SystemExit(f'ERROR: not found: {p}')

N_FEATURES   = 4
HORIZON      = 120
FEATURE_COLS = ['VibrationX', 'VibrationY', 'VibrationZ', 'Temperature']

class AutoregressiveLSTM(nn.Module):
    def __init__(self, n, h, l, d, hz):
        super().__init__()
        self.horizon = hz
        drop = d if l > 1 else 0.0
        self.encoder = nn.LSTM(n, h, l, dropout=drop, batch_first=True)
        self.decoder = nn.LSTM(n, h, l, dropout=drop, batch_first=True)
        self.head    = nn.Linear(h, n)
    def forward(self, x, **_):
        _, (h, c) = self.encoder(x)
        dec = x[:, -1:, :]
        last_temp = x[:, -1:, 3:4]
        out = []
        for _ in range(self.horizon):
            step, (h, c) = self.decoder(dec, (h, c))
            pred = self.head(step)
            out.append(pred)
            dec = torch.cat([pred[:, :, :3].detach(), last_temp], dim=2)
        return torch.cat(out, dim=1)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model  = AutoregressiveLSTM(4, 128, 2, 0.2, HORIZON).to(device)
model.load_state_dict(torch.load(CKPT, map_location=device, weights_only=True))
model.eval()

def load_t(name): return torch.tensor(np.load(DATA_DIR / name), dtype=torch.float32)
X_train, y_train = load_t('X_train.npy'), load_t('y_train.npy')
X_test,  y_test  = load_t('X_test.npy'),  load_t('y_test.npy')

def predict(X, bs=256):
    parts = []
    with torch.no_grad():
        for i in range(0, len(X), bs):
            parts.append(model(X[i:i+bs].to(device)).cpu().numpy())
    return np.concatenate(parts)

rng = np.random.default_rng(42)
def pick(X, y, n=1000):
    idx = rng.choice(len(X), min(n, len(X)), replace=False)
    return X[idx], y[idx]

X_tr, y_tr = pick(X_train, y_train)
X_te, y_te = pick(X_test,  y_test)

p_tr = predict(X_tr)
p_te = predict(X_te)

scaler = joblib.load(DATA_DIR / 'scaler.joblib')
def inv(a):
    n, t, f = a.shape
    return scaler.inverse_transform(a.reshape(-1, f)).reshape(n, t, f)
def last_real(X):                           # last input step, real units: (N, F)
    return scaler.inverse_transform(X[:, -1, :].numpy())

print(json.dumps({
    'feature_cols': FEATURE_COLS,
    'horizon':      HORIZON,
    'interval_s':   0.5,
    'test':  {
        'preds':    inv(p_te).tolist(),
        'targets':  inv(y_te.numpy()).tolist(),
        'last_obs': last_real(X_te).tolist(),
    },
    'train': {
        'preds':    inv(p_tr).tolist(),
        'targets':  inv(y_tr.numpy()).tolist(),
        'last_obs': last_real(X_tr).tolist(),
    },
}))
`;

// ─────────────────────────────────────────────────────────────────────────────
// Run Python
// ─────────────────────────────────────────────────────────────────────────────
process.stderr.write('[benchmark] Running model inference (windowed test + train sets)...\n');

const py = spawnSync(PYTHON_BIN, ['-c', PYTHON_EVAL], {
    encoding:  'utf8',
    maxBuffer: 100 * 1024 * 1024,
    cwd:       __dirname,
    env:       process.env,
});

if (py.status !== 0) {
    process.stderr.write('[benchmark] Python error:\n' + (py.stderr || String(py.error)) + '\n');
    process.exit(1);
}

const data = JSON.parse(py.stdout.trim());
const { feature_cols, horizon, interval_s } = data;

const pTest  = data.test.preds;     // [N][horizon][F]
const tTest  = data.test.targets;
const loTest = data.test.last_obs;  // [N][F]  last observed value per window
const pTrain = data.train.preds;
const tTrain = data.train.targets;
const loTrain= data.train.last_obs;

process.stderr.write(
    `[benchmark] ${pTest.length} test / ${pTrain.length} train windows. Scoring...\n`
);

const F       = feature_cols.length;
const vibIdx  = feature_cols.map((n, i) => n.toLowerCase().includes('vib')  ? i : -1).filter(i => i >= 0);
const tempIdx = feature_cols.map((n, i) => n.toLowerCase().includes('temp') ? i : -1).filter(i => i >= 0);

// ─────────────────────────────────────────────────────────────────────────────
// Metric helpers
// ─────────────────────────────────────────────────────────────────────────────
function mae(preds, targets, idxs, steps) {
    let sum = 0, n = 0;
    for (let w = 0; w < preds.length; w++)
        for (let t = 0; t < steps; t++)
            for (const fi of idxs) { sum += Math.abs(preds[w][t][fi] - targets[w][t][fi]); n++; }
    return n ? sum / n : 0;
}

function rmse(preds, targets, idxs, steps) {
    let sum = 0, n = 0;
    for (let w = 0; w < preds.length; w++)
        for (let t = 0; t < steps; t++)
            for (const fi of idxs) { const e = preds[w][t][fi] - targets[w][t][fi]; sum += e * e; n++; }
    return n ? Math.sqrt(sum / n) : 0;
}

function maePersist(targets, lastObs, idxs, steps) {
    let sum = 0, n = 0;
    for (let w = 0; w < targets.length; w++)
        for (let t = 0; t < steps; t++)
            for (const fi of idxs) { sum += Math.abs(lastObs[w][fi] - targets[w][t][fi]); n++; }
    return n ? sum / n : 0;
}

function rmsePersist(targets, lastObs, idxs, steps) {
    let sum = 0, n = 0;
    for (let w = 0; w < targets.length; w++)
        for (let t = 0; t < steps; t++)
            for (const fi of idxs) { const e = lastObs[w][fi] - targets[w][t][fi]; sum += e * e; n++; }
    return n ? Math.sqrt(sum / n) : 0;
}

function median(arr) {
    const s = Float64Array.from(arr).sort();
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function outlierRate(preds, targets) {
    const errs = [];
    for (let w = 0; w < preds.length; w++)
        for (let t = 0; t < preds[w].length; t++)
            for (let fi = 0; fi < F; fi++)
                errs.push(Math.abs(preds[w][t][fi] - targets[w][t][fi]));
    const threshold = 3 * median(errs);
    return errs.filter(e => e > threshold).length / errs.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Baseline skill scores
// ─────────────────────────────────────────────────────────────────────────────
const bVibMae   = maePersist(tTest, loTest, vibIdx,  horizon);
const bTempRmse = rmsePersist(tTest, loTest, tempIdx, horizon);
const mVibMae   = mae(pTest,  tTest, vibIdx,  horizon);
const mTempRmse = rmse(pTest, tTest, tempIdx, horizon);
const vibSkill  = 1 - mVibMae   / bVibMae;
const tempSkill = 1 - mTempRmse / bTempRmse;

// ─────────────────────────────────────────────────────────────────────────────
// 2. Multi-feature performance (already covered by skill scores above)
// ─────────────────────────────────────────────────────────────────────────────
const perFeatureMae  = vibIdx.map(fi => ({ name: feature_cols[fi], val: mae(pTest,  tTest, [fi], horizon) }));
const perFeatureRmse = tempIdx.map(fi => ({ name: feature_cols[fi], val: rmse(pTest, tTest, [fi], horizon) }));

// ─────────────────────────────────────────────────────────────────────────────
// 3. Stability
// ─────────────────────────────────────────────────────────────────────────────
const orate     = outlierRate(pTest, tTest);
const stability = 1 - orate;

// ─────────────────────────────────────────────────────────────────────────────
// 4. Cross-session generalisation gap
//    Normalise each split by its own baseline so units cancel.
// ─────────────────────────────────────────────────────────────────────────────
const trVibMae    = mae(pTrain,  tTrain, vibIdx,  horizon);
const trTempRmse  = rmse(pTrain, tTrain, tempIdx, horizon);
const bTrVibMae   = maePersist(tTrain, loTrain, vibIdx,  horizon);
const bTrTempRmse = rmsePersist(tTrain, loTrain, tempIdx, horizon);

const trainNorm = (trVibMae / bTrVibMae + trTempRmse / bTrTempRmse) / 2;
const testNorm  = (mVibMae  / bVibMae   + mTempRmse  / bTempRmse)   / 2;
const genGap    = testNorm / trainNorm;
const genScore  = 1 / Math.max(genGap, 1);

// ─────────────────────────────────────────────────────────────────────────────
// 5. Long-horizon consistency — read evaluate_forecast.py output
//    horizon marks: 5 / 10 / 30 / 60 min (rolling autoregressive rollout on session 68)
// ─────────────────────────────────────────────────────────────────────────────
const lhPath = join(ROOT_MC, 'models', 'long_horizon_eval.json');
let lhData   = null;
let lhWarn   = null;

if (existsSync(lhPath)) {
    lhData = JSON.parse(readFileSync(lhPath, 'utf8'));
} else {
    lhWarn = 'long_horizon_eval.json not found — run evaluate_forecast.py to generate it.';
}

// For each horizon mark, compute average vibration MAE and temperature RMSE
// across all sessions present in the file. Then check degradation from 5→60 min.
function lhMetrics(session, marks) {
    return marks.map(mark => {
        const key = `${mark}min`;
        const h   = session.horizons[key];
        if (!h) return null;
        const vibMaeAvg  = vibIdx.map(fi => h[feature_cols[fi]]?.mae  ?? null)
                                 .filter(v => v !== null);
        const tempRmseAvg= tempIdx.map(fi => h[feature_cols[fi]]?.rmse ?? null)
                                  .filter(v => v !== null);
        return {
            mark,
            vibMae:   vibMaeAvg.length   ? vibMaeAvg.reduce((a,b)=>a+b,0)/vibMaeAvg.length   : null,
            tempRmse: tempRmseAvg.length ? tempRmseAvg.reduce((a,b)=>a+b,0)/tempRmseAvg.length: null,
        };
    }).filter(Boolean);
}

const LH_MARKS  = [5, 10, 30, 60];
const lhSessions= lhData ? Object.entries(lhData) : [];
const lhRows    = lhSessions.map(([sid, s]) => ({ sid, metrics: lhMetrics(s, LH_MARKS) }));

// Degradation check on the primary eval session (session 68 = held-out)
const evalSessId = '68';
const evalSess   = lhData?.[evalSessId];
const lhEval     = evalSess ? lhMetrics(evalSess, LH_MARKS) : [];
const lhFirst    = lhEval.find(r => r.mark === LH_MARKS[0]);
const lhLast     = lhEval.find(r => r.mark === LH_MARKS[LH_MARKS.length - 1]);
const lhVibDeg   = (lhFirst && lhLast && lhFirst.vibMae)   ? lhLast.vibMae   / lhFirst.vibMae   : null;
const lhTempDeg  = (lhFirst && lhLast && lhFirst.tempRmse) ? lhLast.tempRmse / lhFirst.tempRmse : null;

// Mean-collapse detection: if std of predictions at last horizon step << std of targets
function stdAt(arr2d, step, fi) {
    const vals = arr2d.map(w => w[step - 1][fi]);
    const mu   = vals.reduce((s, v) => s + v, 0) / vals.length;
    return Math.sqrt(vals.reduce((s, v) => s + (v - mu) ** 2, 0) / vals.length);
}
const stdRatios    = vibIdx.map(fi => stdAt(pTest, horizon, fi) / (stdAt(tTest, horizon, fi) + 1e-8));
const meanCollapse = stdRatios.some(r => r < 0.1);

// ─────────────────────────────────────────────────────────────────────────────
// 6. Combined score + hard constraints
// ─────────────────────────────────────────────────────────────────────────────
const combined  = (vibSkill + tempSkill + stability + genScore) / 4;

const hardFails = [];
if (vibSkill  <= 0) hardFails.push('vibration skill <= 0  (model is not better than persistence baseline)');
if (tempSkill <= 0) hardFails.push('temperature skill <= 0  (model is not better than persistence baseline)');
if (genGap    >  2) hardFails.push(`generalisation_gap = ${genGap.toFixed(3)} > 2  (fails cross-session test)`);

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────
const W   = 66;
const dbl = '='.repeat(W);
const bar = '-'.repeat(W);

function row(label, value, unit = '', pass = null) {
    const v    = typeof value === 'number' ? value.toFixed(4) : String(value ?? 'n/a');
    const flag = pass === null ? '' : pass ? '  [OK]' : '  [FAIL]';
    return `  ${label.padEnd(34)} ${v.padStart(10)} ${(unit || '').padEnd(6)}${flag}`;
}

console.log('\n' + dbl);
console.log('  BENCHMARK  —  machine_c  /  AutoregressiveLSTM');
console.log(`  ${pTest.length} test windows  /  ${pTrain.length} train windows  /  horizon=${horizon} steps (${horizon * interval_s}s)`);
console.log(dbl);

console.log('\n-- 1. BASELINE SKILL SCORES ' + '-'.repeat(W - 28) + '\n');
console.log(row('Persistence vib MAE',    bVibMae,   'units'));
console.log(row('Model vib MAE',          mVibMae,   'units', mVibMae   < bVibMae));
console.log(row('Vibration skill score',  vibSkill,  '',      vibSkill  > 0));
console.log('');
console.log(row('Persistence temp RMSE',  bTempRmse, 'units'));
console.log(row('Model temp RMSE',        mTempRmse, 'units', mTempRmse < bTempRmse));
console.log(row('Temperature skill score',tempSkill, '',      tempSkill > 0));

console.log('\n-- 2. MULTI-FEATURE PERFORMANCE ' + '-'.repeat(W - 33) + '\n');
perFeatureMae.forEach(({ name, val }) => console.log(row(`MAE   ${name}`, val, 'units')));
perFeatureRmse.forEach(({ name, val }) => console.log(row(`RMSE  ${name}`, val, 'units')));

console.log('\n-- 3. STABILITY ' + '-'.repeat(W - 17) + '\n');
console.log(row('Outlier rate  (error > 3x median)', orate,     '', orate < 0.05));
console.log(row('Stability score  (1 - outlier_rate)', stability));

console.log('\n-- 4. CROSS-SESSION GENERALISATION ' + '-'.repeat(W - 36) + '\n');
console.log(row('Train normalised error',            trainNorm));
console.log(row('Test  normalised error',            testNorm));
console.log(row('Generalisation gap',                genGap,    '', genGap <= 2));
console.log(row('Generalisation score  (1/max(gap,1))', genScore));

console.log('\n-- 5. LONG-HORIZON CONSISTENCY  (rolling rollout, session 68) ' + '-'.repeat(4) + '\n');

if (lhWarn) {
    console.log(`  WARNING: ${lhWarn}`);
} else {
    // Table header
    const cols = ['Mark', 'Vib-MAE (avg)', 'Temp-RMSE'];
    console.log('  ' + cols[0].padEnd(8) + cols[1].padEnd(18) + cols[2]);
    console.log('  ' + bar.slice(0, 40));
    lhEval.forEach(({ mark, vibMae, tempRmse }) => {
        const vm = vibMae   != null ? vibMae.toFixed(4)   : 'n/a';
        const tr = tempRmse != null ? tempRmse.toFixed(4) : 'n/a';
        console.log(`  ${(mark + 'min').padEnd(8)}${vm.padEnd(18)}${tr}`);
    });

    console.log('');
    if (lhVibDeg  != null) console.log(row('Vib  degradation  (60min / 5min)',  lhVibDeg,  '', lhVibDeg  < 3));
    if (lhTempDeg != null) console.log(row('Temp degradation  (60min / 5min)',  lhTempDeg, '', lhTempDeg < 3));
    console.log(row('Mean collapse at window horizon',    meanCollapse ? 'YES' : 'no', '', !meanCollapse));

    if (lhSessions.length > 1) {
        console.log('\n  Other sessions in file:');
        lhSessions.filter(([sid]) => sid !== evalSessId).forEach(([sid, s]) => {
            const m5 = s.horizons['5min'];
            if (!m5) return;
            const vib = vibIdx.map(fi => m5[feature_cols[fi]]?.mae ?? 0).reduce((a,b)=>a+b,0) / vibIdx.length;
            console.log(`    session ${sid}  5min vib-MAE=${vib.toFixed(4)}  (note: may be a train session)`);
        });
    }
}

console.log('\n-- 6. COMBINED SCORE ' + '-'.repeat(W - 22) + '\n');
console.log(row('Vibration skill',         vibSkill));
console.log(row('Temperature skill',       tempSkill));
console.log(row('Stability',               stability));
console.log(row('Generalisation',          genScore));
console.log('  ' + bar);
console.log(row('COMBINED SCORE', combined, '', combined > 0.5));

if (hardFails.length) {
    console.log('\n-- HARD CONSTRAINTS VIOLATED ' + '-'.repeat(W - 30) + '\n');
    hardFails.forEach(f => console.log(`  [FAIL]  ${f}`));
    console.log('\n  STATUS: FAIL\n');
} else {
    const label = combined > 0.7 ? 'GOOD' : combined > 0.5 ? 'MARGINAL' : 'POOR';
    console.log(`\n  STATUS: PASS (${label})\n`);
}

console.log(dbl + '\n');
