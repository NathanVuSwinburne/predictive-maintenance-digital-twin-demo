import type {
  CanonicalMachine,
  EntityCapability,
  EntityDetail,
  EntityFeature,
  EntityInferenceResult,
  EntitySummary,
  EntityTelemetryRecord,
  GenericSimulationResult,
  InformationProvenance,
  JsonValue,
  ModelReadiness,
  SimulatorEntityModel,
  SimulatorEntityOption,
  TelemetryPoint,
  TelemetrySeries,
} from "@/lib/domain/types";
import { getSimulationSchemaForMachineType } from "@/lib/simulation/schemas";
import { DEMO_ASSETS, getDemoAsset } from "./assets";
import { isLiveDemoMachine, liveLevelAt, liveSampleAt, LIVE_FEATURE_UNITS } from "./live";
import { scorePrediction } from "./prediction";
import type { DemoAssetProfile } from "./types";

/**
 * The production app moved from fixed legacy machines to a registry of "entities"
 * (canonical machines with declared feature schemas, readiness and promoted models).
 * This module projects the ten fictional demo assets onto that shape, deterministically.
 *
 * - AI4I presses and spindles (machine-a-*) keep the legacy manual-prediction path.
 * - Pumps and the fan (machine-b-*) are registry machines with promoted generic
 *   prediction and forecasting models.
 * - Drives and the conveyor motor (machine-c-*) stream a CMTK-style live feed and carry
 *   both the generic models and the legacy session simulator.
 */

const OFFLINE_SILENCE_SECONDS = 3 * 3600 + 17 * 60;
const SENSOR_CADENCE_SECONDS = 30;
const round = (value: number, places = 3) => Number(value.toFixed(places));

function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}
const noise = (key: string) => hash(key) / 4294967296 - 0.5;

export function capabilitiesOf(asset: DemoAssetProfile): EntityCapability[] {
  return asset.machineType === "real-sensor" ? ["predict", "simulate"] : ["predict"];
}

export function hasGenericModels(asset: DemoAssetProfile) {
  return asset.machineType !== "ai4i";
}

export function canForecast(asset: DemoAssetProfile) {
  return asset.machineType !== "ai4i" && asset.status !== "offline";
}

function featureSchema(asset: DemoAssetProfile): EntityFeature[] {
  if (asset.machineType === "real-sensor") {
    return ["VibrationX", "VibrationY", "VibrationZ", "Temperature"].map((name, index) => ({
      id: `${asset.id}-feature-${index}`,
      name,
      unit: LIVE_FEATURE_UNITS[name],
      dtype: "float",
      required: true,
      schemaVersionAdded: index < 3 ? 1 : 2,
    }));
  }
  const features: EntityFeature[] = asset.sensors.map((sensor, index) => ({
    id: `${asset.id}-feature-${index}`,
    name: sensor.key,
    unit: sensor.unit,
    dtype: "float",
    required: true,
    schemaVersionAdded: 1,
  }));
  if (asset.machineType === "ai4i") {
    features.push({ id: `${asset.id}-feature-type`, name: "productType", unit: null, dtype: "string", required: true, schemaVersionAdded: 1 });
  }
  return features;
}

function schemaVersionOf(asset: DemoAssetProfile) {
  return asset.machineType === "real-sensor" ? 2 : 1;
}

export function entitySummary(asset: DemoAssetProfile): EntitySummary {
  return {
    id: asset.id,
    name: asset.name,
    description: `${asset.model} on ${asset.line}. Fictional demo machine.`,
    imageUrl: null,
    capabilities: capabilitiesOf(asset),
    schemaVersion: schemaVersionOf(asset),
    createdAt: "2026-06-28T08:00:00.000Z",
  };
}

export function entityDetail(machineId: string): EntityDetail {
  const asset = getDemoAsset(machineId);
  return { ...entitySummary(asset), features: featureSchema(asset) };
}

/** A smooth reading for the non-live sensor machines at an absolute second. */
function sensorSampleAt(asset: DemoAssetProfile, second: number): Record<string, number> {
  const load = 0.5 + 0.35 * Math.sin((2 * Math.PI * second) / 5400 + asset.phase);
  return Object.fromEntries(asset.sensors.map((sensor) => {
    const span = sensor.max - sensor.min;
    const riskLift = (asset.riskScore / 100) * (sensor.warningHigh - sensor.typical) * 0.9;
    const value = sensor.typical + riskLift * load + span * 0.04 * Math.sin((2 * Math.PI * second) / 900 + asset.phase) + span * 0.02 * noise(`${asset.id}:${sensor.key}:${second}`);
    return [sensor.key, round(Math.min(sensor.max, Math.max(sensor.min, value)), 2)];
  }));
}

export function readingAt(machineId: string, second: number): Record<string, number> {
  return isLiveDemoMachine(machineId) ? liveSampleAt(machineId, second) : sensorSampleAt(getDemoAsset(machineId), second);
}

function cadenceOf(asset: DemoAssetProfile) {
  return asset.machineType === "real-sensor" ? 1 : SENSOR_CADENCE_SECONDS;
}

/** Where a machine's stored readings end: now for streaming machines, earlier for one that went quiet. */
function latestSecondOf(asset: DemoAssetProfile, nowMs: number) {
  const now = Math.floor(nowMs / 1000) - 1;
  const cadence = cadenceOf(asset);
  const end = asset.status === "offline" ? now - OFFLINE_SILENCE_SECONDS : now;
  return Math.floor(end / cadence) * cadence;
}

function sessionLengthSeconds(asset: DemoAssetProfile) {
  return asset.machineType === "real-sensor" ? 8 * 3600 : 24 * 3600;
}

function sessionPrefix(asset: DemoAssetProfile) {
  return asset.machineType === "real-sensor"
    ? { "machine-c-01": "pd01-shift", "machine-c-02": "pd02-shift", "machine-c-03": "cm03-shift" }[asset.id] ?? `${asset.id}-shift`
    : `${asset.id}-day`;
}

export function sessionIdsOf(machineId: string, nowMs: number, count = 3): string[] {
  const asset = getDemoAsset(machineId);
  const length = sessionLengthSeconds(asset);
  const latest = Math.floor(latestSecondOf(asset, nowMs) / length);
  return Array.from({ length: count }, (_, index) => `${sessionPrefix(asset)}-${latest - index}`);
}

function sessionBounds(asset: DemoAssetProfile, sessionId: string, nowMs: number) {
  const length = sessionLengthSeconds(asset);
  const index = Number(sessionId.split("-").at(-1));
  const start = index * length;
  const end = Math.min(start + length - cadenceOf(asset), latestSecondOf(asset, nowMs));
  return { start, end };
}

function demoProvenance(source: "historical-machine-data" | "live-machine-data", label: string, reference: string, detail: string): InformationProvenance {
  return { outputSources: [source], basisSources: [], evidence: [{ source, label, reference, detail }] };
}

export function listEntityTelemetry(machineId: string, nowMs: number, input: { sessionId?: string; limit?: number } = {}): EntityTelemetryRecord[] {
  const asset = getDemoAsset(machineId);
  const cadence = cadenceOf(asset);
  const sessionId = input.sessionId ?? sessionIdsOf(machineId, nowMs, 1)[0];
  const { start, end } = sessionBounds(asset, sessionId, nowMs);
  const limit = Math.max(1, Math.min(500, input.limit ?? 100));
  const count = Math.max(0, Math.min(limit, Math.floor((end - start) / cadence) + 1));
  return Array.from({ length: count }, (_, index) => {
    const second = end - (count - 1 - index) * cadence;
    return {
      id: `${machineId}-${second}`,
      timestamp: new Date(second * 1000).toISOString(),
      sessionId,
      schemaVersion: schemaVersionOf(asset),
      payload: readingAt(machineId, second) as Record<string, JsonValue>,
      provenance: demoProvenance(isLiveDemoMachine(machineId) ? "live-machine-data" : "historical-machine-data", `${asset.name} demo readings`, `${machineId}/${sessionId}`, "Deterministic synthetic readings"),
    };
  });
}

/** The legacy four-metric chart series, rolling with the clock so polling sees new samples. */
export function telemetrySeries(machineId: string, nowMs: number, limit = 120): TelemetrySeries {
  const asset = getDemoAsset(machineId);
  const latest = asset.status === "offline"
    ? latestSecondOf(asset, nowMs)
    : Math.floor((Math.floor(nowMs / 1000) - 1) / 5) * 5;
  const count = Math.max(1, Math.min(288, limit));
  const points: TelemetryPoint[] = Array.from({ length: count }, (_, index) => {
    const second = latest - (count - 1 - index) * 30;
    const reading = readingAt(machineId, second);
    const timestamp = new Date(second * 1000).toISOString();
    if (asset.machineType === "real-sensor") {
      const magnitude = Math.sqrt(reading.VibrationX ** 2 + reading.VibrationY ** 2 + reading.VibrationZ ** 2);
      return { timestamp, temperature: reading.Temperature, vibration: round(magnitude), pressure: 0, power: 0 };
    }
    if (asset.machineType === "ai4i") {
      return { timestamp, temperature: reading.airTempK, vibration: reading.torque, pressure: reading.processTempK, power: reading.rotationalSpeed };
    }
    return { timestamp, temperature: reading.temperature, vibration: reading.vibration, pressure: reading.pressure, power: reading.power };
  });
  return {
    points,
    provenance: demoProvenance(
      isLiveDemoMachine(machineId) ? "live-machine-data" : "historical-machine-data",
      `${asset.name} demo telemetry`,
      machineId,
      asset.status === "offline" ? "The demo source for this machine stopped reporting." : "Deterministic synthetic readings that advance with the clock",
    ),
  };
}

function modelVersions(asset: DemoAssetProfile): Partial<Record<EntityCapability, { modelName: string; modelVersion: string }>> {
  if (!hasGenericModels(asset)) return {};
  const versions: Partial<Record<EntityCapability, { modelName: string; modelVersion: string }>> = {
    predict: { modelName: asset.machineType === "real-sensor" ? `${asset.id}-vibration-level` : `${asset.id}-failure-risk`, modelVersion: "3" },
  };
  if (canForecast(asset)) versions.simulate = { modelName: `${asset.id}-forecaster`, modelVersion: "2" };
  return versions;
}

export function canonicalMachine(machineId: string, nowMs: number): CanonicalMachine {
  const asset = getDemoAsset(machineId);
  const sessions = sessionIdsOf(machineId, nowMs, 3);
  const latest = latestSecondOf(asset, nowMs);
  const cadence = cadenceOf(asset);
  return {
    id: asset.id,
    name: asset.name,
    line: asset.line,
    model: asset.model,
    machineType: asset.machineType,
    simulationSchema: getSimulationSchemaForMachineType(asset.machineType),
    status: asset.status,
    healthScore: asset.healthScore,
    riskScore: asset.riskScore,
    lastServiceDate: asset.lastServiceDate,
    nextServiceDate: asset.nextServiceDate,
    uptimePercent: asset.uptimePercent,
    location: asset.location,
    operatingHours: asset.operatingHours,
    primaryFailureModes: asset.failureModes,
    notes: asset.notes,
    legacyMachineId: asset.id,
    description: entitySummary(asset).description,
    imageUrl: null,
    capabilities: capabilitiesOf(asset),
    schemaVersion: schemaVersionOf(asset),
    accessRole: "admin",
    telemetry: {
      rows: Math.round((sessionLengthSeconds(asset) / cadence) * sessions.length * 0.9),
      sessions: sessions.length,
      latestTimestamp: new Date(latest * 1000).toISOString(),
    },
    readiness: {},
    productionModels: modelVersions(asset),
    legacyCompatible: true,
  };
}

export function simulatorEntityModels(): SimulatorEntityModel[] {
  return DEMO_ASSETS.filter(hasGenericModels).map((asset) => {
    const versions = modelVersions(asset);
    const objectives = Object.keys(versions) as EntityCapability[];
    const inputs = featureSchema(asset).map((feature) => feature.name);
    return {
      entityId: asset.id,
      machineName: asset.name,
      imageUrl: null,
      objectives,
      currentVersions: Object.fromEntries(objectives.map((objective) => [objective, versions[objective]!.modelVersion])),
      inputFeatures: Object.fromEntries(objectives.map((objective) => [objective, inputs])),
    };
  });
}

export function simulatorEntities(nowMs: number): SimulatorEntityOption[] {
  return DEMO_ASSETS.filter(hasGenericModels).map((asset) => {
    const eligible = canForecast(asset);
    const features = featureSchema(asset);
    const versions = modelVersions(asset);
    const required = asset.machineType === "real-sensor" ? 30 : 20;
    return {
      entityId: asset.id,
      machineName: asset.name,
      imageUrl: null,
      schemaVersion: schemaVersionOf(asset),
      eligible,
      reasonCodes: eligible ? [] : ["NO_PRODUCTION_SIMULATE_MODEL"],
      readiness: { availableContextRows: eligible ? 480 : 0, requiredContextRows: required },
      inputFeatures: features.map(({ name, unit, dtype, required: isRequired }) => ({ name, unit, dtype, required: isRequired })),
      outputFeatures: features.map((feature) => feature.name),
      sessionIds: sessionIdsOf(asset.id, nowMs, 3),
      productionModel: versions.simulate
        ? { modelName: versions.simulate.modelName, modelVersion: versions.simulate.modelVersion, runId: `demo-run-${asset.id}-simulate`, promotedAt: "2026-10-02T03:00:00.000Z", inputContract: { features: features.map((feature) => feature.name), contextRows: required }, outputContract: { features: features.map((feature) => feature.name), cadenceSeconds: cadenceOf(asset) * 30 } }
        : null,
      horizonMin: 30,
      horizonMax: 240,
      uncertaintySupported: true,
    };
  });
}

function levelProbabilities(magnitude: number): Record<string, number> {
  // Softly separated bands around the gateway's own level thresholds.
  const centres = { low: 1.6, medium: 3.4, high: 5.2 };
  const weights = Object.fromEntries(Object.entries(centres).map(([label, centre]) => [label, Math.exp(-((magnitude - centre) ** 2) / 1.1)]));
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(Object.entries(weights).map(([label, value]) => [label, round(value / total, 3)]));
}

export function runEntityInference(
  machineId: string,
  capability: EntityCapability,
  nowMs: number,
  input: { sessionId?: string; limit?: number; values?: Record<string, unknown> } = {},
): EntityInferenceResult {
  const asset = getDemoAsset(machineId);
  const versions = modelVersions(asset);
  const model = versions[capability];
  if (!model) throw new Error(`${asset.name} has no active ${capability} model in the demo.`);
  const records = listEntityTelemetry(machineId, nowMs, { sessionId: input.sessionId, limit: input.limit ?? 30 });
  const latest = records.at(-1);
  const base = (latest?.payload ?? {}) as Record<string, number>;
  const overrides = Object.entries(input.values ?? {}).filter(([key, value]) => key in base && typeof value === "number" && value !== base[key]);
  const values: Record<string, number> = { ...base, ...Object.fromEntries(overrides) } as Record<string, number>;
  let predictedLabel: string | null = null;
  let probabilities: Record<string, number> = {};
  let forecast: Record<string, number> = {};
  let estimatedDowntimeHours: number | null = null;

  if (capability === "predict") {
    if (asset.machineType === "real-sensor") {
      const magnitude = Math.sqrt((values.VibrationX ?? 0) ** 2 + (values.VibrationY ?? 0) ** 2 + (values.VibrationZ ?? 0) ** 2);
      probabilities = overrides.length ? levelProbabilities(magnitude) : (() => {
        const level = liveLevelAt(machineId, Math.floor(nowMs / 1000) - 1);
        const fitted = levelProbabilities(magnitude);
        return fitted[level] >= 0.5 ? fitted : { ...levelProbabilities({ low: 1.6, medium: 3.4, high: 5.2 }[level]) };
      })();
      predictedLabel = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];
    } else {
      const score = scorePrediction(machineId, values);
      probabilities = { normal: round(1 - score.failureProbability), failure: round(score.failureProbability) };
      predictedLabel = score.failureProbability >= 0.5 ? "failure" : "normal";
      estimatedDowntimeHours = round(score.failureProbability * 3, 1);
    }
  } else {
    const second = Math.floor(Date.parse(latest?.timestamp ?? new Date(nowMs).toISOString()) / 1000) + cadenceOf(asset);
    forecast = readingAt(machineId, second);
  }

  return {
    id: `demo-inference-${machineId}-${capability}-${Math.floor(nowMs / 1000)}`,
    entityId: machineId,
    capability,
    sessionId: latest?.sessionId ?? "",
    modelName: model.modelName,
    modelVersion: model.modelVersion,
    mlflowRunId: `demo-run-${machineId}-${capability}`,
    schemaVersion: schemaVersionOf(asset),
    inputRows: records.length,
    inputFeatures: featureSchema(asset).map((feature) => feature.name),
    inputValues: values,
    overriddenFeatures: overrides.map(([key]) => key),
    generatedAt: new Date(nowMs).toISOString(),
    predictedLabel,
    probabilities,
    forecast,
    estimatedDowntimeHours,
    uncertainty: {},
    rawOutputs: { demo: true },
    provenance: {
      outputSources: [capability === "predict" ? "ml-prediction" : "simulated-data"],
      basisSources: [isLiveDemoMachine(machineId) ? "live-machine-data" : "historical-machine-data"],
      evidence: [{ source: capability === "predict" ? "ml-prediction" : "simulated-data", label: `${model.modelName} v${model.modelVersion}`, reference: `demo-run-${machineId}-${capability}`, detail: "Deterministic demo model; not production inference" }],
    },
  };
}

export function runGenericSimulation(
  machineId: string,
  nowMs: number,
  input: { sessionId?: string; durationMinutes: 30 | 60 | 240 },
): GenericSimulationResult {
  const asset = getDemoAsset(machineId);
  const model = modelVersions(asset).simulate;
  if (!model) throw new Error(`${asset.name} has no active forecasting model in the demo.`);
  const records = listEntityTelemetry(machineId, nowMs, { sessionId: input.sessionId, limit: 30 });
  const startSecond = Math.floor(Date.parse(records.at(-1)?.timestamp ?? new Date(nowMs).toISOString()) / 1000);
  const cadence = asset.machineType === "real-sensor" ? 30 : 60;
  const steps = Math.floor((input.durationMinutes * 60) / cadence);
  const timestamps: string[] = [];
  const forecasts: Array<Record<string, number>> = [];
  for (let step = 1; step <= steps; step += 1) {
    const second = startSecond + step * cadence;
    timestamps.push(new Date(second * 1000).toISOString());
    // The forecaster returns the smooth component; it cannot know the noise.
    const a = readingAt(machineId, second);
    const b = readingAt(machineId, second + 1);
    forecasts.push(Object.fromEntries(Object.keys(a).map((key) => [key, round((a[key] + b[key]) / 2)])));
  }
  const features = Object.keys(forecasts[0] ?? {});
  return {
    id: `demo-generic-sim-${machineId}-${startSecond}-${input.durationMinutes}`,
    entityId: machineId,
    sessionId: records.at(-1)?.sessionId ?? input.sessionId ?? null,
    sourceTimeRange: records.length ? { start: records[0].timestamp, end: records.at(-1)!.timestamp } : null,
    schemaVersion: schemaVersionOf(asset),
    createdAt: new Date(nowMs).toISOString(),
    modelName: model.modelName,
    modelVersion: model.modelVersion,
    mlflowRunId: `demo-run-${machineId}-simulate`,
    durationMinutes: input.durationMinutes,
    horizonSteps: steps,
    forecastCadenceSeconds: cadence,
    forecastTimestamps: timestamps,
    inputFeatures: features,
    forecasts,
    uncertainty: Object.fromEntries(features.map((feature) => [feature, { interval: "p10–p90", widensWithHorizon: true }])),
    warnings: ["Demo forecast: generated in the browser from deterministic synthetic readings, not by a trained model."],
    provenance: {
      outputSources: ["simulated-data"],
      basisSources: [isLiveDemoMachine(machineId) ? "live-machine-data" : "historical-machine-data"],
      evidence: [{ source: "simulated-data", label: `${model.modelName} v${model.modelVersion}`, reference: `demo-run-${machineId}-simulate`, detail: "Deterministic demo forecast" }],
    },
  };
}

export function modelReadiness(machineId: string, nowMs: number): ModelReadiness {
  const asset = getDemoAsset(machineId);
  const evaluatedAt = new Date(nowMs).toISOString();
  const latest = new Date(latestSecondOf(asset, nowMs) * 1000).toISOString();
  const required = asset.machineType === "real-sensor" ? 30 : 20;
  const sensors = featureSchema(asset).filter((feature) => feature.dtype !== "string").map((feature) => ({
    name: feature.name,
    label: feature.name,
    unit: feature.unit ?? null,
    status: "receiving" as const,
    validRows: required,
    requiredRows: required,
    detail: "Receiving valid readings.",
  }));
  if (asset.status === "offline") {
    return {
      machineId, profileId: `${asset.machineType}-profile`, state: "stale", canInfer: false,
      summary: "Readings have stopped",
      reason: "The newest reading is more than three hours old, so the model would be scoring an old window.",
      nextAction: "Check the machine's gateway. Predictions resume once fresh readings arrive.",
      evaluatedAt, latestSampleAt: latest,
      progress: { observedRows: required, requiredRows: required, percent: 100, observedDurationSeconds: required * 30, requiredDurationSeconds: required * 30, estimatedRemainingSeconds: null },
      sensors: sensors.map((sensor) => ({ ...sensor, status: "missing" as const, validRows: 0, detail: "No recent readings." })),
      checks: {
        windowLength: { status: "pass", label: "Window length", detail: `${required} readings in the last window.` },
        cadence: { status: "pass", label: "Reading cadence", detail: "Readings arrived on schedule before the gateway stopped." },
        freshness: { status: "fail", label: "Freshness", detail: "The newest reading is more than three hours old." },
      },
    };
  }
  const cadenceSeconds = cadenceOf(asset);
  return {
    machineId, profileId: `${asset.machineType}-profile`, state: "ready", canInfer: true,
    summary: "Ready for predictions",
    reason: asset.machineType === "ai4i"
      ? "The AI4I model scores the operating values you enter; it does not need a stream."
      : `The last ${required} readings are complete and current.`,
    nextAction: "Open the simulator to check the current risk or try a scenario.",
    evaluatedAt, latestSampleAt: latest,
    progress: { observedRows: required, requiredRows: required, percent: 100, observedDurationSeconds: required * cadenceSeconds, requiredDurationSeconds: required * cadenceSeconds, estimatedRemainingSeconds: 0 },
    sensors,
    checks: asset.machineType === "ai4i" ? null : {
      windowLength: { status: "pass", label: "Window length", detail: `${required} of ${required} readings.` },
      cadence: { status: "pass", label: "Reading cadence", detail: `One reading every ${cadenceSeconds} s, as expected.` },
      freshness: { status: "pass", label: "Freshness", detail: "The newest reading is a few seconds old." },
    },
  };
}
