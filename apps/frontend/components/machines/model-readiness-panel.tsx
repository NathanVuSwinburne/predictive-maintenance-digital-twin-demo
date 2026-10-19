import {
  CheckCircleIcon,
  ClockCountdownIcon,
  DatabaseIcon,
  InfoIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { ErrorNotice } from "@/components/feedback/error-notice";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  ModelReadiness,
  ModelReadinessCheck,
  ModelReadinessState,
} from "@/lib/domain/types";
import type { UserFacingError } from "@/lib/errors/user-facing-error";

type Props = {
  readiness: ModelReadiness | null;
  isLoading?: boolean;
  error?: UserFacingError | null;
  compact?: boolean;
};

const stateLabels: Record<ModelReadinessState, string> = {
  "collecting-data": "Collecting data",
  ready: "Ready",
  stale: "Stale",
  "missing-sensor": "Missing sensor",
  "invalid-window": "Invalid window",
  "prediction-unavailable": "Prediction unavailable",
};

function stateTone(state: ModelReadinessState) {
  if (state === "ready") return "border-success/40 bg-success/5 text-success";
  if (state === "collecting-data")
    return "border-primary/40 bg-primary/5 text-primary";
  if (state === "stale")
    return "border-warning/50 bg-warning/10 text-foreground";
  if (state === "missing-sensor" || state === "invalid-window") {
    return "border-destructive/40 bg-destructive/5 text-destructive";
  }
  return "border-border bg-muted/20 text-muted-foreground";
}

function StateIcon({ state }: { state: ModelReadinessState }) {
  if (state === "ready") return <CheckCircleIcon weight="fill" />;
  if (state === "collecting-data") return <ClockCountdownIcon />;
  if (state === "stale") return <WarningCircleIcon weight="fill" />;
  if (state === "missing-sensor" || state === "invalid-window") {
    return <XCircleIcon weight="fill" />;
  }
  return <InfoIcon weight="fill" />;
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function CheckRow({ check }: { check: ModelReadinessCheck }) {
  const icon =
    check.status === "pass" ? (
      <CheckCircleIcon className="text-success" weight="fill" />
    ) : check.status === "fail" ? (
      <XCircleIcon className="text-destructive" weight="fill" />
    ) : check.status === "in-progress" ? (
      <ClockCountdownIcon className="text-primary" />
    ) : (
      <InfoIcon className="text-muted-foreground" />
    );

  return (
    <div className="flex items-start gap-2 py-2 text-sm">
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-medium">{check.label}</p>
        <p className="text-xs text-muted-foreground">{check.detail}</p>
      </div>
    </div>
  );
}

export function ModelReadinessPanel({
  readiness,
  isLoading = false,
  error = null,
  compact = false,
}: Props) {
  if (!readiness) {
    if (error) return <ErrorNotice error={error} />;
    return (
      <Card aria-live="polite">
        <CardHeader>
          <CardTitle className="text-sm">Model readiness</CardTitle>
          <CardDescription className="text-sm">
            {isLoading
                ? "Checking model requirements…"
                : "Model readiness has not been evaluated."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const progress = readiness.progress;

  return (
    <Card aria-live="polite" data-readiness-state={readiness.state}>
      <CardHeader className={compact ? "pb-3" : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm" role="heading" aria-level={2}>
              Model readiness
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            className={cn("gap-1", stateTone(readiness.state))}
          >
            <StateIcon state={readiness.state} />
            {stateLabels[readiness.state]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className={cn("border-l-2 pl-3 py-2", stateTone(readiness.state))}>
          {readiness.summary !== stateLabels[readiness.state] ? (
            <p className="font-medium text-foreground">{readiness.summary}</p>
          ) : null}
          <p className="mt-1 text-sm text-muted-foreground">
            {readiness.reason}
          </p>
        </div>

        {!compact && progress ? (
          <section aria-label="Observation progress" className="grid gap-2">
            <div className="flex flex-wrap items-end justify-between gap-2 text-sm">
              <div>
                <p className="font-medium tabular-nums">
                  {progress.observedRows.toLocaleString("en-AU")} of{" "}
                  {progress.requiredRows.toLocaleString("en-AU")} observations
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatDuration(progress.observedDurationSeconds)} of{" "}
                  {formatDuration(progress.requiredDurationSeconds)} minutes
                </p>
              </div>
              <span className="font-medium tabular-nums">
                {progress.percent}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Required observation window"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              className="h-2 overflow-hidden bg-muted"
            >
              <div
                className="h-full bg-primary transition-[width] motion-reduce:transition-none"
                style={{
                  width: `${Math.min(100, Math.max(0, progress.percent))}%`,
                }}
              />
            </div>
            {progress.estimatedRemainingSeconds ? (
              <p className="text-xs text-muted-foreground">
                {formatDuration(progress.estimatedRemainingSeconds)} remaining
                at the expected 500 ms cadence
              </p>
            ) : null}
          </section>
        ) : null}

        {!compact && readiness.sensors.length > 0 ? (
          <section aria-labelledby="sensor-requirements-title">
            <h3
              id="sensor-requirements-title"
              className="text-xs font-medium text-muted-foreground"
            >
              Required sensors
            </h3>
            <div className="mt-2 grid border-y border-border sm:grid-cols-2 xl:grid-cols-4">
              {readiness.sensors.map((sensor) => (
                <div
                  key={sensor.name}
                  className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 sm:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:last:border-r-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{sensor.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {sensor.unit ?? "No unit"}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-xs">
                    {sensor.status === "receiving" ? (
                      <CheckCircleIcon
                        className="text-success"
                        weight="fill"
                        aria-hidden="true"
                      />
                    ) : (
                      <XCircleIcon
                        className="text-destructive"
                        weight="fill"
                        aria-hidden="true"
                      />
                    )}
                    {sensor.status === "receiving"
                      ? "Receiving"
                      : sensor.status === "missing"
                        ? "Missing"
                        : "Invalid"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!compact && readiness.checks ? (
          <section aria-labelledby="window-checks-title">
            <h3
              id="window-checks-title"
              className="text-xs font-medium text-muted-foreground"
            >
              Window checks
            </h3>
            <div className="mt-1 grid divide-y divide-border border-y border-border md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="md:pr-3">
                <CheckRow check={readiness.checks.windowLength} />
              </div>
              <div className="md:px-3">
                <CheckRow check={readiness.checks.cadence} />
              </div>
              <div className="md:pl-3">
                <CheckRow check={readiness.checks.freshness} />
              </div>
            </div>
          </section>
        ) : null}

        <div className="flex items-start gap-2 border-t border-border pt-3 text-sm">
          <DatabaseIcon
            className="mt-0.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium">What&apos;s needed next</p>
            <p className="text-muted-foreground">{readiness.nextAction}</p>
          </div>
        </div>

        {error ? <ErrorNotice error={error} /> : null}
      </CardContent>
    </Card>
  );
}
