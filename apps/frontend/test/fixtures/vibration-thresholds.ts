import type {
  EngineeringVibrationProfile,
  EntityVibrationThresholds,
  VibrationBaselineValue,
} from "@/lib/domain/types";

/** Synthetic learned baselines (mm/s, round numbers) with engineering not configured by default. */
export const FEATURES = ["VibrationX", "VibrationY", "VibrationZ"];

export function baseline(level: string, feature: string, value: number | null, reliability: VibrationBaselineValue["reliability"] = "ok"): VibrationBaselineValue {
  return { level, feature, value, unit: "mm/s", reliability, sessions: 50, windows: 1000, samples: 10000, median: 0.2 };
}

export const profile: EngineeringVibrationProfile = {
  id: "iso20816-3-group2-rigid",
  standard: "ISO 20816-3:2022",
  title: "ISO 20816-3 · Group 2 · rigid support",
  machineGroup: "Group 2 (15–300 kW)",
  supportClass: "Rigid",
  measurement: "Broadband RMS velocity",
  frequencyBand: "10–1000 Hz",
  unit: "mm/s",
  zoneAB: 1.4,
  zoneBC: 2.8,
  zoneCD: 4.5,
  scope: "",
  evaluation: "",
  references: [],
};

export function thresholds(engineering: Partial<EntityVibrationThresholds["engineering"]> = {}): EntityVibrationThresholds {
  return {
    entityId: "entity-demo-drive",
    features: FEATURES,
    featureUnits: { VibrationX: "mm/s", VibrationY: "mm/s", VibrationZ: "mm/s" },
    machineSpecific: {
      method: "session-weighted-window-percentile",
      percentile: 99,
      windowSeconds: 5,
      windowAggregation: "rms",
      minSamplesPerWindow: 3,
      minSessions: 3,
      minWindows: 30,
      reliableSessions: 10,
      excludesLiveData: true,
      readings: 60000,
      sessions: 50,
      computedAt: "2026-10-06T00:00:00Z",
      description: "",
      baselines: [
        baseline("low", "VibrationX", 0.5),
        baseline("low", "VibrationY", 0.7),
        baseline("low", "VibrationZ", 0.55),
        baseline("medium", "VibrationX", 0.6, "limited"),
        baseline("medium", "VibrationY", null, "insufficient"),
        baseline("medium", "VibrationZ", 0.4, "limited"),
        baseline("high", "VibrationX", 0.9),
        baseline("high", "VibrationY", 1.2),
        baseline("high", "VibrationZ", 1.0),
      ],
    },
    engineering: {
      status: "not-configured",
      message: "Not configured.",
      profile: null,
      applicableFeatures: [],
      requiredMeasurement: "Broadband RMS velocity",
      note: null,
      ...engineering,
    },
    availableProfiles: [profile],
  };
}

export const configured = (status: "provisional" | "confirmed" = "confirmed") =>
  thresholds({ status, profile, applicableFeatures: FEATURES, message: "" });

