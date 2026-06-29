import { describe, expect, it } from "vitest";
import { createPredictionConfig, scorePrediction } from "@/lib/demo-engineering/prediction";

describe("demo prediction", () => {
  it.each([
    ["machine-a-01", ["airTempK", "processTempK", "rotationalSpeed", "torque", "toolWear", "productType"]],
    ["machine-b-01", ["temperature", "vibration", "pressure", "humidity", "power"]],
    ["machine-c-01", ["vibrationX", "vibrationY", "vibrationZ", "temperature"]],
  ])("returns machine-specific fields for %s", (id, expected) => {
    expect(createPredictionConfig(id).fields.map((field) => field.key)).toEqual(expected);
  });

  it("identifies pump vibration and temperature breaches", () => {
    const result = scorePrediction("machine-b-01", { temperature: 92, vibration: 11, pressure: 4.8, humidity: 62, power: 112 });
    expect(result.breachedFields).toEqual(expect.arrayContaining(["temperature", "vibration"]));
    expect(result.failureProbability).toBeGreaterThan(0.5);
    expect(result.warnings.join(" ")).toMatch(/demo engineering score/i);
  });
});
