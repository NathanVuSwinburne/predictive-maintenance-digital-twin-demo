import { describe, expect, it } from "vitest";
import { createSessionPreview, createSimulationRun, listClientSessions } from "@/lib/demo-engineering/sessions";

describe("demo client sessions", () => {
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
});
