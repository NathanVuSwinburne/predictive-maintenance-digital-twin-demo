import type { SimulationConfig, SimulationRun, SimulationSessionOption, SimulationSessionPreview } from "@/lib/domain/types";
import { getDemoAsset } from "./assets";
import { generateDriveReadings } from "./signals";

const charts = [{ id: "vibration", label: "Vibration", unit: "g", fields: ["vibrationX", "vibrationY", "vibrationZ"] }, { id: "temperature", label: "Temperature", unit: "°C", fields: ["temperature"] }];
const fixtures = [
  { sessionId: 10, start: "2026-05-18T01:00:00.000Z", durationMinutes: 120, gapFromPreviousMinutes: null },
  { sessionId: 20, start: "2026-05-24T03:30:00.000Z", durationMinutes: 165, gapFromPreviousMinutes: 8670 },
  { sessionId: 78, start: "2026-06-05T00:15:00.000Z", durationMinutes: 222, gapFromPreviousMinutes: 16920 },
  { sessionId: 100, start: "2026-06-18T05:00:00.000Z", durationMinutes: 270, gapFromPreviousMinutes: 18483 },
] as const;

export function listClientSessions(machineId: string): SimulationSessionOption[] {
  getDemoAsset(machineId);
  return fixtures.map((fixture) => ({ ...fixture, end: new Date(Date.parse(fixture.start) + fixture.durationMinutes * 60_000).toISOString(), totalRows: fixture.durationMinutes * 120, realRows: fixture.durationMinutes * 120, syntheticRows: 0, usesSyntheticContinuation: false, sampleIntervalMs: 500, provenance: "curated-observed-fixture", label: `Session ${fixture.sessionId}` }));
}

export function createSimulationConfig(machineId: string): SimulationConfig {
  const asset = getDemoAsset(machineId);
  return { machineId, machineType: asset.machineType, title: `${asset.name} forecast simulation`, description: "Client monitoring session with deterministic synthetic continuation.", contextWindowMinutes: 20, contextWindowRows: 40, forecastChunkMinutes: 10, sampleIntervalMs: 30_000, warnings: ["Observed fixtures are sanitized; future continuation is synthetic."], sessions: listClientSessions(machineId), sensorChartGroups: charts };
}

export function createSessionPreview(machineId: string, sessionId: number): SimulationSessionPreview {
  const session = listClientSessions(machineId).find((item) => item.sessionId === sessionId) ?? listClientSessions(machineId).find((item) => item.sessionId === 78)!;
  const count = Math.floor(session.durationMinutes * 2) + 1;
  const readings = generateDriveReadings(machineId, count, session.start, 30_000).map((point) => ({ ...point, synthetic: false }));
  return { machineId, machineType: getDemoAsset(machineId).machineType, sessionId, sensorFields: ["vibrationX", "vibrationY", "vibrationZ", "temperature"], sensorChartGroups: charts, sourceWindow: { start: session.start, end: session.end, points: readings.length, sessionId, realPoints: readings.length, syntheticPoints: 0 }, readings };
}

export function createSimulationRun(preview: SimulationSessionPreview, horizonMinutes: number, userId: string, scenarioName: string): SimulationRun {
  const start = new Date(Date.parse(preview.sourceWindow.end) + 30_000).toISOString();
  const generated = generateDriveReadings(preview.machineId, Math.max(1, horizonMinutes * 2), start, 30_000).map((point) => ({ ...point, synthetic: true }));
  const magnitudes = generated.map((point) => Math.sqrt(point.values.vibrationX ** 2 + point.values.vibrationY ** 2 + point.values.vibrationZ ** 2));
  const peak = Math.max(...magnitudes);
  const imbalance = generated.reduce((max, point) => Math.max(max, Math.max(point.values.vibrationX, point.values.vibrationY, point.values.vibrationZ) - Math.min(point.values.vibrationX, point.values.vibrationY, point.values.vibrationZ)), 0);
  const maxTemperature = Math.max(...generated.map((point) => point.values.temperature));
  const probability = Math.min(0.98, 0.12 + peak * 0.42 + imbalance * 0.24 + Math.max(0, maxTemperature - 68) * 0.012);
  const label = probability > 0.75 ? "high" : probability > 0.45 ? "medium" : "low";
  return { id: `demo-run-${preview.sessionId}-${horizonMinutes}`, machineId: preview.machineId, userId, createdAt: "2026-06-28T08:00:00.000Z", scenarioName, projectedRisk: Math.round(probability * 100), projectedDowntimeHours: Number((probability * 2.5).toFixed(1)), summary: `Forecast derived from session ${preview.sessionId}; peak vibration ${peak.toFixed(2)} g and temperature ${maxTemperature.toFixed(1)} °C.`, recommendations: imbalance > 0.35 ? ["Inspect bearing alignment", "Balance the rotating assembly"] : ["Continue vibration monitoring"], projectedLabel: label, failureProbability: probability, selectedSessionId: preview.sessionId, syntheticContinuationUsed: true, generatedReadings: generated, sourceReadings: preview.readings, sourceWindow: { ...preview.sourceWindow, realPoints: preview.readings.length, syntheticPoints: generated.length }, sensorFields: preview.sensorFields, sensorChartGroups: preview.sensorChartGroups, simulationHorizonMinutes: horizonMinutes, simulationStatus: "completed", simulationMessage: null, classificationWindows: generated.length ? [{ windowStart: generated[0].timestamp, windowEnd: generated.at(-1)!.timestamp, predictedLabel: label, failureProbability: probability, confidence: 0.86, probabilities: { normal: 1 - probability, elevated: probability } }] : [] };
}
