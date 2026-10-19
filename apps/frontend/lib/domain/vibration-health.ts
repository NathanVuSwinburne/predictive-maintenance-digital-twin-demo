import type {
  EngineeringVibrationProfile,
  EntityLiveObservation,
  EntityVibrationThresholds,
  VibrationBaselineValue,
} from "@/lib/domain/types";

/**
 * Vibration health checks for the Live Monitor: two independent questions, never
 * merged into one number.
 *
 * - Machine-specific: "is this unusual for this machine at its current vibration
 *   level?" → compare with the learned upper-normal boundary (P99 of the
 *   machine's own history for the same level and axis).
 * - Engineering: "is this objectively high for this class of machine?" → compare
 *   with a configured severity-zone reference, only when one applies.
 *
 * The live value is reduced exactly like the baseline windows: the RMS
 * (sqrt(mean(v²))) of the readings in the last `windowSeconds`, so one noisy
 * message cannot flip a check. A value equal to a boundary counts as inside it.
 */

export const VIBRATION_LEVELS = ["low", "medium", "high"] as const;
export type VibrationLevel = (typeof VIBRATION_LEVELS)[number];
export type LevelChoice = "auto" | VibrationLevel;
export const DEFAULT_LIVE_WINDOW_SECONDS = 5;
export const MIN_LIVE_WINDOW_SAMPLES = 3;

export type ResolvedLevel = {
  level: VibrationLevel | null;
  source: "predicted" | "manual" | "unknown";
};

export type LiveWindowValue = {
  value: number;
  samples: number;
  windowSeconds: number;
  /** Timestamp of the newest reading in the window. */
  at: string;
};

export type MachineCheckStatus =
  | "normal"
  | "above-normal"
  | "insufficient-data"
  | "level-unknown"
  | "no-reading";

export type MachineCheck = {
  status: MachineCheckStatus;
  current: number | null;
  threshold: number | null;
  level: VibrationLevel | null;
  /** The baseline is shown but rests on few sessions (e.g. MEDIUM). */
  provisional: boolean;
  baseline: VibrationBaselineValue | null;
};

export type EngineeringCheckStatus =
  | "within-limit"
  | "elevated"
  | "critical"
  | "not-configured"
  | "incompatible"
  | "no-reading";

export type EngineeringCheck = {
  status: EngineeringCheckStatus;
  current: number | null;
  /** Zone B/C boundary: the engineering limit. */
  limit: number | null;
  /** Zone C/D boundary. */
  severeLimit: number | null;
  zone: "A/B" | "C" | "D" | null;
  /** Configured but not confirmed for this machine. */
  provisional: boolean;
  profile: EngineeringVibrationProfile | null;
};

export type AxisHealth = {
  feature: string;
  axis: string;
  unit: string;
  live: LiveWindowValue | null;
  machine: MachineCheck;
  engineering: EngineeringCheck;
};

export type VibrationHealth = {
  level: ResolvedLevel;
  axes: AxisHealth[];
  machineSummary: MachineCheckStatus;
  engineeringSummary: EngineeringCheckStatus;
  interpretation: string;
};

export function isVibrationLevel(value: string | null | undefined): value is VibrationLevel {
  return typeof value === "string" && (VIBRATION_LEVELS as readonly string[]).includes(value.trim().toLowerCase());
}

export function isValidReading(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** "VibrationX" → "X"; anything else keeps its name. */
export function axisOf(feature: string) {
  const match = /([XYZ])$/i.exec(feature.trim());
  return match ? match[1].toUpperCase() : feature;
}

export function resolveLevel(choice: LevelChoice, predictedLabel: string | null | undefined): ResolvedLevel {
  if (choice !== "auto") return { level: choice, source: "manual" };
  if (isVibrationLevel(predictedLabel)) {
    return { level: predictedLabel.trim().toLowerCase() as VibrationLevel, source: "predicted" };
  }
  return { level: null, source: "unknown" };
}

/** RMS of the readings in the last `windowSeconds` before the newest valid reading. */
export function liveWindowRms(
  observations: EntityLiveObservation[],
  feature: string,
  windowSeconds = DEFAULT_LIVE_WINDOW_SECONDS,
  minSamples = MIN_LIVE_WINDOW_SAMPLES,
): LiveWindowValue | null {
  const points = observations
    .map((observation) => ({ at: observation.timestamp, t: Date.parse(observation.timestamp), v: observation.values[feature] }))
    .filter((point): point is { at: string; t: number; v: number } => Number.isFinite(point.t) && isValidReading(point.v));
  if (points.length === 0) return null;
  const newest = points.reduce((latest, point) => (point.t > latest.t ? point : latest));
  const inWindow = points.filter((point) => point.t > newest.t - windowSeconds * 1000 && point.t <= newest.t);
  if (inWindow.length < minSamples) return null;
  const meanSquare = inWindow.reduce((sum, point) => sum + point.v * point.v, 0) / inWindow.length;
  return { value: Math.sqrt(meanSquare), samples: inWindow.length, windowSeconds, at: newest.at };
}

/** The learned baseline for exactly this level and feature (never a global maximum). */
export function selectMachineThreshold(
  thresholds: EntityVibrationThresholds | null | undefined,
  level: VibrationLevel | null,
  feature: string,
): VibrationBaselineValue | null {
  if (!thresholds || !level) return null;
  return (
    thresholds.machineSpecific.baselines.find(
      (baseline) => baseline.level.toLowerCase() === level && baseline.feature === feature,
    ) ?? null
  );
}

export function evaluateMachineSpecific(
  current: number | null | undefined,
  baseline: VibrationBaselineValue | null,
  level: VibrationLevel | null,
): MachineCheck {
  const base = {
    current: isValidReading(current) ? current : null,
    threshold: baseline?.value ?? null,
    level,
    provisional: baseline?.reliability === "limited",
    baseline,
  };
  if (!level) return { ...base, status: "level-unknown" };
  if (!baseline || baseline.reliability === "insufficient" || !isValidReading(baseline.value)) {
    return { ...base, threshold: null, provisional: false, status: "insufficient-data" };
  }
  if (!isValidReading(current)) return { ...base, status: "no-reading" };
  return { ...base, status: current > baseline.value ? "above-normal" : "normal" };
}

/** Whether an engineering profile may be compared with this feature at all. */
export function engineeringProfileFor(
  thresholds: EntityVibrationThresholds | null | undefined,
  feature: string,
): { profile: EngineeringVibrationProfile | null; usable: boolean; provisional: boolean } {
  const engineering = thresholds?.engineering;
  if (!engineering?.profile) return { profile: null, usable: false, provisional: false };
  const usable =
    (engineering.status === "confirmed" || engineering.status === "provisional") &&
    engineering.applicableFeatures.includes(feature);
  return { profile: engineering.profile, usable, provisional: engineering.status === "provisional" };
}

export function evaluateEngineering(
  current: number | null | undefined,
  thresholds: EntityVibrationThresholds | null | undefined,
  feature: string,
): EngineeringCheck {
  const { profile, usable, provisional } = engineeringProfileFor(thresholds, feature);
  const value = isValidReading(current) ? current : null;
  const empty = { current: value, limit: null, severeLimit: null, zone: null, provisional: false, profile };
  if (!profile || thresholds?.engineering.status === "not-configured" || thresholds?.engineering.status === "unknown-profile") {
    return { ...empty, status: "not-configured" };
  }
  if (!usable) return { ...empty, status: "incompatible" };
  const configured = { ...empty, limit: profile.zoneBC, severeLimit: profile.zoneCD, provisional };
  if (value === null) return { ...configured, status: "no-reading" };
  if (value > profile.zoneCD) return { ...configured, zone: "D", status: "critical" };
  if (value > profile.zoneBC) return { ...configured, zone: "C", status: "elevated" };
  return { ...configured, zone: "A/B", status: "within-limit" };
}

const MACHINE_RANK: Record<MachineCheckStatus, number> = {
  "above-normal": 4,
  normal: 3,
  "insufficient-data": 2,
  "no-reading": 1,
  "level-unknown": 0,
};
const ENGINEERING_RANK: Record<EngineeringCheckStatus, number> = {
  critical: 5,
  elevated: 4,
  "within-limit": 3,
  "no-reading": 2,
  incompatible: 1,
  "not-configured": 0,
};

/** Worst status across axes (the standards evaluate the largest value in any direction). */
export function summariseMachine(checks: MachineCheck[]): MachineCheckStatus {
  if (checks.length === 0) return "no-reading";
  return checks.reduce((worst, check) => (MACHINE_RANK[check.status] > MACHINE_RANK[worst] ? check.status : worst), checks[0].status);
}

export function summariseEngineering(checks: EngineeringCheck[]): EngineeringCheckStatus {
  if (checks.length === 0) return "not-configured";
  return checks.reduce(
    (worst, check) => (ENGINEERING_RANK[check.status] > ENGINEERING_RANK[worst] ? check.status : worst),
    checks[0].status,
  );
}

/** One conservative sentence about how the two checks relate. Never predicts failure. */
export function interpretChecks(machine: MachineCheckStatus, engineering: EngineeringCheckStatus): string {
  const engineeringHigh = engineering === "elevated" || engineering === "critical";
  const engineeringKnown = engineeringHigh || engineering === "within-limit";
  if (machine === "level-unknown") {
    return "The vibration level is not known yet, so the machine-specific check waits for a prediction or a chosen level.";
  }
  if (machine === "insufficient-data") {
    return "There is not enough history at this vibration level to say what is normal for this machine.";
  }
  if (machine === "no-reading") return "No recent vibration reading to check.";
  if (machine === "above-normal" && engineeringHigh) {
    return "Vibration is unusual for this machine and above the engineering limit. Inspect the machine.";
  }
  if (machine === "above-normal" && engineeringKnown) {
    return "This is unusual for this machine, but still below the engineering severity limit.";
  }
  if (machine === "above-normal") {
    return "This is unusual for this machine at this vibration level. No engineering limit is configured to judge absolute severity.";
  }
  if (engineeringHigh) {
    return "The machine usually operates like this, but the absolute vibration is high by the engineering reference.";
  }
  if (engineeringKnown) return "Vibration is within this machine's normal range and below the engineering limit.";
  return "Vibration is within this machine's normal range for this level. No engineering limit is configured.";
}

export function evaluateVibrationHealth({
  observations,
  thresholds,
  features,
  units,
  choice,
  predictedLabel,
  windowSeconds = DEFAULT_LIVE_WINDOW_SECONDS,
}: {
  observations: EntityLiveObservation[];
  thresholds: EntityVibrationThresholds | null | undefined;
  features: string[];
  units: Record<string, string | null | undefined>;
  choice: LevelChoice;
  predictedLabel: string | null | undefined;
  windowSeconds?: number;
}): VibrationHealth {
  const level = resolveLevel(choice, predictedLabel);
  const axes = features.map((feature): AxisHealth => {
    const live = liveWindowRms(observations, feature, windowSeconds);
    const baseline = selectMachineThreshold(thresholds, level.level, feature);
    return {
      feature,
      axis: axisOf(feature),
      unit: units[feature] ?? "",
      live,
      machine: evaluateMachineSpecific(live?.value, baseline, level.level),
      engineering: evaluateEngineering(live?.value, thresholds, feature),
    };
  });
  const machineSummary = summariseMachine(axes.map((axis) => axis.machine));
  const engineeringSummary = summariseEngineering(axes.map((axis) => axis.engineering));
  return { level, axes, machineSummary, engineeringSummary, interpretation: interpretChecks(machineSummary, engineeringSummary) };
}

export const MACHINE_STATUS_COPY: Record<MachineCheckStatus, string> = {
  normal: "Normal",
  "above-normal": "Above normal",
  "insufficient-data": "Not enough history",
  "level-unknown": "Level unknown",
  "no-reading": "No reading",
};

export const ENGINEERING_STATUS_COPY: Record<EngineeringCheckStatus, string> = {
  "within-limit": "Within limit",
  elevated: "Elevated",
  critical: "Critical",
  "not-configured": "Not configured",
  incompatible: "Not comparable",
  "no-reading": "No reading",
};

export function formatMmPerSecond(value: number | null | undefined, unit = "mm/s") {
  if (!isValidReading(value)) return "—";
  return `${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unit}`.trim();
}

export function levelName(level: VibrationLevel | null) {
  return level ? level.toUpperCase() : "—";
}

/** "99th percentile of HIGH-X history" style caption. */
export function machineThresholdCaption(thresholds: EntityVibrationThresholds | null | undefined, check: MachineCheck, axis: string) {
  const percentile = thresholds?.machineSpecific.percentile ?? 99;
  const ordinal = `${percentile % 1 === 0 ? percentile.toFixed(0) : percentile}th percentile`;
  const caption = `${ordinal} of ${levelName(check.level)}-${axis} history`;
  return check.provisional ? `${caption} · provisional (few sessions)` : caption;
}

export function engineeringCaption(check: EngineeringCheck) {
  if (!check.profile || check.limit === null) return null;
  const base = `${check.profile.title} · zone B/C`;
  return check.provisional ? `${base} · not confirmed for this machine` : base;
}
