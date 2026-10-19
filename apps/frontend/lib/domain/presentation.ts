import type {
  EntityLiveState,
  HistoryEventType,
  InformationSource,
  MachineTypeId,
  MachineStatus,
  Severity,
  TelemetryMetric,
} from "@/lib/domain/types"
import { formatAppDateTime, formatAppTimeWithSeconds } from "@/lib/time"

export type TelemetryMetricPresentation = {
  key: TelemetryMetric
  label: string
  unit: string
}

export function telemetryMetricsForMachine(
  machineType?: MachineTypeId,
): TelemetryMetricPresentation[] {
  if (machineType === "real-sensor" || machineType === "kaggle") {
    return [
      { key: "temperature", label: "Temperature", unit: "°C" },
      { key: "vibration", label: "Vibration", unit: "mm/s" },
    ]
  }

  if (machineType === "ai4i") {
    return [
      { key: "temperature", label: "Air Temperature", unit: "K" },
      { key: "vibration", label: "Torque Proxy", unit: "scaled Nm" },
      { key: "pressure", label: "Process Temperature", unit: "K" },
      { key: "power", label: "Rotational Speed", unit: "rpm" },
    ]
  }

  return [
    { key: "temperature", label: "Temperature", unit: "°C" },
    { key: "vibration", label: "Vibration", unit: "mm/s²" },
    { key: "pressure", label: "Pressure", unit: "bar" },
    { key: "power", label: "Power", unit: "kW" },
  ]
}

export const informationSourcePresentation: Record<
  InformationSource,
  { label: string; description: string; className: string }
> = {
  "live-machine-data": {
    label: "Live Machine Data",
    description: "Readings received from a connected machine data source.",
    className:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  "historical-machine-data": {
    label: "Historical Machine Data",
    description:
      "Stored readings from an earlier machine data capture. These readings are not live.",
    className:
      "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
  "ml-prediction": {
    label: "ML Prediction",
    description: "A result produced by an active machine-learning model.",
    className:
      "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  "simulated-data": {
    label: "Simulated Data",
    description: "Generated scenario data rather than observed machine readings.",
    className:
      "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  "knowledge-base": {
    label: "Knowledge Base",
    description: "Information retrieved from the project knowledge base.",
    className:
      "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  "ai-interpretation": {
    label: "AI Interpretation",
    description: "AI-generated interpretation that should be reviewed by a person.",
    className:
      "border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  },
}

export function badgeVariantForMachineStatus(status: MachineStatus) {
  switch (status) {
    case "healthy":
      return "success" as const
    case "watch":
      return "warning" as const
    case "risk":
      return "destructive" as const
    default:
      return "outline" as const
  }
}

export function badgeVariantForSeverity(severity: Severity) {
  switch (severity) {
    case "low":
      return "outline" as const
    case "medium":
      return "secondary" as const
    case "high":
      return "warning" as const
    case "critical":
      return "destructive" as const
    default:
      return "outline" as const
  }
}

/** Seconds after the last accepted MQTT message before a source stops counting as Live. */
export const LIVE_FRESHNESS_SECONDS = 15

export const liveStatePresentation: Record<
  EntityLiveState,
  {
    label: string
    variant: "success" | "warning" | "destructive" | "outline"
    description: string
  }
> = {
  live: {
    label: "Live",
    variant: "success",
    description: "Readings are arriving from the machine.",
  },
  stale: {
    label: "Stale",
    variant: "warning",
    description: "No new readings have arrived recently. Showing last-known values.",
  },
  reconnecting: {
    label: "Reconnecting",
    variant: "warning",
    description:
      "The machine's data connection was interrupted and is reconnecting automatically. Showing last-known values.",
  },
  disconnected: {
    label: "Disconnected",
    variant: "destructive",
    description: "The machine's data connection is down. Showing last-known values.",
  },
  waiting: {
    label: "Waiting for first message",
    variant: "outline",
    description: "Connected to the broker. No reading has arrived from the machine yet.",
  },
  "no-source": {
    label: "No live source",
    variant: "outline",
    description: "This machine has no live data connection.",
  },
}

export function badgeVariantForLiveState(state: EntityLiveState) {
  return liveStatePresentation[state].variant
}

/**
 * Freshness of a source from its last accepted message, judged against `nowMs`.
 * Callers pass the server clock when they have one so browser skew cannot fake Live.
 */
export function liveFreshnessState(
  lastMessageAt: string | null | undefined,
  nowMs: number,
  freshnessSeconds = LIVE_FRESHNESS_SECONDS,
): Extract<EntityLiveState, "live" | "stale" | "waiting"> {
  if (!lastMessageAt) return "waiting"
  const lastMs = new Date(lastMessageAt).getTime()
  if (Number.isNaN(lastMs)) return "waiting"
  return nowMs - lastMs <= freshnessSeconds * 1000 ? "live" : "stale"
}

const MACHINE_C_IDS = new Set(["entity-machine-c", "machine-c"])
const CMTK_FEATURES = ["VibrationX", "VibrationY", "VibrationZ", "Temperature"]

/**
 * True for machines whose low/medium/high labels mean vibration intensity level
 * (how strongly the machine is vibrating), not failure risk: Machine C, and any
 * machine on the CMTK sensor layout (vibration velocity RMS X/Y/Z + temperature)
 * that runs the Machine C vibration-level model. Other machines keep neutral
 * "status"/"prediction" wording because their labels can mean anything.
 */
export function usesVibrationLevelLabels(machine: {
  entityId?: string | null
  features?: readonly string[] | null
}) {
  if (machine.entityId && MACHINE_C_IDS.has(machine.entityId)) return true
  const features = new Set(machine.features ?? [])
  return CMTK_FEATURES.every((name) => features.has(name))
}

/** Maps a machine-reported or predicted low/medium/high label onto the shared severity scale. */
export function severityForMachineLabel(label: string | null | undefined): Severity | null {
  switch (label?.trim().toLowerCase()) {
    case "low":
      return "low"
    case "medium":
      return "medium"
    case "high":
      return "high"
    case "critical":
      return "critical"
    default:
      return null
  }
}

export function badgeVariantForMachineLabel(label: string | null | undefined) {
  const severity = severityForMachineLabel(label)
  return severity ? badgeVariantForSeverity(severity) : ("outline" as const)
}

/** Units come only from the machine's declared features (Machine C and the CMTK declare
 * vibration velocity RMS in mm/s and temperature in °C); guessing could mislabel another
 * machine's vibration signal. */
export function unitForLiveFeature(name: string, featureUnits?: Record<string, string | null>) {
  const declared = featureUnits?.[name]?.trim()
  if (!declared) return ""
  return declared === "C" ? "°C" : declared
}

export function isVibrationFeature(name: string) {
  const lower = name.toLowerCase()
  return lower.includes("vib") || lower.includes("rms")
}

export function formatElapsed(fromIso: string, toIso: string) {
  const elapsedMs = new Date(toIso).getTime() - new Date(fromIso).getTime()
  if (Number.isNaN(elapsedMs)) return null
  const seconds = Math.max(0, Math.round(elapsedMs / 1000))
  if (seconds < 60) return `${seconds} s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return `${hours} h ago`
}

export function progressColorForPercent(value: number) {
  if (value < 50) return "bg-destructive"
  if (value < 80) return "bg-warning"
  return "bg-success"
}

export function labelForEventType(type: HistoryEventType) {
  switch (type) {
    case "telemetry-anomaly":
      return "Telemetry Anomaly"
    case "fault-prediction":
      return "Fault Prediction"
    case "maintenance-action":
      return "Maintenance Action"
    case "simulation-run":
      return "Simulation Run"
    case "chat-insight":
      return "Chat Insight"
    case "failure-label":
      return "Failure Label"
    case "training-run":
      return "Training Run"
    case "model-import":
      return "Model Import"
    case "model-promotion":
      return "Model Promotion"
    default:
      return type
  }
}

/** Date and time in the app time zone (Melbourne by default; see `lib/time.ts`). */
export function formatDateTime(iso: string) {
  return formatAppDateTime(iso)
}

/** Time of day with seconds in the app time zone, for readings that arrive several times a minute. */
export function formatTimeWithSeconds(iso: string) {
  return formatAppTimeWithSeconds(iso)
}
