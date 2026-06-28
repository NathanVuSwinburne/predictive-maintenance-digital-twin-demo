import type { HistoryEventType, MachineStatus, Severity } from "@/lib/domain/types"

export function badgeVariantForMachineStatus(status: MachineStatus) {
  switch (status) {
    case "healthy":
      return "default" as const
    case "watch":
      return "secondary" as const
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
      return "default" as const
    case "critical":
      return "destructive" as const
    default:
      return "outline" as const
  }
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
    default:
      return type
  }
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso))
}
