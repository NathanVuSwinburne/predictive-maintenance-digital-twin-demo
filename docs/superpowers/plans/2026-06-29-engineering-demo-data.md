# Engineering Demo Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, internally consistent engineering-demo experience for Machines, History, AI Assistant, Predict, and Simulation without changing FastAPI-backed behavior.

**Architecture:** Extract portfolio fixtures and calculations from the oversized demo provider into focused `lib/demo-engineering` modules. A shared asset registry and deterministic signal functions will drive telemetry, prediction, sessions, simulations, history chains, and Assistant content blocks; the provider remains a thin adapter to the existing `DigitalTwinDataProvider` contract.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Recharts, Playwright.

---

## File Structure

- Create `apps/frontend/lib/demo-engineering/types.ts`: internal asset, sensor, session, provenance, and prediction-score contracts.
- Create `apps/frontend/lib/demo-engineering/assets.ts`: ten immutable asset profiles, operating envelopes, thresholds, and prediction field definitions.
- Create `apps/frontend/lib/demo-engineering/signals.ts`: deterministic seeded noise and machine-type telemetry generation.
- Create `apps/frontend/lib/demo-engineering/prediction.ts`: machine-type scoring, warnings, breached fields, and public prediction configs.
- Create `apps/frontend/lib/demo-engineering/sessions.ts`: client-derived Machine C session metadata, observed fixtures, preview generation, and synthetic continuation.
- Create `apps/frontend/lib/demo-engineering/history.ts`: linked 30-day event chains.
- Create `apps/frontend/lib/demo-engineering/chat.ts`: prompt routing and rich Assistant block composition.
- Modify `apps/frontend/lib/data/demo-provider.ts`: delegate demo operations to the focused modules.
- Modify `apps/frontend/lib/domain/types.ts`: add optional session provenance metadata required by the UI.
- Modify `apps/frontend/app/(protected)/simulator/page.tsx`: display collection duration, cadence, previous-session gap, and provenance.
- Modify `apps/frontend/components/chat/chat-workspace.tsx`: expose capability-accurate prompt guidance without changing production routing.
- Modify `README.md`: document intermittent client monitoring captures, sanitization, deterministic fixtures, and scripted rich responses.
- Create focused unit tests under `apps/frontend/test/demo-engineering/` and extend `apps/frontend/test/demo-provider.test.ts`.
- Modify `apps/frontend/e2e/demo-journey.spec.ts`: cover a telemetry chart prompt, prediction flow, and session simulation flow.

### Task 1: Define the engineering asset registry

**Files:**
- Create: `apps/frontend/lib/demo-engineering/types.ts`
- Create: `apps/frontend/lib/demo-engineering/assets.ts`
- Create: `apps/frontend/test/demo-engineering/assets.test.ts`

- [ ] **Step 1: Write the failing registry test**

```ts
import { describe, expect, it } from "vitest";
import { DEMO_ASSETS, getDemoAsset } from "@/lib/demo-engineering/assets";

describe("demo engineering assets", () => {
  it("defines ten unique assets with valid operating envelopes", () => {
    expect(DEMO_ASSETS).toHaveLength(10);
    expect(new Set(DEMO_ASSETS.map((asset) => asset.id)).size).toBe(10);
    for (const asset of DEMO_ASSETS) {
      expect(asset.sensors.length).toBeGreaterThanOrEqual(4);
      for (const sensor of asset.sensors) {
        expect(sensor.min).toBeLessThan(sensor.typical);
        expect(sensor.typical).toBeLessThan(sensor.max);
        expect(sensor.warningHigh).toBeLessThanOrEqual(sensor.max);
      }
    }
    expect(getDemoAsset("machine-b-01").predictionFields.map((field) => field.key))
      .toEqual(["temperature", "vibration", "pressure", "humidity", "power"]);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `cd apps/frontend && npm run test:unit -- test/demo-engineering/assets.test.ts`

Expected: FAIL because `@/lib/demo-engineering/assets` does not exist.

- [ ] **Step 3: Add explicit internal contracts and the ten-profile registry**

Define `DemoAssetProfile`, `DemoSensorDefinition`, and `DemoPredictionField` in `types.ts`. Populate all ten existing IDs in `assets.ts`, using these sensor sets:

```ts
export const SENSOR_KEYS_BY_TYPE = {
  ai4i: ["airTempK", "processTempK", "rotationalSpeed", "torque", "toolWear", "power"],
  sensor: ["temperature", "vibration", "pressure", "humidity", "power"],
  "real-sensor": ["vibrationX", "vibrationY", "vibrationZ", "temperature"],
} as const;

export function getDemoAsset(id: string): DemoAssetProfile {
  const asset = DEMO_ASSETS.find((candidate) => candidate.id === id);
  if (!asset) throw new Error(`Unknown demo machine: ${id}`);
  return asset;
}
```

Each profile must contain the current name, line, model, type, status, health/risk, uptime and service dates plus asset-specific sensor envelopes, failure modes, operating hours, location, notes, phase offsets, and prediction fields. Use `satisfies readonly DemoAssetProfile[]` so missing fields fail at compile time.

- [ ] **Step 4: Run the focused test**

Run: `cd apps/frontend && npm run test:unit -- test/demo-engineering/assets.test.ts`

Expected: PASS with 10 assets and valid envelopes.

- [ ] **Step 5: Commit the registry**

```powershell
git add apps/frontend/lib/demo-engineering/types.ts apps/frontend/lib/demo-engineering/assets.ts apps/frontend/test/demo-engineering/assets.test.ts
git commit -m "feat: add demo engineering asset profiles"
```

### Task 2: Generate deterministic, physically plausible telemetry

**Files:**
- Create: `apps/frontend/lib/demo-engineering/signals.ts`
- Create: `apps/frontend/test/demo-engineering/signals.test.ts`
- Modify: `apps/frontend/lib/data/demo-provider.ts`

- [ ] **Step 1: Write failing determinism and signal-behavior tests**

```ts
import { describe, expect, it } from "vitest";
import { generateTelemetry, generateDriveReadings } from "@/lib/demo-engineering/signals";

describe("demo signals", () => {
  it("is deterministic and keeps timestamps ordered", () => {
    const first = generateTelemetry("machine-b-01", 288);
    expect(first).toEqual(generateTelemetry("machine-b-01", 288));
    expect(first.every((point, index) => index === 0 || point.timestamp > first[index - 1].timestamp)).toBe(true);
    expect(first.flatMap((point) => [point.temperature, point.vibration, point.pressure, point.power]).every(Number.isFinite)).toBe(true);
  });

  it("produces fluctuating vibration and slower thermal response", () => {
    const points = generateDriveReadings("machine-c-01", 720, "2026-06-28T00:00:00.000Z");
    const x = points.map((point) => point.values.vibrationX);
    const temperature = points.map((point) => point.values.temperature);
    const meanDelta = (values: number[]) => values.slice(1).reduce((sum, value, i) => sum + Math.abs(value - values[i]), 0) / (values.length - 1);
    expect(meanDelta(x)).toBeGreaterThan(meanDelta(temperature) * 3);
    expect(new Set(x.map((value) => value.toFixed(3))).size).toBeGreaterThan(40);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `cd apps/frontend && npm run test:unit -- test/demo-engineering/signals.test.ts`

Expected: FAIL because signal generators are missing.

- [ ] **Step 3: Implement stable noise and correlated signals**

Use a string-hash plus Mulberry32 PRNG; never call `Math.random()`. Compose signals from low-frequency load, two non-harmonic rotational terms, seeded broadband noise, bounded impulses, and asset phase. Model temperature using a first-order lag toward load-dependent equilibrium and inject at most one short sensor transient per 24-hour series.

```ts
export function createSeededRandom(seedText: string) {
  let seed = hashString(seedText);
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
```

Map rich internal values to the existing `TelemetryPoint` summary contract in `generateTelemetry`; keep three-axis values in `generateDriveReadings` for sessions and simulation.

- [ ] **Step 4: Replace `readings()` and `forecast()` delegation in the provider**

Import `generateTelemetry` and remove the uniform sine-only helper. Make `getMachineTelemetry()` return the deterministic 24-hour series.

- [ ] **Step 5: Run focused provider and signal tests**

Run: `cd apps/frontend && npm run test:unit -- test/demo-engineering/signals.test.ts test/demo-provider.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit telemetry generation**

```powershell
git add apps/frontend/lib/demo-engineering/signals.ts apps/frontend/lib/data/demo-provider.ts apps/frontend/test/demo-engineering/signals.test.ts
git commit -m "feat: generate realistic demo telemetry"
```

### Task 3: Add machine-type prediction fields and scoring

**Files:**
- Create: `apps/frontend/lib/demo-engineering/prediction.ts`
- Create: `apps/frontend/test/demo-engineering/prediction.test.ts`
- Modify: `apps/frontend/lib/data/demo-provider.ts`

- [ ] **Step 1: Write failing config and scoring tests**

```ts
it.each([
  ["machine-a-01", ["airTempK", "processTempK", "rotationalSpeed", "torque", "toolWear", "productType"]],
  ["machine-b-01", ["temperature", "vibration", "pressure", "humidity", "power"]],
  ["machine-c-01", ["vibrationX", "vibrationY", "vibrationZ", "temperature"]],
])("returns machine-specific fields for %s", (id, expected) => {
  expect(createPredictionConfig(id).fields.map((field) => field.key)).toEqual(expected);
});

it("identifies pump vibration and temperature breaches", () => {
  const result = scorePrediction("machine-b-01", { temperature: 92, vibration: 11, pressure: 4.8, humidity: 62, power: 112 });
  expect(result.breachedFields).toEqual(expect.arrayContaining(["temperature", "vibration"]));
  expect(result.failureProbability).toBeGreaterThan(0.5);
  expect(result.warnings.join(" ")).toMatch(/demo engineering score/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `cd apps/frontend && npm run test:unit -- test/demo-engineering/prediction.test.ts`

Expected: FAIL because prediction helpers do not exist.

- [ ] **Step 3: Implement configs and bounded engineering scores**

Normalize each numeric input against its recommended and observed bands. Use type-specific weighted components: thermal differential + torque-speed + wear for AI4I; vibration + bearing temperature + pressure deviation + humidity + power for pumps/fans; vector vibration magnitude + axis imbalance + temperature for drives. Clamp probability to `[0.02, 0.98]`, derive severity from probability, list every field outside its recommended band, and return an explicit `Deterministic demo engineering score; not production inference.` warning.

- [ ] **Step 4: Delegate prediction methods from `DemoDigitalTwinProvider`**

Replace the one-temperature config and score with:

```ts
async getPredictionConfig(machineId: string) { return createPredictionConfig(machineId); }
async predictMachine(machineId: string, input: ManualPredictionInput) {
  return scorePrediction(machineId, input.values);
}
```

- [ ] **Step 5: Run tests and commit**

Run: `cd apps/frontend && npm run test:unit -- test/demo-engineering/prediction.test.ts test/demo-provider.test.ts`

Expected: PASS.

```powershell
git add apps/frontend/lib/demo-engineering/prediction.ts apps/frontend/lib/data/demo-provider.ts apps/frontend/test/demo-engineering/prediction.test.ts
git commit -m "feat: enrich demo prediction inputs"
```

### Task 4: Model intermittent client sessions and simulation provenance

**Files:**
- Create: `apps/frontend/lib/demo-engineering/sessions.ts`
- Create: `apps/frontend/test/demo-engineering/sessions.test.ts`
- Modify: `apps/frontend/lib/domain/types.ts`
- Modify: `apps/frontend/lib/data/demo-provider.ts`

- [ ] **Step 1: Write failing session tests**

```ts
it("exposes intermittent one-to-five-hour client captures", () => {
  const sessions = listClientSessions("machine-c-01");
  expect(sessions.map((item) => item.sessionId)).toEqual([10, 20, 78, 100]);
  expect(sessions.every((item) => item.durationMinutes >= 60 && item.durationMinutes <= 300)).toBe(true);
  expect(sessions.slice(1).every((item) => (item.gapFromPreviousMinutes ?? 0) >= 1440)).toBe(true);
});

it("marks only forecast points synthetic", () => {
  const preview = createSessionPreview("machine-c-01", 78);
  const run = createSimulationRun(preview, 60, "demo-admin", "Bearing outlook");
  expect(preview.readings.every((point) => point.synthetic === false)).toBe(true);
  expect(run.generatedReadings?.every((point) => point.synthetic === true)).toBe(true);
  expect(run.sourceWindow?.realPoints).toBe(preview.readings.length);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `cd apps/frontend && npm run test:unit -- test/demo-engineering/sessions.test.ts`

Expected: FAIL because session helpers and gap metadata are missing.

- [ ] **Step 3: Extend session metadata safely**

Add optional fields to `SimulationSessionOption`:

```ts
sampleIntervalMs?: number | null;
gapFromPreviousMinutes?: number | null;
provenance?: "observed" | "curated-observed-fixture" | "synthetic" | null;
```

Optional fields preserve FastAPI compatibility.

- [ ] **Step 4: Implement session fixtures and continuation**

Define sessions 10, 20, 78, and 100 as sanitized deterministic observed fixtures with collection dates separated by days and durations between 60 and 300 minutes. Keep the public demo free of private raw client rows. Generate decimated preview points at 30-second display cadence while retaining source cadence/sample-count metadata. Start forecast timestamps after the observed endpoint and use the signal generator with session-specific baseline, variance, trend, and axis correlation.

- [ ] **Step 5: Delegate simulation config, preview, and run methods**

Replace session 301 and the generic forecast. Ensure risk, classification windows, downtime, and recommendations are calculated from generated vibration magnitude, imbalance, and temperature rather than copied from the machine summary.

- [ ] **Step 6: Run tests and commit**

Run: `cd apps/frontend && npm run test:unit -- test/demo-engineering/sessions.test.ts test/demo-provider.test.ts test/simulation-resolver.test.ts`

Expected: PASS.

```powershell
git add apps/frontend/lib/demo-engineering/sessions.ts apps/frontend/lib/domain/types.ts apps/frontend/lib/data/demo-provider.ts apps/frontend/test/demo-engineering/sessions.test.ts
git commit -m "feat: add intermittent demo monitoring sessions"
```

### Task 5: Generate linked machine history

**Files:**
- Create: `apps/frontend/lib/demo-engineering/history.ts`
- Create: `apps/frontend/test/demo-engineering/history.test.ts`
- Modify: `apps/frontend/lib/data/demo-provider.ts`

- [ ] **Step 1: Write the failing history consistency test**

```ts
it("creates forty ordered linked events over thirty days", () => {
  const events = createDemoHistory();
  expect(events).toHaveLength(40);
  expect(events.every((event, i) => i === 0 || event.timestamp <= events[i - 1].timestamp)).toBe(true);
  expect(new Set(events.map((event) => event.type))).toEqual(new Set([
    "telemetry-anomaly", "fault-prediction", "maintenance-action", "simulation-run", "chat-insight",
  ]));
  const session78 = events.filter((event) => event.metadata?.chainId === "machine-c-01-session-78");
  expect(session78.map((event) => event.type)).toEqual(expect.arrayContaining([
    "telemetry-anomaly", "fault-prediction", "chat-insight", "simulation-run", "maintenance-action",
  ]));
});
```

- [ ] **Step 2: Run and verify failure**

Run: `cd apps/frontend && npm run test:unit -- test/demo-engineering/history.test.ts`

Expected: FAIL because `createDemoHistory` is missing.

- [ ] **Step 3: Implement five traceable event chains plus background events**

Use shared asset/session values in titles and descriptions. Give related events `metadata.chainId`, session ID, measurement, threshold, probability, or recommendation IDs as applicable. Return newest-first order and clone metadata before returning it.

- [ ] **Step 4: Delegate and preserve all existing query filters**

`listHistoryEvents()` must apply `machineId`, `machineIds`, `type`, `dateFrom`, and `dateTo`, not only the three filters currently handled by the demo provider.

- [ ] **Step 5: Run tests and commit**

Run: `cd apps/frontend && npm run test:unit -- test/demo-engineering/history.test.ts test/demo-provider.test.ts`

Expected: PASS.

```powershell
git add apps/frontend/lib/demo-engineering/history.ts apps/frontend/lib/data/demo-provider.ts apps/frontend/test/demo-engineering/history.test.ts
git commit -m "feat: add linked demo maintenance history"
```

### Task 6: Return automatic rich Assistant responses

**Files:**
- Create: `apps/frontend/lib/demo-engineering/chat.ts`
- Create: `apps/frontend/test/demo-engineering/chat.test.ts`
- Modify: `apps/frontend/lib/data/demo-provider.ts`
- Modify: `apps/frontend/components/chat/chat-workspace.tsx`

- [ ] **Step 1: Write failing response-selection tests**

```ts
it.each([
  ["Plot session 78 telemetry", "chart"],
  ["Show latest Packaging Drive 01 values as a table", "table"],
  ["Predict failure for Process Pump 02", "status-card"],
  ["Simulate Packaging Drive 01 for 60 minutes", "comparison"],
])("maps %s to a %s response", (prompt, blockType) => {
  const response = composeDemoAssistantResponse({ prompt, threadId: "t1" });
  expect(response.contentBlocks.map((block) => block.type)).toContain(blockType);
  expect(response.agentTrace.length).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `cd apps/frontend && npm run test:unit -- test/demo-engineering/chat.test.ts`

Expected: FAIL because the composer does not exist.

- [ ] **Step 3: Implement deterministic intent and entity resolution**

Resolve explicit `queryMode` first, then prompt terms; resolve machine ID/name and session number; compose existing `ChatContentBlock` variants. Telemetry replies include engineering interpretation plus table or chart, prediction replies include a status card and breached-field table, simulation replies include baseline/scenario comparison and forecast chart, and fleet queries include a sorted table. Unsupported replies must include the exact working suggestions.

- [ ] **Step 4: Replace inline scripted chat logic in the provider**

Pass `text`, `queryMode`, and `machineId` to the composer. Keep thread storage behavior unchanged and use honest tool names: `query_telemetry`, `score_demo_prediction`, `run_demo_simulation`, and `compose_response`.

- [ ] **Step 5: Publish capability-accurate prompt suggestions**

Set new-thread prompts to:

```ts
[
  "Plot session 78 telemetry",
  "Show latest Packaging Drive 01 values as a table",
  "Compare fleet risk",
  "Predict failure for Process Pump 02",
  "Simulate Packaging Drive 01 for 60 minutes",
]
```

Add one line above suggestions in demo mode: `Try a suggested prompt to see telemetry tables, charts, prediction, or simulation.` Do not show this production-specific guidance when the active provider is FastAPI.

- [ ] **Step 6: Run tests and commit**

Run: `cd apps/frontend && npm run test:unit -- test/demo-engineering/chat.test.ts test/demo-provider.test.ts`

Expected: PASS.

```powershell
git add apps/frontend/lib/demo-engineering/chat.ts apps/frontend/lib/data/demo-provider.ts apps/frontend/components/chat/chat-workspace.tsx apps/frontend/test/demo-engineering/chat.test.ts apps/frontend/test/demo-provider.test.ts
git commit -m "feat: add rich demo assistant responses"
```

### Task 7: Expose session provenance in the Simulator UI

**Files:**
- Modify: `apps/frontend/app/(protected)/simulator/page.tsx`
- Create: `apps/frontend/test/simulator-session-metadata.test.tsx`

- [ ] **Step 1: Extract and test a focused metadata component**

In the same page module initially, export `SimulationSessionMetadata`. Test it with session 78 and assert visible text for `Session 78`, collection range, `3 h 42 min`, `500 ms source cadence`, `12 day gap`, and `Observed client-derived fixture`.

- [ ] **Step 2: Run and verify failure**

Run: `cd apps/frontend && npm run test:unit -- test/simulator-session-metadata.test.tsx`

Expected: FAIL because the component is missing.

- [ ] **Step 3: Render metadata and provenance legend**

Replace “augmented session” wording with “client monitoring session.” Show optional metadata only when provided. Add legend labels `Observed/client-derived fixture` and `Synthetic forecast`, and preserve the current solid/dashed series behavior and forecast-boundary marker.

- [ ] **Step 4: Run tests and commit**

Run: `cd apps/frontend && npm run test:unit -- test/simulator-session-metadata.test.tsx test/simulation-resolver.test.ts`

Expected: PASS.

```powershell
git add 'apps/frontend/app/(protected)/simulator/page.tsx' apps/frontend/test/simulator-session-metadata.test.tsx
git commit -m "feat: show demo session provenance"
```

### Task 8: Document demo provenance accurately

**Files:**
- Modify: `README.md`
- Modify: nearest relevant `CONTEXT.md` if one is introduced or found during implementation

- [ ] **Step 1: Update hosted-demo and data-provenance sections**

State that private raw client readings remain excluded. Explain that sanitized client-derived session structure uses intermittent one-to-five-hour supervisor captures with multi-day gaps; public observed fixtures are deterministic and synthetic future continuation is separately labelled. Explain that rich Assistant blocks are scripted demonstrations of formats the production agent may select.

- [ ] **Step 2: Check README claims against code and repository privacy language**

Run: `rg -n "client|session|synthetic|Assistant|scripted|private raw" README.md apps/frontend/lib/demo-engineering`

Expected: README and code terminology agree; no claim says the hosted demo serves private raw readings.

- [ ] **Step 3: Commit documentation**

```powershell
git add README.md
git commit -m "docs: explain engineering demo provenance"
```

### Task 9: Add end-to-end coverage and complete verification

**Files:**
- Modify: `apps/frontend/e2e/demo-journey.spec.ts`
- Modify: tests from prior tasks only if verification finds a real defect

- [ ] **Step 1: Add three focused Playwright flows**

Add tests that enter the demo and: select `Plot session 78 telemetry` and see a chart plus tool trace; open Predict, select Process Pump 02, see five machine-specific inputs and a result; open Simulation, select session 78, see session metadata and observed/synthetic legend after running.

- [ ] **Step 2: Run the complete unit suite**

Run: `cd apps/frontend && npm run test:unit`

Expected: all Vitest tests pass.

- [ ] **Step 3: Run lint and production build**

Run: `cd apps/frontend && npm run lint && npm run build`

Expected: ESLint exits 0 and Next.js production build succeeds.

- [ ] **Step 4: Run Playwright**

Run: `cd apps/frontend && npm run test:e2e`

Expected: existing and new demo journeys pass.

- [ ] **Step 5: Inspect responsive pages in the browser**

Check Machines, History, Assistant, Predict, and Simulation at desktop and mobile widths. Confirm no clipped tables, blank charts, overlapping session metadata, misleading provenance, or inaccessible status-only colour encoding.

- [ ] **Step 6: Commit final test changes**

```powershell
git add apps/frontend/e2e/demo-journey.spec.ts
git commit -m "test: cover engineering demo journeys"
```

## Final Acceptance Checklist

- [ ] Ten demo machines share one registry and retain filtering/access behavior.
- [ ] Telemetry is deterministic, finite, ordered, and meaningfully non-uniform.
- [ ] Every machine has type-specific Predict inputs and explainable demo scoring.
- [ ] Sessions 10, 20, 78, and 100 represent intermittent captures, not fault labels.
- [ ] Observed/client-derived fixtures and synthetic forecasts are visibly distinct.
- [ ] History contains 40 coherent events with traceable chains.
- [ ] Suggested Assistant prompts reliably demonstrate tables, charts, prediction, and simulation.
- [ ] FastAPI provider and backend files are unchanged.
- [ ] README privacy and provenance claims match implementation.
- [ ] Unit tests, lint, build, and Playwright pass.
