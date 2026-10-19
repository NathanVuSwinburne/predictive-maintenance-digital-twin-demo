import type { EntityLiveStatus, LiveInferenceSummary } from "@/lib/domain/types";

export const liveServerTime = "2026-10-06T10:00:10.000Z";

export const liveInference: LiveInferenceSummary = {
  id: "inference-1",
  generatedAt: "2026-10-06T10:00:09.000Z",
  sessionId: "shift-a",
  predictedLabel: "high",
  probabilities: { low: 0.08, medium: 0.1, high: 0.82 },
  basedOnTimestamp: "2026-10-06T10:00:08.000Z",
  modelName: "cmtk-predict",
  modelVersion: "3",
  inputRows: 30,
};

export const liveStatusFixture: EntityLiveStatus = {
  entityId: "entity-cmtk",
  entityName: "CMTK Vibration Machine",
  serverTime: liveServerTime,
  freshnessSeconds: 15,
  subscriberEnabled: true,
  state: "live",
  source: {
    id: "source-mqtt-1",
    name: "Balluff vibration sensor",
    status: "connected",
    lastMessageAt: "2026-10-06T10:00:08.000Z",
    lastError: null,
    acceptedRows: 120,
    rejectedRows: 2,
  },
  features: ["Temperature", "VibrationX", "VibrationY", "VibrationZ"],
  featureUnits: { Temperature: "C", VibrationX: "g", VibrationY: "g", VibrationZ: "g" },
  observations: [
    {
      timestamp: "2026-10-06T10:00:06.000Z",
      sessionId: "shift-a",
      values: { Temperature: 41.2, VibrationX: 1.1, VibrationY: 0.9, VibrationZ: 0.7 },
      receivedAt: "2026-10-06T10:00:06.200Z",
    },
    {
      timestamp: "2026-10-06T10:00:07.000Z",
      sessionId: "shift-a",
      values: { Temperature: 41.3, VibrationX: 1.4, VibrationY: 1.0, VibrationZ: 0.8 },
      receivedAt: "2026-10-06T10:00:07.200Z",
    },
    {
      timestamp: "2026-10-06T10:00:08.000Z",
      sessionId: "shift-a",
      values: { Temperature: 41.5, VibrationX: 1.62, VibrationY: 1.1, VibrationZ: 0.9 },
      receivedAt: "2026-10-06T10:00:08.200Z",
    },
  ],
  latestLabel: { label: "high", observedAt: "2026-10-06T10:00:05.000Z" },
  labelHistory: [
    { label: "high", startedAt: "2026-10-06T10:00:05.000Z", endedAt: "2026-10-06T10:00:08.000Z" },
    { label: "medium", startedAt: "2026-10-06T09:59:00.000Z", endedAt: "2026-10-06T10:00:05.000Z" },
  ],
  inference: {
    enabled: true,
    status: "ok",
    message: null,
    lastAttemptAt: "2026-10-06T10:00:09.000Z",
    latest: liveInference,
    recent: [
      liveInference,
      {
        ...liveInference,
        id: "inference-0",
        generatedAt: "2026-10-06T10:00:04.000Z",
        predictedLabel: "medium",
        probabilities: { low: 0.2, medium: 0.6, high: 0.2 },
      },
    ],
  },
  forecast: {
    enabled: true,
    status: "ok",
    message: null,
    lastAttemptAt: "2026-10-06T10:00:09.000Z",
    latest: {
      id: "forecast-1",
      generatedAt: "2026-10-06T10:00:09.000Z",
      sessionId: "shift-a",
      forecast: { Temperature: 41.6, VibrationX: 1.75, VibrationY: 1.15, VibrationZ: 0.95 },
      basedOnTimestamp: "2026-10-06T10:00:08.000Z",
      modelName: "cmtk-simulate",
      modelVersion: "2",
      inputRows: 30,
    },
    recent: [],
  },
  provenance: {
    outputSources: ["live-machine-data"],
    basisSources: [],
    evidence: [
      {
        source: "live-machine-data",
        label: "Balluff vibration sensor",
        reference: "source-mqtt-1",
        detail: "MQTT machine telemetry",
      },
    ],
  },
};
