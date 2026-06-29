import { describe, expect, it } from "vitest";
import { createDemoHistory } from "@/lib/demo-engineering/history";

describe("demo history", () => {
  it("creates forty ordered linked events over thirty days", () => {
    const events = createDemoHistory();
    expect(events).toHaveLength(40);
    expect(events.every((event, i) => i === 0 || event.timestamp <= events[i - 1].timestamp)).toBe(true);
    expect(new Set(events.map((event) => event.type))).toEqual(new Set(["telemetry-anomaly", "fault-prediction", "maintenance-action", "simulation-run", "chat-insight"]));
    const session78 = events.filter((event) => event.metadata?.chainId === "machine-c-01-session-78");
    expect(session78.map((event) => event.type)).toEqual(expect.arrayContaining(["telemetry-anomaly", "fault-prediction", "chat-insight", "simulation-run", "maintenance-action"]));
  });
});
