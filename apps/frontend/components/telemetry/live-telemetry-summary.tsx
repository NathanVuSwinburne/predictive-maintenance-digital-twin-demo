import { Badge } from "@/components/ui/badge";
import { SourceAttribution } from "@/components/provenance/source-attribution";
import type { TelemetryConnectionState } from "@/hooks/use-live-telemetry";
import {
  formatDateTime,
  telemetryMetricsForMachine,
} from "@/lib/domain/presentation";
import type {
  InformationProvenance,
  MachineTypeId,
  TelemetryPoint,
} from "@/lib/domain/types";

type LiveTelemetrySummaryProps = {
  latestPoint: TelemetryPoint | null;
  connectionState: TelemetryConnectionState;
  isStale: boolean;
  lastCheckedAt: Date | null;
  provenance?: InformationProvenance | null;
  machineType?: MachineTypeId;
};

const connectionLabels: Record<TelemetryConnectionState, string> = {
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
};

function connectionVariant(state: TelemetryConnectionState) {
  if (state === "disconnected") return "destructive" as const;
  if (state === "reconnecting") return "warning" as const;
  if (state === "connected") return "success" as const;
  return "outline" as const;
}

function formatSampleTimestamp(timestamp: string) {
  if (timestamp.startsWith("row-")) return `Sample ${timestamp}`;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime())
    ? `Sample ${timestamp}`
    : formatDateTime(timestamp);
}

function formatReading(value: number) {
  return value.toLocaleString("en-AU", { maximumFractionDigits: 2 });
}

function statusMessage(
  connectionState: TelemetryConnectionState,
  latestPoint: TelemetryPoint | null,
  isStale: boolean,
) {
  if (
    latestPoint &&
    (connectionState === "reconnecting" || connectionState === "disconnected")
  ) {
    return "Showing last-known values.";
  }
  if (connectionState === "connecting") return "Connecting to telemetry…";
  if (connectionState === "reconnecting") {
    return "Connection interrupted. Trying again automatically.";
  }
  if (connectionState === "disconnected") {
    return "Telemetry connection unavailable.";
  }
  if (!latestPoint) return "No sensor data is available for this machine yet.";
  if (isStale) return "No new data samples received.";
  return "Telemetry is up to date.";
}

export function LiveTelemetrySummary({
  latestPoint,
  connectionState,
  isStale,
  lastCheckedAt,
  provenance,
  machineType,
}: LiveTelemetrySummaryProps) {
  const metrics = telemetryMetricsForMachine(machineType);

  return (
    <div className="flex flex-col gap-3 border-y border-border py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            !latestPoint && connectionState === "connected"
              ? "outline"
              : connectionVariant(connectionState)
          }
        >
          {!latestPoint && connectionState === "connected"
            ? "No Data"
            : connectionLabels[connectionState]}
        </Badge>
        {latestPoint && isStale ? (
          <Badge variant="warning">Stale data</Badge>
        ) : null}
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {statusMessage(connectionState, latestPoint, isStale)}
        </p>
        {provenance?.outputSources.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Data source:</span>
            <SourceAttribution provenance={provenance} />
          </div>
        ) : null}
      </div>

      {latestPoint ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.key}
              className="border border-border px-3 py-2 text-sm"
            >
              <p className="text-xs text-muted-foreground">
                {metric.label} ({metric.unit})
              </p>
              <p className="font-medium tabular-nums">
                {formatReading(latestPoint[metric.key])}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Last data sample:{" "}
          {latestPoint
            ? formatSampleTimestamp(latestPoint.timestamp)
            : "Not available"}
        </span>
        <span>
          Last checked:{" "}
          {lastCheckedAt ? formatDateTime(lastCheckedAt.toISOString()) : "-"}
        </span>
      </div>
    </div>
  );
}
