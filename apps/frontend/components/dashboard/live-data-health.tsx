"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { WarningIcon } from "@phosphor-icons/react";

import { LiveStateBadge } from "@/components/live/live-state-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  badgeVariantForMachineLabel,
  formatElapsed,
  formatTimeWithSeconds,
  liveStatePresentation,
  severityForMachineLabel,
  usesVibrationLevelLabels,
} from "@/lib/domain/presentation";
import type {
  CanonicalMachine,
  EntityLiveHealth,
  EntityLiveState,
  FleetLiveHealth,
  Severity,
} from "@/lib/domain/types";
import type { UserFacingError } from "@/lib/errors/user-facing-error";
import { cn } from "@/lib/utils";

const LABEL_ORDER = ["low", "medium", "high", "critical"];

/** Feed problems first, so a machine that stopped sending is never below a healthy one. */
const STATE_ORDER: EntityLiveState[] = [
  "disconnected",
  "reconnecting",
  "stale",
  "live",
  "waiting",
  "no-source",
];

const severitySegmentClass: Record<Severity, string> = {
  low: "bg-success/70",
  medium: "bg-warning/70",
  high: "bg-destructive/70",
  critical: "bg-destructive",
};

/** Labels outside low/medium/high/critical carry no severity, so they get neutral colours. */
const neutralSegmentColours = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function orderedProbabilities(probabilities: Record<string, number>) {
  const rank = (label: string) => {
    const index = LABEL_ORDER.indexOf(label.toLowerCase());
    return index === -1 ? LABEL_ORDER.length : index;
  };
  return Object.entries(probabilities)
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

function notAssessedReason(health: EntityLiveHealth) {
  if (health.state === "no-source") return "This machine has no live data connection.";
  switch (health.inference.status) {
    case "waiting":
      return "Waiting for enough live readings to run the first prediction.";
    case "disabled":
      return "Automatic live prediction is turned off.";
    case "error":
      return "The last prediction could not run. It will try again automatically.";
    default:
      return "No live prediction model is active for this machine.";
  }
}

/**
 * The connection to our own server wins over the last payload: when the last
 * refresh failed, a machine that was live is shown as reconnecting, not live.
 */
export function shownLiveState(state: EntityLiveState, refreshFailed: boolean): EntityLiveState {
  return refreshFailed && state === "live" ? "reconnecting" : state;
}

type LivePredictionBarProps = {
  health: EntityLiveHealth | null;
  serverTime: string | null;
  className?: string;
};

/**
 * The dashboard risk bar: the latest automatic prediction for the machine's live
 * feed, as one stacked bar of class probabilities. For vibration machines the
 * labels are the vibration level, and the bar says so; it is never called a
 * failure risk. Without a live prediction the bar says "Not assessed".
 */
export function LivePredictionBar({ health, serverTime, className }: LivePredictionBarProps) {
  const vibration = health
    ? usesVibrationLevelLabels({ entityId: health.entityId, features: health.features })
    : false;
  const heading = vibration ? "Vibration level" : "Predicted status";
  const latest = health?.inference.latest ?? null;

  if (!health || !latest || !latest.predictedLabel) {
    return (
      <div className={cn("min-w-0 flex-1", className)} data-testid="live-prediction-bar">
        <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{heading}</span>
          <span className="font-medium">Not assessed</span>
        </div>
        <div className="h-1.5 w-full bg-muted" aria-hidden="true" />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {health ? notAssessedReason(health) : "Live status is not available yet."}
        </p>
      </div>
    );
  }

  const segments = orderedProbabilities(latest.probabilities);
  const confidence = latest.probabilities[latest.predictedLabel];
  const age = serverTime ? formatElapsed(latest.generatedAt, serverTime) : null;
  const feedStopped = health.state !== "live";
  const neutralLabels = segments
    .map(([label]) => label)
    .filter((label) => !severityForMachineLabel(label));

  return (
    <div className={cn("min-w-0 flex-1", className)} data-testid="live-prediction-bar">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">{heading}</span>
        <span className="flex items-center gap-2">
          <Badge variant={badgeVariantForMachineLabel(latest.predictedLabel)} className="uppercase">
            {latest.predictedLabel}
          </Badge>
          {typeof confidence === "number" ? (
            <span className="font-medium tabular-nums">{formatPercent(confidence)}</span>
          ) : null}
        </span>
      </div>
      <div
        className={cn("flex h-1.5 w-full overflow-hidden bg-muted", feedStopped && "opacity-50")}
        role="img"
        aria-label={`${heading} probabilities: ${segments
          .map(([label, value]) => `${label} ${formatPercent(value)}`)
          .join(", ")}`}
      >
        {segments.map(([label, value]) => {
          const severity = severityForMachineLabel(label);
          const style: CSSProperties = { flexGrow: value };
          if (!severity) {
            style.backgroundColor =
              neutralSegmentColours[neutralLabels.indexOf(label) % neutralSegmentColours.length];
          }
          return (
            <div
              key={label}
              className={severity ? severitySegmentClass[severity] : undefined}
              style={style}
              title={`${label}: ${formatPercent(value)}`}
            />
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {feedStopped ? "Last prediction before the feed stopped" : "Updated"}
        {age ? ` ${age}` : ""} · {latest.modelName} v{latest.modelVersion}
      </p>
    </div>
  );
}

type LiveDataHealthContentProps = {
  machines: CanonicalMachine[];
  fleet: FleetLiveHealth | null;
  isLoading: boolean;
  error: UserFacingError | null;
  lastCheckedAt: Date | null;
};

function feedDetail(health: EntityLiveHealth, serverTime: string) {
  if (!health.source) return liveStatePresentation["no-source"].description;
  if (!health.source.lastMessageAt) return "No reading has arrived yet.";
  const age = formatElapsed(health.source.lastMessageAt, serverTime);
  return age ? `Last reading ${age}` : "Last reading time is unknown.";
}

/** Fleet live data health: feed state, last reading, row counts and the risk bar for each machine. */
export function LiveDataHealthContent({
  machines,
  fleet,
  isLoading,
  error,
  lastCheckedAt,
}: LiveDataHealthContentProps) {
  const byId = new Map(fleet?.machines.map((health) => [health.entityId, health]) ?? []);
  const refreshFailed = error !== null;
  const rows = machines
    .map((machine) => {
      const health = byId.get(machine.id) ?? null;
      const state = shownLiveState(health?.state ?? "no-source", refreshFailed);
      return { machine, health, state };
    })
    .sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
  const counts = STATE_ORDER.map((state) => ({
    state,
    count: rows.filter((row) => row.state === state).length,
  })).filter(({ count }) => count > 0);
  const showsVibration = rows.some(
    ({ health }) =>
      health?.inference.latest &&
      usesVibrationLevelLabels({ entityId: health.entityId, features: health.features }),
  );

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm" id="live-data-health-heading">
              Live Data Health
            </CardTitle>
            <CardDescription className="mt-1 text-sm leading-relaxed">
              Whether each machine is sending live readings, and the latest live prediction.
              {showsVibration
                ? " For vibration machines, the bar shows the predicted vibration level (low, medium or high). It is not a failure risk."
                : ""}
            </CardDescription>
          </div>
          {fleet ? (
            <div className="flex flex-wrap items-center gap-2" aria-label="Live feed summary">
              {counts.map(({ state, count }) => (
                <LiveStateBadge
                  key={state}
                  state={state}
                  label={`${count} ${liveStatePresentation[state].label}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? (
          <p className="flex items-start gap-2 text-sm" role="status">
            <WarningIcon aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
            <span>
              The live status could not be refreshed. {error.message}
            </span>
          </p>
        ) : null}
        {!fleet ? (
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Checking live data…" : "Live status is not available."}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No machines available.</p>
        ) : (
          <ul className="border border-border" aria-labelledby="live-data-health-heading">
            {rows.map(({ machine, health, state }) => {
              const rejected = health?.source?.rejectedRows ?? 0;
              return (
                <li
                  key={machine.id}
                  className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-6"
                  data-testid={`live-health-${machine.id}`}
                >
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={health?.source ? `/monitor/${machine.id}` : `/machines/${machine.id}`}
                        className="truncate text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {machine.name}
                      </Link>
                      <LiveStateBadge state={state} />
                    </div>
                    {health && fleet ? (
                      <p className="text-xs text-muted-foreground">
                        {feedDetail(health, fleet.serverTime)}
                        {health.source ? (
                          <>
                            {" · "}
                            <span className="tabular-nums">
                              {health.source.acceptedRows.toLocaleString("en-AU")}
                            </span>{" "}
                            rows accepted
                            {" · "}
                            <span
                              className={cn(
                                "tabular-nums",
                                rejected > 0 && "font-medium text-foreground",
                              )}
                            >
                              {rejected.toLocaleString("en-AU")}
                            </span>{" "}
                            rejected
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    {health?.source?.lastError ? (
                      <p className="flex items-start gap-1.5 text-xs">
                        <WarningIcon aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
                        <span className="break-words">Last source issue: {health.source.lastError}</span>
                      </p>
                    ) : null}
                  </div>
                  <LivePredictionBar
                    health={health ? { ...health, state } : null}
                    serverTime={fleet.serverTime}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {lastCheckedAt ? (
          <p className="text-xs text-muted-foreground">
            Checked {formatTimeWithSeconds(lastCheckedAt.toISOString())}. Updates every 5 seconds.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
