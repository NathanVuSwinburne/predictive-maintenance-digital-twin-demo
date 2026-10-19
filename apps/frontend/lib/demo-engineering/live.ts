import type {
  CmtkSetup,
  EngineeringVibrationProfile,
  EntityLiveHealth,
  EntityLiveHorizon,
  EntityLiveLabelSpan,
  EntityLiveObservation,
  EntityLiveSource,
  EntityLiveState,
  EntityLiveStatus,
  EntityVibrationThresholds,
  FleetLiveHealth,
  LiveForecastSummary,
  LiveInferenceSummary,
  MqttHealth,
  MqttSubscription,
  VibrationBaselineValue,
} from "@/lib/domain/types";
import { DEMO_ASSETS, getDemoAsset } from "./assets";

/**
 * A deterministic stand-in for the production MQTT/CMTK live path.
 *
 * Production receives a 3-axis vibration payload from a CMTK gateway over MQTT and
 * runs the promoted models on it as it arrives. Here every reading is a pure function
 * of (machine, time), so the feed moves with the clock, two polls agree on the past,
 * and nothing is stored. No broker is contacted and no client data is involved.
 */

export const LIVE_FRESHNESS_SECONDS = 15;
export const LIVE_CADENCE_SECONDS = 1;
export const LIVE_FEATURES = ["VibrationX", "VibrationY", "VibrationZ", "Temperature"] as const;
export const LIVE_FEATURE_UNITS: Record<string, string | null> = {
  VibrationX: "mm/s",
  VibrationY: "mm/s",
  VibrationZ: "mm/s",
  Temperature: "°C",
};
export const DEMO_BROKER = "replay.demo.invalid:8883";
export const DEMO_TOPIC = "demo/cmtk/+/telemetry";

type LiveProfile = {
  /** Mean velocity RMS on each axis, mm/s. */
  base: [number, number, number];
  /** How far the slow operating cycle lifts the vibration, as a fraction. */
  swing: number;
  /** Seconds per operating cycle; levels change on this timescale. */
  cycleSeconds: number;
  temperature: number;
  sessionPrefix: string;
  sourceName: string;
};

const LIVE_PROFILES: Record<string, LiveProfile> = {
  "machine-c-01": { base: [2.55, 2.1, 2.85], swing: 0.5, cycleSeconds: 1800, temperature: 61, sessionPrefix: "pd01-shift", sourceName: "Demo CMTK gateway · drive 01" },
  "machine-c-02": { base: [1.6, 1.35, 1.8], swing: 0.4, cycleSeconds: 2400, temperature: 54, sessionPrefix: "pd02-shift", sourceName: "Demo CMTK gateway · drive 02" },
  "machine-c-03": { base: [0.72, 0.6, 0.84], swing: 0.3, cycleSeconds: 3000, temperature: 47, sessionPrefix: "cm03-shift", sourceName: "Demo CMTK gateway · motor 03" },
};

/** Cooling Fan 03 has a configured source that stopped sending: the honest "disconnected" case. */
const DISCONNECTED_SOURCES: Record<string, { name: string; silentForSeconds: number }> = {
  "machine-b-03": { name: "Demo fan gateway", silentForSeconds: 3 * 3600 + 17 * 60 },
};

/** Velocity RMS magnitude bands the demo gateway reports as its own low/medium/high mode. */
const LEVEL_BANDS = { medium: 2.6, high: 4.3 };

export function isLiveDemoMachine(machineId: string) {
  return machineId in LIVE_PROFILES;
}

export function liveDemoMachineIds() {
  return Object.keys(LIVE_PROFILES);
}

function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

/** Uniform in [-0.5, 0.5), fixed for a given key. */
function noise(key: string) {
  return hash(key) / 4294967296 - 0.5;
}

const round = (value: number, places = 3) => Number(value.toFixed(places));

function profileOf(machineId: string) {
  const profile = LIVE_PROFILES[machineId];
  if (!profile) throw new Error(`No live feed for demo machine: ${machineId}`);
  return profile;
}

function phaseOf(machineId: string) {
  return getDemoAsset(machineId).phase;
}

/** The smooth part of the signal: what a forecaster could reasonably learn. */
function trend(machineId: string, second: number, outlook = false) {
  const profile = profileOf(machineId);
  const phase = phaseOf(machineId);
  const cycle = Math.sin((2 * Math.PI * second) / profile.cycleSeconds + phase);
  // Short per-axis wobbles make the 3D cloud a cloud rather than a line. A one-hour outlook
  // at 30 s steps cannot resolve them (they would alias into a fake oscillation), so it omits them.
  const wobble = (period: number, offset: number) => (outlook ? 0 : Math.sin((2 * Math.PI * second) / period + phase * offset));
  const lift = 1 + profile.swing * cycle;
  const [bx, by, bz] = profile.base;
  return {
    VibrationX: bx * lift * (1 + 0.1 * wobble(47, 2)),
    VibrationY: by * (1 + profile.swing * 0.8 * cycle) * (1 + 0.12 * wobble(83, 3)),
    VibrationZ: bz * lift * (1 + 0.1 * wobble(59, 5)),
    Temperature: profile.temperature + 4.5 * Math.sin((2 * Math.PI * second) / (profile.cycleSeconds * 3) + phase) + 1.8 * cycle,
  };
}

/** One reading at an absolute second. Identical every time it is asked for. */
export function liveSampleAt(machineId: string, second: number): Record<string, number> {
  const smooth = trend(machineId, second);
  const key = `${machineId}:${second}`;
  return {
    VibrationX: round(Math.max(0.05, smooth.VibrationX * (1 + 0.22 * noise(`${key}:x`)))),
    VibrationY: round(Math.max(0.05, smooth.VibrationY * (1 + 0.22 * noise(`${key}:y`)))),
    VibrationZ: round(Math.max(0.05, smooth.VibrationZ * (1 + 0.22 * noise(`${key}:z`)))),
    Temperature: round(smooth.Temperature + 0.25 * noise(`${key}:t`), 2),
  };
}

function magnitudeOf(values: Record<string, number>) {
  return Math.sqrt(values.VibrationX ** 2 + values.VibrationY ** 2 + values.VibrationZ ** 2);
}

/** The gateway's own mode label for a 30 s block, judged on the smooth signal. */
export function liveLevelAt(machineId: string, second: number): "low" | "medium" | "high" {
  const block = Math.floor(second / 30) * 30;
  const magnitude = magnitudeOf(trend(machineId, block + 15, true));
  return magnitude >= LEVEL_BANDS.high ? "high" : magnitude >= LEVEL_BANDS.medium ? "medium" : "low";
}

function sessionIdAt(machineId: string, second: number) {
  // A new device session every eight hours, the way a shift-based gateway restarts.
  return `${profileOf(machineId).sessionPrefix}-${Math.floor(second / (8 * 3600))}`;
}

function iso(second: number, offsetMs = 0) {
  return new Date(second * 1000 + offsetMs).toISOString();
}

function probabilitiesFor(machineId: string, second: number): Record<string, number> {
  const level = liveLevelAt(machineId, second);
  const certainty = 0.72 + 0.2 * (noise(`${machineId}:${second}:p`) + 0.5);
  const rest = 1 - certainty;
  const others = (["low", "medium", "high"] as const).filter((item) => item !== level);
  const split = 0.35 + 0.3 * (noise(`${machineId}:${second}:q`) + 0.5);
  return {
    [level]: round(certainty, 3),
    [others[0]]: round(rest * split, 3),
    [others[1]]: round(rest * (1 - split), 3),
  };
}

function inferenceAt(machineId: string, second: number): LiveInferenceSummary {
  const probabilities = probabilitiesFor(machineId, second);
  const predictedLabel = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];
  return {
    id: `demo-live-inference-${machineId}-${second}`,
    generatedAt: iso(second, 400),
    sessionId: sessionIdAt(machineId, second),
    predictedLabel,
    probabilities,
    basedOnTimestamp: iso(second),
    modelName: `${machineId}-vibration-level`,
    modelVersion: "3",
    inputRows: 30,
  };
}

function forecastAt(machineId: string, second: number): LiveForecastSummary {
  const next = trend(machineId, second + LIVE_CADENCE_SECONDS);
  return {
    id: `demo-live-forecast-${machineId}-${second}`,
    generatedAt: iso(second, 450),
    sessionId: sessionIdAt(machineId, second),
    forecast: Object.fromEntries(Object.entries(next).map(([key, value]) => [key, round(value)])),
    basedOnTimestamp: iso(second),
    modelName: `${machineId}-forecaster`,
    modelVersion: "2",
    inputRows: 30,
  };
}

function labelHistoryAt(machineId: string, second: number): EntityLiveLabelSpan[] {
  const spans: EntityLiveLabelSpan[] = [];
  let end = second;
  let label = liveLevelAt(machineId, second);
  let cursor = Math.floor(second / 30) * 30;
  // Walk back block by block until ten spans are known or two hours have been read.
  for (let steps = 0; steps < 240 && spans.length < 10; steps += 1) {
    const previous = cursor - 30;
    const previousLabel = liveLevelAt(machineId, previous);
    if (previousLabel !== label) {
      spans.push({ label, startedAt: iso(cursor), endedAt: iso(end) });
      end = cursor;
      label = previousLabel;
    }
    cursor = previous;
  }
  if (spans.length < 10) spans.push({ label, startedAt: iso(cursor), endedAt: iso(end) });
  return spans;
}

function horizonAt(machineId: string, second: number): EntityLiveHorizon {
  const cadence = 30;
  const attempted = Math.floor(second / cadence) * cadence;
  const forecastBase = trend(machineId, attempted, true);
  const earlier: Record<string, number> = trend(machineId, attempted - 120, true);
  const slopes = Object.fromEntries(Object.entries(forecastBase).map(([key, value]) => [key, (value - earlier[key]) / 120]));
  const profile = profileOf(machineId);
  const [bx, by, bz] = profile.base;
  const levels: Record<string, number> = { VibrationX: bx, VibrationY: by, VibrationZ: bz, Temperature: profile.temperature };
  return {
    status: "ok",
    message: null,
    attemptedAt: iso(attempted, 600),
    basedOnTimestamp: iso(attempted),
    horizonMinutes: 60,
    cadenceSeconds: cadence,
    points: Array.from({ length: 121 }, (_, index) => {
      const at = attempted + index * cadence;
      const values = Object.fromEntries(
        Object.entries(forecastBase).map(([key, now]) => {
          // A learned forecaster cannot know the future cycle. It carries the recent slope
          // a little way, easing off smoothly, then relaxes toward the machine's usual level.
          const ahead = index * cadence;
          const carried = now + slopes[key] * 240 * (1 - Math.exp(-ahead / 240));
          return [key, round(levels[key] + (carried - levels[key]) * Math.exp(-ahead / 1500))];
        }),
      );
      return { timestamp: iso(at), values };
    }),
    modelName: `${machineId}-forecaster`,
    modelVersion: "2",
  };
}

function liveSource(machineId: string, second: number): EntityLiveSource {
  const profile = profileOf(machineId);
  const sessionStart = Math.floor(second / (8 * 3600)) * 8 * 3600;
  const accepted = 48_000 + (second - sessionStart);
  return {
    id: `demo-source-${machineId}`,
    name: profile.sourceName,
    status: "connected",
    lastMessageAt: iso(second, 180),
    lastError: null,
    acceptedRows: accepted,
    rejectedRows: Math.floor(accepted / 2400),
  };
}

const NO_INFERENCE = { enabled: false, status: "disabled" as const, message: "This machine has no live feed in the demo.", lastAttemptAt: null, latest: null, recent: [] };

function liveProvenance(sourceName: string, reference: string) {
  return {
    outputSources: ["live-machine-data" as const],
    basisSources: [],
    evidence: [{ source: "live-machine-data" as const, label: sourceName, reference, detail: "Deterministic demo replay of a CMTK MQTT feed" }],
  };
}

function stateFor(machineId: string): EntityLiveState {
  if (isLiveDemoMachine(machineId)) return "live";
  if (machineId in DISCONNECTED_SOURCES) return "disconnected";
  return "no-source";
}

/** The live status the production `/entities/{id}/live` endpoint would return, at `nowMs`. */
export function liveStatusAt(machineId: string, nowMs: number, limit = 60): EntityLiveStatus {
  const asset = getDemoAsset(machineId);
  const nowSecond = Math.floor(nowMs / 1000);
  const state = stateFor(machineId);
  const base = {
    entityId: machineId,
    entityName: asset.name,
    serverTime: new Date(nowMs).toISOString(),
    freshnessSeconds: LIVE_FRESHNESS_SECONDS,
    subscriberEnabled: true,
  };

  if (state === "no-source") {
    return { ...base, state, source: null, features: [], featureUnits: {}, observations: [], latestLabel: null, labelHistory: [], inference: NO_INFERENCE, forecast: NO_INFERENCE, horizon: null };
  }

  if (state === "disconnected") {
    const silent = DISCONNECTED_SOURCES[machineId];
    const lastSecond = nowSecond - silent.silentForSeconds;
    return {
      ...base,
      state,
      source: { id: `demo-source-${machineId}`, name: silent.name, status: "disconnected", lastMessageAt: iso(lastSecond), lastError: "The gateway stopped answering (demo scenario).", acceptedRows: 18_204, rejectedRows: 11 },
      features: ["temperature", "vibration", "pressure", "humidity", "power"],
      featureUnits: { temperature: "°C", vibration: "mm/s", pressure: "bar", humidity: "%RH", power: "kW" },
      observations: [],
      latestLabel: null,
      labelHistory: [],
      inference: { enabled: true, status: "waiting", message: "Waiting for live readings.", lastAttemptAt: iso(lastSecond), latest: null, recent: [] },
      forecast: { enabled: false, status: "disabled", message: "No forecasting model is active for this machine.", lastAttemptAt: null, latest: null, recent: [] },
      horizon: null,
      provenance: liveProvenance(silent.name, `demo-source-${machineId}`),
    };
  }

  // The newest reading is one second behind the clock, as if it were still in flight.
  const latestSecond = nowSecond - LIVE_CADENCE_SECONDS;
  const count = Math.max(1, Math.min(300, limit));
  const observations: EntityLiveObservation[] = Array.from({ length: count }, (_, index) => {
    const second = latestSecond - (count - 1 - index) * LIVE_CADENCE_SECONDS;
    return { timestamp: iso(second), sessionId: sessionIdAt(machineId, second), values: liveSampleAt(machineId, second), receivedAt: iso(second, 180) };
  });
  const inferenceSecond = Math.floor(latestSecond / 5) * 5;
  const recent = Array.from({ length: 10 }, (_, index) => inferenceAt(machineId, inferenceSecond - index * 5));
  const recentForecasts = Array.from({ length: 10 }, (_, index) => forecastAt(machineId, inferenceSecond - index * 5));
  const labelHistory = labelHistoryAt(machineId, latestSecond);
  const source = liveSource(machineId, latestSecond);

  return {
    ...base,
    state,
    source,
    features: [...LIVE_FEATURES],
    featureUnits: { ...LIVE_FEATURE_UNITS },
    observations,
    latestLabel: { label: labelHistory[0].label, observedAt: iso(latestSecond) },
    labelHistory,
    inference: { enabled: true, status: "ok", message: null, lastAttemptAt: recent[0].generatedAt, latest: recent[0], recent },
    forecast: { enabled: true, status: "ok", message: null, lastAttemptAt: recentForecasts[0].generatedAt, latest: recentForecasts[0], recent: recentForecasts },
    horizon: horizonAt(machineId, latestSecond),
    provenance: liveProvenance(source.name, source.id),
  };
}

export function fleetLiveHealthAt(machineIds: string[], nowMs: number): FleetLiveHealth {
  const machines: EntityLiveHealth[] = machineIds.map((machineId) => {
    const status = liveStatusAt(machineId, nowMs, 1);
    return {
      entityId: status.entityId,
      entityName: status.entityName,
      state: status.state,
      source: status.source,
      features: status.features,
      inference: { ...status.inference, recent: [] },
    };
  });
  return { serverTime: new Date(nowMs).toISOString(), freshnessSeconds: LIVE_FRESHNESS_SECONDS, subscriberEnabled: true, machines };
}

/** ISO 20816-3 Group 2, rigid support: the published zone boundaries for broadband RMS velocity. */
export const ISO_20816_PROFILE: EngineeringVibrationProfile = {
  id: "iso20816-3-group2-rigid",
  standard: "ISO 20816-3:2022",
  title: "ISO 20816-3 · Group 2 · rigid support",
  machineGroup: "Group 2 (15–300 kW)",
  supportClass: "Rigid",
  measurement: "Broadband RMS velocity",
  frequencyBand: "10–1000 Hz",
  unit: "mm/s",
  zoneAB: 1.4,
  zoneBC: 2.8,
  zoneCD: 4.5,
  scope: "Industrial machines with power above 15 kW and operating speeds between 120 and 30 000 r/min, measured in situ on non-rotating parts.",
  evaluation: "Zone boundaries are evaluation guidance for acceptance and long-term operation, not a failure prediction.",
  references: ["ISO 20816-3:2022, Mechanical vibration: Measurement and evaluation of machine vibration, Part 3"],
};

/** Learned per-level baselines: the P99 of 5 s RMS windows over the replayed history, never including live rows. */
export function vibrationThresholdsFor(machineId: string, nowMs: number): EntityVibrationThresholds {
  profileOf(machineId);
  const features = ["VibrationX", "VibrationY", "VibrationZ"];
  // Sample a day of the deterministic history once per minute, grouped by the gateway's own level.
  const daySeconds = Math.floor(nowMs / 1000) - 86_400;
  const byLevel: Record<string, Record<string, number[]>> = {};
  for (let minute = 0; minute < 1440; minute += 1) {
    const second = daySeconds + minute * 60;
    const level = liveLevelAt(machineId, second);
    const sample = liveSampleAt(machineId, second);
    byLevel[level] ??= Object.fromEntries(features.map((feature) => [feature, []]));
    for (const feature of features) byLevel[level][feature].push(sample[feature]);
  }
  const percentile = (values: number[], p: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  };
  const baselines: VibrationBaselineValue[] = [];
  for (const level of ["low", "medium", "high"]) {
    for (const feature of features) {
      const values = byLevel[level]?.[feature] ?? [];
      const sessions = Math.round(values.length / 18);
      const reliability: VibrationBaselineValue["reliability"] = values.length >= 120 ? "ok" : values.length >= 40 ? "limited" : "insufficient";
      baselines.push({
        level,
        feature,
        value: reliability === "insufficient" ? null : round(percentile(values, 99)),
        unit: "mm/s",
        reliability,
        sessions,
        windows: values.length,
        samples: values.length * 5,
        median: values.length ? round(percentile(values, 50)) : null,
      });
    }
  }
  return {
    entityId: machineId,
    features,
    featureUnits: { VibrationX: "mm/s", VibrationY: "mm/s", VibrationZ: "mm/s" },
    machineSpecific: {
      method: "session-weighted-window-percentile",
      percentile: 99,
      windowSeconds: 5,
      windowAggregation: "rms",
      minSamplesPerWindow: 3,
      minSessions: 3,
      minWindows: 30,
      reliableSessions: 3,
      excludesLiveData: true,
      readings: 1440 * 5,
      sessions: 3,
      computedAt: new Date(Math.floor(nowMs / 600_000) * 600_000).toISOString(),
      description: "Learned from the replayed demo history for this machine, per vibration level and axis.",
      baselines,
    },
    engineering: {
      status: "provisional",
      message: "Compared with ISO 20816-3 Group 2 on rigid supports. The machine class is assumed for the demo, so treat the result as provisional.",
      profile: ISO_20816_PROFILE,
      applicableFeatures: features,
      requiredMeasurement: "Broadband RMS velocity",
      note: "Demo assumption: the replayed gateway reports broadband RMS velocity.",
    },
    availableProfiles: [ISO_20816_PROFILE],
  };
}

export function cmtkSetupAt(nowMs: number): CmtkSetup {
  const presets: CmtkSetup["presets"] = {
    compact: "Flat JSON with VibrationX/Y/Z, Temperature and mode.",
    verbose: "Nested gateway JSON with per-axis objects.",
    velocity: "Velocity RMS only, one value per axis.",
    pd: "Process-data frames from an IO-Link master.",
  };
  return {
    configured: true,
    broker: DEMO_BROKER,
    topic: DEMO_TOPIC,
    preset: "compact",
    presetDescription: presets.compact,
    canConnect: false,
    defaultEntityId: "machine-c-01",
    machines: liveDemoMachineIds().map((machineId) => {
      const status = liveStatusAt(machineId, nowMs, 1);
      const asset = getDemoAsset(machineId);
      return {
        entityId: machineId,
        name: asset.name,
        description: `${asset.line} · ${asset.model}`,
        sourceId: status.source?.id ?? `demo-source-${machineId}`,
        state: status.state,
        lastMessageAt: status.source?.lastMessageAt ?? null,
        lastError: null,
      };
    }),
    candidates: [],
    connection: { host: "replay.demo.invalid", port: 8883, tls: true, username: "demo-reader", hasPassword: false, topic: DEMO_TOPIC, preset: "compact", source: "server" },
    presets,
  };
}

export function mqttHealthAt(nowMs: number): MqttHealth {
  const now = new Date(nowMs).toISOString();
  const startedMs = Math.floor(nowMs / 86_400_000) * 86_400_000 + 6 * 3_600_000;
  const started = new Date(Math.min(startedMs, nowMs - 60_000)).toISOString();
  const uptimeMinutes = Math.max(1, Math.floor((nowMs - Date.parse(started)) / 60_000));
  const perMinute = 60 * liveDemoMachineIds().length;
  return {
    pipelineId: "demo-replay-ingestion",
    targetMachineId: "machine-c-01",
    observedAt: now,
    processStartedAt: started,
    lastEventAt: new Date(nowMs - 1000).toISOString(),
    status: "healthy",
    summary: "The demo replay is connected, subscribed, and delivering readings normally.",
    broker: { state: "connected", connectedAt: started, disconnectedAt: null, lastError: null },
    subscription: { state: "subscribed", topic: DEMO_TOPIC, qos: 1, subscribedAt: started, lastError: null },
    messages: {
      flowState: "healthy",
      receivedTotal: uptimeMinutes * perMinute,
      acceptedTotal: uptimeMinutes * perMinute - Math.floor(uptimeMinutes / 40),
      invalidTotal: Math.floor(uptimeMinutes / 60),
      rejectedTotal: Math.floor(uptimeMinutes / 40) - Math.floor(uptimeMinutes / 60),
      receivedPerMinute: perMinute,
      acceptedPerMinute: perMinute,
      expectedPerMinute: perMinute,
      problemRatio: 0,
      lastReceivedAt: new Date(nowMs - 1000).toISOString(),
      lastAcceptedAt: new Date(nowMs - 1000).toISOString(),
      lastProblemAt: new Date(nowMs - 37 * 60_000).toISOString(),
      lastProblemReason: "missing VibrationZ",
    },
    reconnect: { attemptsTotal: 1, attemptsInWindow: 0, consecutiveFailures: 0, abnormal: false, lastAttemptAt: started, lastError: null },
  };
}

export const DEMO_MQTT_SUBSCRIPTIONS: MqttSubscription[] = [
  {
    id: "demo-subscription-replay",
    name: "Demo CMTK replay",
    brokerHost: "replay.demo.invalid",
    port: 8883,
    topic: DEMO_TOPIC,
    qos: 1,
    enabled: true,
    targetMachineId: "machine-c",
    createdAt: "2026-09-12T02:00:00.000Z",
    updatedAt: "2026-10-01T05:30:00.000Z",
  },
];

export const DEMO_LIVE_FLEET_IDS = DEMO_ASSETS.map((asset) => asset.id);
