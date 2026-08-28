/**
 * The registry the demo MLOps workspace works on.
 *
 * Every row is generated here, in the browser, from a seeded PRNG — there is no backend
 * and no client telemetry in this repository. Two of the three machines follow the
 * *published* generative rules of public datasets, so the relationships a model has to
 * find are real relationships rather than decoration: the AI4I failure modes genuinely
 * depend on products and differences of columns, which is what makes the calculated
 * feature editor worth its screen space.
 */

import type { DemoMachine, SampleRow } from "@/lib/demo-mlops/types";

/** mulberry32 — small, fast, and identical on every machine that loads this page. */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller, so the columns have a believable spread rather than a flat one. */
function gaussian(random: () => number, mean: number, deviation: number) {
  const u = Math.max(random(), 1e-9);
  const v = random();
  return mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function round(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function isoAt(startMs: number, index: number, stepSeconds: number) {
  return new Date(startMs + index * stepSeconds * 1000).toISOString();
}

// --- machine A: AI4I 2020 ----------------------------------------------------------

const AI4I_ROWS = 2000;

/**
 * The AI4I 2020 milling dataset, regenerated from the rules its authors published.
 *
 * Five failure modes, each a *condition on a combination of columns* rather than on any
 * single one. That is the entire point of keeping this machine in the demo: a model given
 * only the five raw columns has to rediscover those products, and a model given the
 * calculated columns does not.
 */
function buildAi4iRows(): SampleRow[] {
  const random = seededRandom(20200518);
  const start = Date.parse("2026-02-02T06:00:00.000Z");
  const rows: SampleRow[] = [];
  let toolWear = 0;
  let airTemperature = 300;

  for (let index = 0; index < AI4I_ROWS; index += 1) {
    const draw = random();
    const quality = draw < 0.5 ? "L" : draw < 0.8 ? "M" : "H";
    // A slow random walk, exactly as the published description frames it.
    airTemperature += gaussian(random, 0, 0.35);
    airTemperature = Math.min(304.5, Math.max(295.3, airTemperature));
    const processTemperature = airTemperature + 10 + gaussian(random, 0, 1);
    const torque = Math.max(3.8, gaussian(random, 40, 10));
    // Speed and torque trade off against each other, which is why the published power rule
    // fires on the low-torque tail and no raw column on its own separates it: the slope and
    // the residual spread here reproduce the correlation the real dataset carries.
    const rotationalSpeed = Math.min(
      2886,
      Math.max(1168, Math.round(1538 - 15.6 * (torque - 40) + gaussian(random, 0, 88))),
    );
    toolWear += quality === "L" ? 5 : quality === "M" ? 3 : 2;
    if (toolWear > 253) toolWear = Math.round(random() * 12);

    const powerWatts = torque * rotationalSpeed * ((2 * Math.PI) / 60);
    const temperatureDifference = processTemperature - airTemperature;
    const overstrain = toolWear * torque;
    const overstrainLimit = quality === "L" ? 11000 : quality === "M" ? 12000 : 13000;

    const toolWearFailure = toolWear >= 200 && toolWear <= 240 && random() < 0.04;
    const heatFailure = temperatureDifference < 8.6 && rotationalSpeed < 1380;
    const powerFailure = powerWatts < 3500 || powerWatts > 9000;
    const overstrainFailure = overstrain > overstrainLimit;
    const randomFailure = random() < 0.001;
    const failed =
      toolWearFailure || heatFailure || powerFailure || overstrainFailure || randomFailure;

    rows.push({
      timestamp: isoAt(start, index, 60),
      sessionId: `batch-${String(Math.floor(index / 250) + 1).padStart(2, "0")}`,
      values: {
        "Type": quality,
        "Air temperature [K]": round(airTemperature, 1),
        "Process temperature [K]": round(processTemperature, 1),
        "Rotational speed [rpm]": Math.round(rotationalSpeed),
        "Torque [Nm]": round(torque, 1),
        "Tool wear [min]": toolWear,
        "Machine failure": failed ? "failure" : "no failure",
      },
    });
  }
  return rows;
}

// --- machine B: multi-sensor utility pump -------------------------------------------

/**
 * A synthetic five-sensor pump. It exists to make the *forecasting* path real: readings
 * arrive on a fixed grid inside a session, and drift within a session rather than between
 * rows, so a chronological split and a persistence baseline both mean something.
 */
function buildPumpRows(): SampleRow[] {
  const random = seededRandom(778811);
  const start = Date.parse("2026-05-04T22:10:00.000Z");
  const rows: SampleRow[] = [];
  const sessions = 12;
  const perSession = 110;

  for (let session = 0; session < sessions; session += 1) {
    const wear = session / sessions;
    const sessionStart = start + session * 26 * 3600 * 1000;
    let vibration = 0.28 + wear * 0.22;
    let temperature = 46 + wear * 9;
    for (let index = 0; index < perSession; index += 1) {
      const phase = index / perSession;
      vibration += gaussian(random, 0.0016 * wear, 0.012);
      temperature += gaussian(random, 0.02 + 0.05 * wear, 0.16);
      const pressure = 6.4 - wear * 0.7 + Math.sin(phase * 6.1) * 0.18 + gaussian(random, 0, 0.05);
      const flow = 128 - wear * 12 + Math.cos(phase * 4.4) * 3.1 + gaussian(random, 0, 1.1);
      const power = 74 + wear * 11 + Math.sin(phase * 3.2) * 2.4 + gaussian(random, 0, 0.9);
      // A handful of genuinely absent readings, so "missing values" is not a hypothetical.
      const dropout = random() < 0.012;
      rows.push({
        timestamp: isoAt(sessionStart, index, 30),
        sessionId: `run-${String(session + 1).padStart(2, "0")}`,
        values: {
          vibration_rms_g: round(Math.max(0.05, vibration), 4),
          bearing_temp_c: round(temperature, 2),
          discharge_pressure_bar: dropout ? null : round(pressure, 3),
          flow_lpm: round(flow, 2),
          motor_power_kw: round(power, 2),
          condition: vibration > 0.62 || temperature > 62 ? "degraded" : "nominal",
        },
      });
    }
  }
  return rows;
}

// --- machine C: packaging drive (the machine that forced the generic schema) ---------

/**
 * A three-axis drive sampled twice a second, in short sessions with long gaps between
 * them. This is the shape that used to have its own bespoke pipeline; here it is just
 * another registry entry with a schema version, which is the whole point of the exercise.
 *
 * The signal is synthetic. No client readings are bundled with this demo.
 */
function buildDriveRows(): SampleRow[] {
  const random = seededRandom(4242);
  const start = Date.parse("2026-06-11T03:00:00.000Z");
  const rows: SampleRow[] = [];
  const sessions = 8;

  for (let session = 0; session < sessions; session += 1) {
    const perSession = 90 + Math.floor(random() * 40);
    const imbalance = session >= 5 ? 0.35 + (session - 5) * 0.16 : 0.06;
    const sessionStart = start + session * 4 * 24 * 3600 * 1000;
    for (let index = 0; index < perSession; index += 1) {
      const t = index * 0.5;
      const shaft = Math.sin(2 * Math.PI * 0.42 * t);
      rows.push({
        timestamp: isoAt(sessionStart, index, 0.5),
        sessionId: `session-${session + 1}`,
        values: {
          vibration_x_g: round(0.42 + imbalance * shaft + gaussian(random, 0, 0.05), 4),
          vibration_y_g: round(0.38 + imbalance * 0.7 * Math.cos(2 * Math.PI * 0.42 * t) + gaussian(random, 0, 0.05), 4),
          vibration_z_g: round(0.21 + imbalance * 0.3 * shaft + gaussian(random, 0, 0.03), 4),
          drive_temp_c: round(38 + session * 0.9 + index * 0.012 + gaussian(random, 0, 0.25), 2),
          line_speed_ppm: Math.round(112 - session * 1.4 + gaussian(random, 0, 2.2)),
          state: imbalance > 0.3 ? "imbalance suspected" : "nominal",
        },
      });
    }
  }
  return rows;
}

// --- the registry -------------------------------------------------------------------

export const DEMO_MACHINES: DemoMachine[] = [
  {
    id: "mach-ai4i-mill",
    name: "AI4I Milling Machine",
    description:
      "The AI4I 2020 benchmark, treated as a registered machine. Snapshot failure detection only — the dataset carries no usable time axis, so nothing here can be forecast.",
    capabilities: ["predict"],
    schemaVersion: 4,
    createdAt: "2026-02-02T06:00:00.000Z",
    timeColumn: "timestamp",
    sessionColumn: "session_id",
    features: [
      { name: "Type", unit: null, dtype: "string", note: "Quality variant L / M / H. Sets the overstrain limit." },
      { name: "Air temperature [K]", unit: "K", dtype: "float", note: "Random walk around 300 K." },
      { name: "Process temperature [K]", unit: "K", dtype: "float", note: "Air temperature plus about 10 K." },
      { name: "Rotational speed [rpm]", unit: "rpm", dtype: "integer", note: "Derived from a 2 860 W power draw." },
      { name: "Torque [Nm]", unit: "Nm", dtype: "float", note: "Normally distributed around 40 Nm." },
      { name: "Tool wear [min]", unit: "min", dtype: "integer", note: "Accumulates per part, faster on L stock." },
    ],
    target: {
      column: "Machine failure",
      taskType: "binary",
      classes: ["no failure", "failure"],
      positiveClass: "failure",
    },
    sources: [
      {
        id: "src-ai4i",
        label: "AI4I 2020 predictive maintenance dataset",
        kind: "public-dataset",
        origin: "UCI Machine Learning Repository · Matzka (2020)",
        licence: "CC BY 4.0 — public benchmark",
        rowCount: AI4I_ROWS,
        sessionCount: 8,
        connectedAt: "2026-02-02T06:12:00.000Z",
      },
    ],
    migrations: [
      { schemaVersion: 1, at: "2026-02-02", summary: "Loaded as a one-off notebook CSV with hard-coded column positions." },
      { schemaVersion: 2, at: "2026-03-15", summary: "Columns named and typed; quality variant kept as a category instead of an integer code." },
      { schemaVersion: 3, at: "2026-04-28", summary: "Target contract declared explicitly, so accuracy could be read against a class prior." },
      { schemaVersion: 4, at: "2026-06-09", summary: "Moved onto the shared machine schema: timestamp and session become metadata, never model inputs." },
    ],
    sampleRows: buildAi4iRows(),
    population: { rows: 10000, sessions: 40, span: "no real time axis — ordered by unique row id" },
  },
  {
    id: "mach-utility-pump",
    name: "Utility Pump 02",
    description:
      "A five-sensor process pump on a 30-second grid. Supports both goals: forecast the next readings, or detect a degraded condition from the current ones.",
    capabilities: ["simulate", "predict"],
    schemaVersion: 3,
    createdAt: "2026-05-04T22:10:00.000Z",
    timeColumn: "timestamp",
    sessionColumn: "session_id",
    features: [
      { name: "vibration_rms_g", unit: "g", dtype: "float", note: "Broadband RMS, rises with wear." },
      { name: "bearing_temp_c", unit: "°C", dtype: "float", note: "Drive-end bearing housing." },
      { name: "discharge_pressure_bar", unit: "bar", dtype: "float", note: "Has genuine dropouts — about 1 % of rows." },
      { name: "flow_lpm", unit: "L/min", dtype: "float", note: "Falls as the impeller wears." },
      { name: "motor_power_kw", unit: "kW", dtype: "float", note: "Rises to hold flow." },
    ],
    target: {
      column: "condition",
      taskType: "binary",
      classes: ["nominal", "degraded"],
      positiveClass: "degraded",
    },
    sources: [
      {
        id: "src-pump",
        label: "Synthetic multi-sensor pump telemetry",
        kind: "synthetic-fixture",
        origin: "Generated in-browser from a seeded PRNG",
        licence: "Demo fixture — free to reuse",
        rowCount: 12 * 110,
        sessionCount: 12,
        connectedAt: "2026-05-04T22:31:00.000Z",
      },
    ],
    migrations: [
      { schemaVersion: 1, at: "2026-05-04", summary: "Five columns, no units, no session identity." },
      { schemaVersion: 2, at: "2026-05-21", summary: "Units attached and a session column introduced, so windows stop crossing runs." },
      { schemaVersion: 3, at: "2026-06-09", summary: "Registered against the shared schema; both goals declared on one machine." },
    ],
    sampleRows: buildPumpRows(),
    population: { rows: 1320, sessions: 12, span: "2026-05-04 → 2026-05-17" },
  },
  {
    id: "mach-packaging-drive",
    name: "Packaging Drive 01",
    description:
      "Three vibration axes and a drive temperature at 500 ms, in short sessions days apart. The machine profile that made the generic schema necessary.",
    capabilities: ["simulate", "predict"],
    schemaVersion: 5,
    createdAt: "2026-06-11T03:00:00.000Z",
    timeColumn: "timestamp",
    sessionColumn: "session_id",
    features: [
      { name: "vibration_x_g", unit: "g", dtype: "float", note: "Radial, horizontal." },
      { name: "vibration_y_g", unit: "g", dtype: "float", note: "Radial, vertical." },
      { name: "vibration_z_g", unit: "g", dtype: "float", note: "Axial." },
      { name: "drive_temp_c", unit: "°C", dtype: "float", note: "Drifts upward within a session." },
      { name: "line_speed_ppm", unit: "packs/min", dtype: "integer", note: "Operating condition, not a fault signal." },
    ],
    target: {
      column: "state",
      taskType: "binary",
      classes: ["nominal", "imbalance suspected"],
      positiveClass: "imbalance suspected",
    },
    sources: [
      {
        id: "src-drive",
        label: "Synthetic three-axis drive fixture",
        kind: "synthetic-fixture",
        origin: "Generated in-browser from a seeded PRNG",
        licence: "Demo fixture — free to reuse",
        rowCount: 908,
        sessionCount: 8,
        connectedAt: "2026-06-11T03:20:00.000Z",
      },
    ],
    migrations: [
      {
        schemaVersion: 1,
        at: "2026-03-02",
        summary: "Bespoke pipeline: column order fixed in code, window length fixed in code, one model path only.",
      },
      {
        schemaVersion: 2,
        at: "2026-04-19",
        summary: "Scalers and feature lists lifted out of the training script into saved artifacts.",
      },
      {
        schemaVersion: 3,
        at: "2026-05-10",
        summary: "Session boundaries made explicit so a window can never span the multi-day gap between runs.",
      },
      {
        schemaVersion: 4,
        at: "2026-06-11",
        summary: "Rewritten as a registry entry: named, typed, versioned columns instead of positional ones.",
      },
      {
        schemaVersion: 5,
        at: "2026-07-02",
        summary: "Both goals declared on the same schema, so the drive trains through the same four stages as every other machine.",
      },
    ],
    sampleRows: buildDriveRows(),
    population: { rows: 908, sessions: 8, span: "2026-06-11 → 2026-07-09" },
  },
];

export function findMachine(machineId: string | null): DemoMachine | null {
  return DEMO_MACHINES.find((machine) => machine.id === machineId) ?? null;
}

export const CAPABILITY_LABEL: Record<"simulate" | "predict", string> = {
  simulate: "Forecast Sensor Values",
  predict: "Detect Possible Failure",
};
