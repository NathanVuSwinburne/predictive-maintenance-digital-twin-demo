import { describe, expect, it } from "vitest";

import { fleetLiveHealthAt, liveLevelAt, liveSampleAt, liveStatusAt, vibrationThresholdsFor } from "@/lib/demo-engineering/live";

const NOW = Date.parse("2026-10-19T03:00:00Z");

describe("demo live feed", () => {
  it("is a pure function of machine and time, so two polls agree on the past", () => {
    const first = liveStatusAt("machine-c-01", NOW, 60);
    const second = liveStatusAt("machine-c-01", NOW + 2_000, 60);
    expect(first.state).toBe("live");
    expect(first.observations).toHaveLength(60);
    const overlap = second.observations.find((item) => item.timestamp === first.observations.at(-1)!.timestamp);
    expect(overlap?.values).toEqual(first.observations.at(-1)!.values);
    expect(second.observations.at(-1)!.timestamp > first.observations.at(-1)!.timestamp).toBe(true);
  });

  it("carries the production CMTK shape for the 3D view: three vibration axes in mm/s", () => {
    const status = liveStatusAt("machine-c-02", NOW);
    expect(status.features).toEqual(["VibrationX", "VibrationY", "VibrationZ", "Temperature"]);
    expect(status.featureUnits?.VibrationX).toBe("mm/s");
    expect(status.horizon?.points).toHaveLength(121);
    expect(status.inference.latest?.predictedLabel).toMatch(/low|medium|high/);
  });

  it("visits low, medium and high on Packaging Drive 01 over an hour, and stays low on the motor", () => {
    const levels = (id: string) => new Set(Array.from({ length: 120 }, (_, i) => liveLevelAt(id, NOW / 1000 + i * 30)));
    expect(levels("machine-c-01")).toEqual(new Set(["low", "medium", "high"]));
    expect(levels("machine-c-03")).toEqual(new Set(["low"]));
  });

  it("reports silence honestly and no feed at all for machines without one", () => {
    const fleet = fleetLiveHealthAt(["machine-b-03", "machine-a-01"], NOW);
    expect(fleet.machines.map((machine) => machine.state)).toEqual(["disconnected", "no-source"]);
  });

  it("learns per-level baselines from history only and judges against the published ISO zones", () => {
    const thresholds = vibrationThresholdsFor("machine-c-01", NOW);
    expect(thresholds.machineSpecific.excludesLiveData).toBe(true);
    expect(thresholds.engineering.profile?.zoneBC).toBe(2.8);
    expect(liveSampleAt("machine-c-01", 1000)).toEqual(liveSampleAt("machine-c-01", 1000));
  });
});
