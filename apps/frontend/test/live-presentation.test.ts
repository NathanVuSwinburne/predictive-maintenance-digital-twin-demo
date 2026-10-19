import { describe, expect, it } from "vitest";

import {
  badgeVariantForLiveState,
  badgeVariantForMachineLabel,
  formatElapsed,
  liveFreshnessState,
  severityForMachineLabel,
  isVibrationFeature,
  unitForLiveFeature,
} from "@/lib/domain/presentation";

describe("live presentation helpers", () => {
  it("judges freshness against the supplied clock with a 15 second default window", () => {
    const now = Date.parse("2026-10-06T10:00:30.000Z");
    expect(liveFreshnessState("2026-10-06T10:00:16.000Z", now)).toBe("live");
    expect(liveFreshnessState("2026-10-06T10:00:15.000Z", now)).toBe("live");
    expect(liveFreshnessState("2026-10-06T10:00:14.999Z", now)).toBe("stale");
    expect(liveFreshnessState(null, now)).toBe("waiting");
    expect(liveFreshnessState("not a date", now)).toBe("waiting");
    expect(liveFreshnessState("2026-10-06T10:00:00.000Z", now, 60)).toBe("live");
  });

  it("maps live states and machine labels onto semantic badge variants", () => {
    expect(badgeVariantForLiveState("live")).toBe("success");
    expect(badgeVariantForLiveState("stale")).toBe("warning");
    expect(badgeVariantForLiveState("reconnecting")).toBe("warning");
    expect(badgeVariantForLiveState("disconnected")).toBe("destructive");
    expect(badgeVariantForLiveState("waiting")).toBe("outline");

    expect(severityForMachineLabel(" HIGH ")).toBe("high");
    expect(severityForMachineLabel("unknown")).toBeNull();
    expect(badgeVariantForMachineLabel("low")).toBe("outline");
    expect(badgeVariantForMachineLabel("medium")).toBe("secondary");
    expect(badgeVariantForMachineLabel("high")).toBe("warning");
    expect(badgeVariantForMachineLabel(null)).toBe("outline");
  });

  it("formats elapsed time in operator-friendly units", () => {
    expect(formatElapsed("2026-10-06T10:00:08.000Z", "2026-10-06T10:00:10.000Z")).toBe("2 s ago");
    expect(formatElapsed("2026-10-06T09:58:00.000Z", "2026-10-06T10:00:10.000Z")).toBe("2 min ago");
    expect(formatElapsed("2026-10-06T07:00:00.000Z", "2026-10-06T10:00:10.000Z")).toBe("3 h ago");
    expect(formatElapsed("2026-10-06T10:00:12.000Z", "2026-10-06T10:00:10.000Z")).toBe("0 s ago");
    expect(formatElapsed("bad", "2026-10-06T10:00:10.000Z")).toBeNull();
  });

  it("uses only declared feature units and never guesses", () => {
    const units = { VibrationX: "g", Temperature: "C", Slot9: null };
    expect(unitForLiveFeature("VibrationX", units)).toBe("g");
    expect(unitForLiveFeature("Temperature", units)).toBe("°C");
    expect(unitForLiveFeature("Slot9", units)).toBe("");
    expect(unitForLiveFeature("VibrationX")).toBe("");
    expect(isVibrationFeature("VibrationX")).toBe(true);
    expect(isVibrationFeature("v_rms_y")).toBe(true);
    expect(isVibrationFeature("Temperature")).toBe(false);
  });
});
