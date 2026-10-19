import { describe, expect, it } from "vitest";

import {
  axisOf,
  evaluateEngineering,
  evaluateMachineSpecific,
  evaluateVibrationHealth,
  interpretChecks,
  liveWindowRms,
  resolveLevel,
  selectMachineThreshold,
  summariseMachine,
} from "@/lib/domain/vibration-health";
import type { EntityLiveObservation } from "@/lib/domain/types";
import { FEATURES, baseline, configured, profile, thresholds } from "./fixtures/vibration-thresholds";

function observations(values: Record<string, number>[], stepMs = 100, end = Date.parse("2026-10-06T10:00:10Z")): EntityLiveObservation[] {
  return values.map((vals, index) => {
    const timestamp = new Date(end - (values.length - 1 - index) * stepMs).toISOString();
    return { timestamp, receivedAt: timestamp, sessionId: "mqtt:1", values: vals };
  });
}

describe("level and threshold selection", () => {
  it("uses the predicted level in auto mode and the chosen level otherwise", () => {
    expect(resolveLevel("auto", "HIGH")).toEqual({ level: "high", source: "predicted" });
    expect(resolveLevel("auto", null)).toEqual({ level: null, source: "unknown" });
    expect(resolveLevel("auto", "normal")).toEqual({ level: null, source: "unknown" });
    expect(resolveLevel("medium", "high")).toEqual({ level: "medium", source: "manual" });
  });

  it("selects the baseline for the exact level and axis", () => {
    const t = thresholds();
    expect(selectMachineThreshold(t, "high", "VibrationX")?.value).toBe(0.9);
    expect(selectMachineThreshold(t, "high", "VibrationY")?.value).toBe(1.2);
    expect(selectMachineThreshold(t, "low", "VibrationZ")?.value).toBe(0.55);
    expect(selectMachineThreshold(t, "medium", "VibrationX")?.value).toBe(0.6);
    expect(selectMachineThreshold(t, null, "VibrationX")).toBeNull();
    expect(selectMachineThreshold(null, "high", "VibrationX")).toBeNull();
    expect(selectMachineThreshold(t, "high", "Temperature")).toBeNull();
  });

  it("maps feature names to axes", () => {
    expect(FEATURES.map(axisOf)).toEqual(["X", "Y", "Z"]);
    expect(axisOf("Temperature")).toBe("Temperature");
  });
});

describe("live window value", () => {
  it("is the RMS of the readings in the last window, like the baseline windows", () => {
    // 3 s at 10 Hz of 0.3 then 0.4 for the newest 2 s; window 5 s covers all 50 readings.
    const values = [...Array(30).fill(0.3), ...Array(20).fill(0.4)].map((v) => ({ VibrationX: v }));
    const result = liveWindowRms(observations(values), "VibrationX", 5);
    expect(result?.samples).toBe(50);
    expect(result?.value).toBeCloseTo(Math.sqrt((30 * 0.09 + 20 * 0.16) / 50), 10);
  });

  it("only uses the last window and skips invalid values", () => {
    const old = observations([{ VibrationX: 9 }], 100, Date.parse("2026-10-06T10:00:00Z"));
    const recent = observations([{ VibrationX: 0.2 }, { VibrationX: Number.NaN }, { VibrationX: -1 }, { VibrationX: 0.2 }, { VibrationX: 0.2 }]);
    const result = liveWindowRms([...old, ...recent], "VibrationX", 5);
    expect(result?.samples).toBe(3);
    expect(result?.value).toBeCloseTo(0.2, 10);
  });

  it("needs enough readings", () => {
    expect(liveWindowRms(observations([{ VibrationX: 0.2 }, { VibrationX: 0.2 }]), "VibrationX", 5)).toBeNull();
    expect(liveWindowRms([], "VibrationX")).toBeNull();
  });
});

describe("machine-specific check", () => {
  const high = baseline("high", "VibrationX", 0.9);

  it("is normal below and on the boundary, above normal beyond it", () => {
    expect(evaluateMachineSpecific(0.5, high, "high").status).toBe("normal");
    expect(evaluateMachineSpecific(0.9, high, "high").status).toBe("normal");
    expect(evaluateMachineSpecific(0.901, high, "high").status).toBe("above-normal");
  });

  it("reports missing level, missing history and invalid readings instead of guessing", () => {
    expect(evaluateMachineSpecific(0.5, high, null).status).toBe("level-unknown");
    expect(evaluateMachineSpecific(0.5, null, "high").status).toBe("insufficient-data");
    expect(evaluateMachineSpecific(0.5, baseline("medium", "VibrationY", null, "insufficient"), "medium").status).toBe(
      "insufficient-data",
    );
    expect(evaluateMachineSpecific(Number.NaN, high, "high").status).toBe("no-reading");
    expect(evaluateMachineSpecific(-0.1, high, "high").status).toBe("no-reading");
    expect(evaluateMachineSpecific(null, high, "high").status).toBe("no-reading");
  });

  it("marks baselines from few sessions as provisional", () => {
    const check = evaluateMachineSpecific(0.7, baseline("medium", "VibrationX", 0.6, "limited"), "medium");
    expect(check.status).toBe("above-normal");
    expect(check.provisional).toBe(true);
  });
});

describe("engineering check", () => {
  it("is not configured by default and never invents a limit", () => {
    const check = evaluateEngineering(5, thresholds(), "VibrationX");
    expect(check.status).toBe("not-configured");
    expect(check.limit).toBeNull();
  });

  it("is not comparable when the measurement is incompatible", () => {
    const t = thresholds({ status: "measurement-incompatible", profile, applicableFeatures: [] });
    expect(evaluateEngineering(5, t, "VibrationX").status).toBe("incompatible");
    expect(evaluateEngineering(5, configured(), "Temperature").status).toBe("incompatible");
  });

  it("grades zones with boundaries staying in the lower zone", () => {
    const t = configured();
    expect(evaluateEngineering(0.3, t, "VibrationX")).toMatchObject({ status: "within-limit", zone: "A/B", limit: 2.8 });
    expect(evaluateEngineering(2.8, t, "VibrationX").status).toBe("within-limit");
    expect(evaluateEngineering(2.81, t, "VibrationX")).toMatchObject({ status: "elevated", zone: "C" });
    expect(evaluateEngineering(4.5, t, "VibrationX").status).toBe("elevated");
    expect(evaluateEngineering(4.6, t, "VibrationX")).toMatchObject({ status: "critical", zone: "D" });
    expect(evaluateEngineering(Number.NaN, t, "VibrationX").status).toBe("no-reading");
  });

  it("flags an unconfirmed profile as provisional", () => {
    expect(evaluateEngineering(0.3, configured("provisional"), "VibrationX").provisional).toBe(true);
    expect(evaluateEngineering(0.3, configured("confirmed"), "VibrationX").provisional).toBe(false);
  });
});

describe("combined health", () => {
  it("takes the worst axis and explains disagreement between the two checks", () => {
    expect(summariseMachine([])).toBe("no-reading");
    expect(interpretChecks("normal", "elevated")).toMatch(/usually operates like this, but the absolute vibration is high/);
    expect(interpretChecks("above-normal", "within-limit")).toMatch(/unusual for this machine, but still below/);
    expect(interpretChecks("above-normal", "critical")).toMatch(/above the engineering limit/);
    expect(interpretChecks("above-normal", "not-configured")).toMatch(/No engineering limit is configured/);
    expect(interpretChecks("normal", "not-configured")).toMatch(/normal range/);
    expect(interpretChecks("level-unknown", "within-limit")).toMatch(/level is not known/);
    for (const text of [
      interpretChecks("above-normal", "critical"),
      interpretChecks("normal", "elevated"),
    ]) {
      expect(text).not.toMatch(/fail/i);
    }
  });

  it("switching the level changes the learned threshold per axis", () => {
    const obs = observations(Array.from({ length: 50 }, () => ({ VibrationX: 0.6, VibrationY: 0.6, VibrationZ: 0.6 })));
    const units = { VibrationX: "mm/s", VibrationY: "mm/s", VibrationZ: "mm/s" };
    const asHigh = evaluateVibrationHealth({ observations: obs, thresholds: configured(), features: FEATURES, units, choice: "auto", predictedLabel: "high" });
    expect(asHigh.axes.map((axis) => axis.machine.threshold)).toEqual([0.9, 1.2, 1.0]);
    expect(asHigh.machineSummary).toBe("normal");
    expect(asHigh.engineeringSummary).toBe("within-limit");

    const asLow = evaluateVibrationHealth({ observations: obs, thresholds: configured(), features: FEATURES, units, choice: "low", predictedLabel: "high" });
    expect(asLow.level).toEqual({ level: "low", source: "manual" });
    expect(asLow.axes.map((axis) => axis.machine.threshold)).toEqual([0.5, 0.7, 0.55]);
    expect(asLow.axes.map((axis) => axis.machine.status)).toEqual(["above-normal", "normal", "above-normal"]);
    expect(asLow.machineSummary).toBe("above-normal");
    expect(asLow.interpretation).toMatch(/unusual for this machine, but still below/);
  });
});

