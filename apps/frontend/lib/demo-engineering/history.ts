import type { HistoryEvent, HistoryEventType } from "@/lib/domain/types";
import { DEMO_ASSETS } from "./assets";

const types: HistoryEventType[] = ["telemetry-anomaly", "fault-prediction", "chat-insight", "simulation-run", "maintenance-action"];
const title: Record<HistoryEventType, string> = { "telemetry-anomaly": "Vibration threshold exceeded", "fault-prediction": "Bearing risk scored", "chat-insight": "Assistant investigation recorded", "simulation-run": "Future condition simulated", "maintenance-action": "Bearing inspection scheduled", "failure-label": "Failure label recorded", "training-run": "Model training finished", "model-import": "Model imported", "model-promotion": "Model activated" };

/** `anchorMs` is the newest event's time; the provider passes the current hour so history reads as recent. */
export function createDemoHistory(anchorMs = Date.parse("2026-06-28T08:00:00.000Z")): HistoryEvent[] {
  const anchor = anchorMs;
  const events: HistoryEvent[] = [];
  types.forEach((type, index) => events.push({ id: `history-session-78-${index}`, timestamp: new Date(anchor - index * 47 * 60_000).toISOString(), type, machineId: "machine-c-01", userId: "demo-admin", title: title[type], description: `${DEMO_ASSETS[7].name} session 78 linked engineering review.`, severity: index < 2 ? "high" : "medium", metadata: { chainId: "machine-c-01-session-78", sessionId: 78, measurement: "vibration magnitude", threshold: 0.85, probability: 0.84, recommendationId: "bearing-inspection-c01" } }));
  for (let index = 5; index < 40; index += 1) {
    const asset = DEMO_ASSETS[index % DEMO_ASSETS.length];
    const type = types[index % types.length];
    events.push({ id: `history-${index}`, timestamp: new Date(anchor - index * 17 * 60 * 60_000).toISOString(), type, machineId: asset.id, userId: index % 4 === 0 ? "demo-engineer" : "demo-admin", title: title[type], description: `${asset.name}: deterministic ${type.replaceAll("-", " ")} record.`, severity: asset.riskScore > 70 ? "high" : asset.riskScore > 35 ? "medium" : "low", metadata: { chainId: `${asset.id}-chain-${Math.floor(index / 5)}`, measurement: asset.sensors[0].key, threshold: asset.sensors[0].warningHigh } });
  }
  // Machine Registry activity, so the history shows the model lifecycle next to operations.
  const registry: Array<[HistoryEventType, string, string, number]> = [
    ["failure-label", "machine-b-02", "Process Pump 02: technician labelled a cavitation episode for training.", 26],
    ["training-run", "machine-b-02", "Process Pump 02: random forest trained on dataset v3; it beat the majority-class baseline.", 25],
    ["model-promotion", "machine-b-02", "Process Pump 02: failure-risk model v3 activated after review.", 24],
  ];
  for (const [type, machineId, description, hoursAgo] of registry) {
    events.push({ id: `history-registry-${type}`, timestamp: new Date(anchor - hoursAgo * 60 * 60_000).toISOString(), type, machineId, userId: "demo-admin", title: title[type], description, severity: "low", metadata: { chainId: "machine-b-02-registry", modelVersion: "3" } });
  }
  return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((event) => ({ ...event, metadata: event.metadata ? structuredClone(event.metadata) : undefined }));
}
