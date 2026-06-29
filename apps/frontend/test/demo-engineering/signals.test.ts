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
