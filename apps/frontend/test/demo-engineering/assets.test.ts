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
