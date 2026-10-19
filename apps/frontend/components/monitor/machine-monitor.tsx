"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowsLeftRightIcon,
  BroadcastIcon,
  CpuIcon,
  HourglassIcon,
  PencilSimpleIcon,
  TagIcon,
} from "@phosphor-icons/react";

import { ErrorNotice } from "@/components/feedback/error-notice";
import {
  activityItems,
  confidenceFor,
  displayState,
  liveLabelCopy,
} from "@/components/live/live-machine-panel";
import { LiveStateBadge } from "@/components/live/live-state-badge";
import { EditMachineDetailsDialog } from "@/components/monitor/edit-machine-details-dialog";
import { HorizonFeatureChart, type ChartThresholds } from "@/components/monitor/horizon-feature-chart";
import { VibrationHealthCard } from "@/components/monitor/vibration-health-card";
import { Vibration3DView } from "@/components/monitor/vibration-3d-view";
import { SourceAttribution } from "@/components/provenance/source-attribution";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataProvider } from "@/hooks/use-data-provider";
import { useEntityLiveStatus } from "@/hooks/use-entity-live-status";
import type { TelemetryConnectionState } from "@/hooks/use-live-telemetry";
import { horizonUnavailableCopy } from "@/lib/domain/live-horizon";
import { hasVibrationVector } from "@/lib/domain/vibration-3d";
import {
  badgeVariantForMachineLabel,
  formatElapsed,
  formatTimeWithSeconds,
  isVibrationFeature,
  unitForLiveFeature,
} from "@/lib/domain/presentation";
import type { CmtkMachine, CmtkSetup, EntityLiveStatus, EntityVibrationThresholds } from "@/lib/domain/types";
import {
  ENGINEERING_STATUS_COPY,
  engineeringCaption,
  evaluateVibrationHealth,
  machineThresholdCaption,
  type AxisHealth,
  type LevelChoice,
} from "@/lib/domain/vibration-health";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";
import { appTimeZoneCaption } from "@/lib/time";

export const MONITOR_OBSERVATION_LIMIT = 300;
/** Learned baselines change only when historical data changes; refresh rarely. */
export const THRESHOLDS_REFRESH_MS = 10 * 60_000;

/** The two reference lines for one vibration chart, with the reason when one is missing. */
export function chartThresholdsFor(
  axis: AxisHealth,
  machineName: string,
  thresholds: EntityVibrationThresholds | null,
): ChartThresholds {
  const machine = axis.machine;
  const engineering = axis.engineering;
  const machineUnavailable =
    machine.status === "level-unknown"
      ? "No vibration level yet, so no level-specific normal range to draw."
      : machine.status === "insufficient-data"
        ? `Not enough ${machine.level?.toUpperCase() ?? ""} history for this axis to learn a normal range.`
        : null;
  const engineeringUnavailable =
    engineering.limit === null
      ? engineering.status === "incompatible"
        ? "Not comparable: this measurement does not match the engineering reference."
        : `${ENGINEERING_STATUS_COPY["not-configured"]}: machine class and measurement band need confirmation.`
      : null;
  return {
    machine:
      machine.threshold !== null
        ? {
            value: machine.threshold,
            label: `${machineName} normal upper bound`,
            caption: machineThresholdCaption(thresholds, machine, axis.axis),
          }
        : null,
    machineUnavailable,
    engineering:
      engineering.limit !== null
        ? {
            value: engineering.limit,
            label: engineering.provisional ? "Engineering limit (unconfirmed)" : "Engineering limit",
            caption: engineeringCaption(engineering) ?? "",
          }
        : null,
    engineeringUnavailable,
  };
}

function formatReading(value: number) {
  return value.toLocaleString("en-AU", { maximumFractionDigits: 3 });
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

/** Vibration first, then the remaining numeric values alphabetically. */
export function monitorFeatures(status: EntityLiveStatus) {
  const names = new Set(status.features);
  for (const observation of status.observations) {
    for (const [key, value] of Object.entries(observation.values)) {
      if (typeof value === "number") names.add(key);
    }
  }
  return [...names]
    .filter((name) => status.observations.some((observation) => typeof observation.values[name] === "number"))
    .sort((a, b) => {
      const aVibration = isVibrationFeature(a) ? 0 : 1;
      const bVibration = isVibrationFeature(b) ? 0 : 1;
      return aVibration - bVibration || a.localeCompare(b);
    });
}

type MachineMonitorContentProps = {
  status: EntityLiveStatus | null;
  connectionState: TelemetryConnectionState;
  error: UserFacingError | null;
  lastCheckedAt: Date | null;
  /** CMTK registration details when known (name/description come from here first). */
  machine?: CmtkMachine | null;
  /** How many machines are connected to the CMTK; >1 shows "Switch machine". */
  machineCount?: number;
  onEditDetails?: () => void;
  /**
   * Vibration thresholds for the Health checks card and chart lines. Undefined hides
   * them (older callers); null means still loading or unavailable.
   */
  thresholds?: EntityVibrationThresholds | null;
  thresholdsError?: string | null;
};

export function MachineMonitorContent({
  status,
  connectionState,
  error,
  lastCheckedAt,
  machine,
  machineCount = 1,
  onEditDetails,
  thresholds,
  thresholdsError = null,
}: MachineMonitorContentProps) {
  const features = useMemo(() => (status ? monitorFeatures(status) : []), [status]);
  const activity = useMemo(() => (status ? activityItems(status) : []), [status]);
  const [levelChoice, setLevelChoice] = useState<LevelChoice>("auto");
  const vibrationFeatures = useMemo(() => features.filter(isVibrationFeature), [features]);
  const predictedLabel = status?.inference.latest?.predictedLabel ?? null;
  const health = useMemo(
    () =>
      status && thresholds !== undefined && vibrationFeatures.length > 0
        ? evaluateVibrationHealth({
            observations: status.observations,
            thresholds,
            features: vibrationFeatures,
            units: Object.fromEntries(
              vibrationFeatures.map((feature) => [feature, unitForLiveFeature(feature, status.featureUnits)]),
            ),
            choice: levelChoice,
            predictedLabel,
          })
        : null,
    [levelChoice, predictedLabel, status, thresholds, vibrationFeatures],
  );

  if (!status) {
    return (
      <Card aria-busy="true">
        <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
          <HourglassIcon aria-hidden="true" className="animate-pulse" size={20} />
          {error ? <ErrorNotice error={error} /> : "Connecting to the machine…"}
        </CardContent>
      </Card>
    );
  }

  const name = machine?.name ?? status.entityName;
  const description = machine?.description?.trim() || null;
  const shown = displayState(status.state, connectionState);
  const latest = status.observations.at(-1) ?? null;
  const latestAgo = latest ? formatElapsed(latest.receivedAt, status.serverTime) : null;
  const showingLastKnown = shown.state !== "live" && latest !== null;
  const waitingForFirstReading = status.state === "waiting" || latest === null;
  const inference = status.inference.latest;
  const inferenceConfidence = inference ? confidenceFor(inference) : null;
  const reportedLabel = status.latestLabel;
  const agreesWithMachine =
    inference?.predictedLabel && reportedLabel
      ? inference.predictedLabel.toLowerCase() === reportedLabel.label.toLowerCase()
      : null;
  const horizonCopy = horizonUnavailableCopy(status.horizon);
  const showVibration3D = hasVibrationVector(features);
  const labelCopy = liveLabelCopy(status);

  const header = (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-2xl font-semibold">{name}</CardTitle>
            {description ? <CardDescription className="text-sm">{description}</CardDescription> : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                <BroadcastIcon data-icon="inline-start" aria-hidden="true" />
                CMTK
              </Badge>
              <LiveStateBadge
                state={shown.state}
                label={shown.state === "waiting" ? "Waiting for first reading" : undefined}
              />
              {showingLastKnown ? <Badge variant="warning">Showing last-known values</Badge> : null}
              {status.provenance?.outputSources.length ? (
                <SourceAttribution provenance={status.provenance} />
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {machineCount > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/monitor?choose=1">
                  <ArrowsLeftRightIcon data-icon="inline-start" aria-hidden="true" />
                  Switch machine
                </Link>
              </Button>
            ) : null}
            {onEditDetails ? (
              <Button type="button" variant="outline" size="sm" onClick={onEditDetails}>
                <PencilSimpleIcon data-icon="inline-start" aria-hidden="true" />
                Edit machine details
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        <p className="text-muted-foreground" aria-live="polite">
          {shown.message}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Last reading:{" "}
            {latest
              ? `${formatTimeWithSeconds(latest.timestamp)}${latestAgo ? ` · received ${latestAgo}` : ""}`
              : "none yet"}
          </span>
          <span>Last checked: {lastCheckedAt ? formatTimeWithSeconds(lastCheckedAt.toISOString()) : "—"}</span>
          <span data-testid="monitor-time-zone">{appTimeZoneCaption(latest?.timestamp ?? status.serverTime)}</span>
        </div>
        {error ? <ErrorNotice error={error} className="mt-2" /> : null}
      </CardContent>
    </Card>
  );

  if (status.state === "no-source") {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This machine isn&apos;t connected to the CMTK</CardTitle>
            <CardDescription className="text-sm">
              Connect it first so readings can arrive here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/monitor">Connect a machine</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (waitingForFirstReading) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Card role="status" data-testid="monitor-waiting">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <HourglassIcon aria-hidden="true" size={40} className="animate-pulse text-primary" />
            <p className="text-lg font-semibold">Waiting for the first reading from the CMTK…</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Make sure the machine is on. Readings, the prediction, and the one-hour outlook will
              appear here automatically as soon as data arrives.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header}

      <section aria-labelledby="monitor-readings-heading" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="monitor-readings-heading" className="text-base font-semibold">
            Current readings
          </h2>
          <span className="text-xs text-muted-foreground">
            {latest ? `Measured at ${formatTimeWithSeconds(latest.timestamp)}` : null}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const value = latest?.values[feature];
            const unit = unitForLiveFeature(feature, status.featureUnits);
            return (
              <div key={feature} className="border border-border bg-card p-3" data-testid={`reading-${feature}`}>
                <p className="text-xs text-muted-foreground">
                  {feature}
                  {unit ? ` (${unit})` : ""}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {typeof value === "number" ? formatReading(value) : "—"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-2 sm:grid-cols-2">
        <section aria-labelledby="monitor-label-heading" className="border border-border bg-card p-3">
          <h2 id="monitor-label-heading" className="flex items-center gap-1.5 text-sm font-semibold">
            <TagIcon aria-hidden="true" />
            {labelCopy.reportedHeading}
          </h2>
          {reportedLabel ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={badgeVariantForMachineLabel(reportedLabel.label)} className="uppercase" data-testid="reported-label">
                {reportedLabel.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                since {formatTimeWithSeconds(status.labelHistory[0]?.startedAt ?? reportedLabel.observedAt)}
              </span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {labelCopy.vibrationLevel
                ? "This machine sends readings only, with no vibration level of its own, so there is nothing to compare the predicted vibration level with. It appears here automatically if the CMTK starts sending one."
                : "This machine sends readings only, with no status label of its own, so there is nothing to compare our prediction with. The status appears here automatically if the machine starts sending one."}
            </p>
          )}
        </section>

        <section aria-labelledby="monitor-prediction-heading" className="border border-border bg-card p-3">
          <h2 id="monitor-prediction-heading" className="flex items-center gap-1.5 text-sm font-semibold">
            <CpuIcon aria-hidden="true" />
            {labelCopy.vibrationLevel ? labelCopy.predictionHeading : "Our prediction"}
          </h2>
          {inference?.predictedLabel ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={badgeVariantForMachineLabel(inference.predictedLabel)} className="uppercase" data-testid="predicted-label">
                  {inference.predictedLabel}
                </Badge>
                {inferenceConfidence !== null ? (
                  <span className="text-sm">{formatPercent(inferenceConfidence)} confidence</span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {formatTimeWithSeconds(inference.generatedAt)}
                </span>
              </div>
              {labelCopy.meaning ? (
                <p className="text-xs text-muted-foreground">{labelCopy.meaning}</p>
              ) : null}
              {agreesWithMachine !== null ? (
                <p className="text-xs text-muted-foreground">
                  {agreesWithMachine ? labelCopy.matches : labelCopy.differs(reportedLabel?.label)}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {status.inference.status === "waiting"
                ? "The first prediction runs automatically once enough readings have arrived."
                : status.inference.status === "error"
                  ? "The last prediction could not run. The system will retry automatically."
                  : "A prediction will appear here once the machine's model has run."}
            </p>
          )}
        </section>
      </div>

      {health ? (
        <VibrationHealthCard
          machineName={name}
          health={health}
          thresholds={thresholds ?? null}
          thresholdsError={thresholdsError}
          choice={levelChoice}
          onChoiceChange={setLevelChoice}
          predictedLabel={predictedLabel}
          lastKnown={showingLastKnown}
        />
      ) : null}

      {showVibration3D ? (
        <section aria-labelledby="monitor-3d-heading" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="monitor-3d-heading" className="text-base font-semibold">
              Vibration in 3D
            </h2>
            <span className="text-xs text-muted-foreground">
              Last {status.observations.length} readings · X, Y and Z measured by the vibration sensor
            </span>
          </div>
          <Vibration3DView
            observations={status.observations}
            unit={unitForLiveFeature("VibrationX", status.featureUnits)}
            predictedLabel={inference?.predictedLabel ?? null}
            predictedLabelHeading={labelCopy.vibrationLevel ? labelCopy.predictionHeading : undefined}
            isLive={shown.state === "live"}
          />
        </section>
      ) : null}

      <section aria-labelledby="monitor-horizon-heading" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="monitor-horizon-heading" className="text-base font-semibold">
            Next hour
          </h2>
          {status.horizon?.status === "ok" && status.horizon.attemptedAt ? (
            <span className="text-xs text-muted-foreground">
              Outlook updated {formatTimeWithSeconds(status.horizon.attemptedAt)} · refreshes about every 30 s
            </span>
          ) : null}
        </div>
        {horizonCopy ? (
          <div className="border border-dashed border-border bg-muted/30 p-3 text-sm" role="status">
            <p className="font-medium">{horizonCopy.title}</p>
            <p className="text-muted-foreground">{horizonCopy.message}</p>
          </div>
        ) : null}
        <div className="grid gap-3 lg:grid-cols-2">
          {features.map((feature) => (
            <HorizonFeatureChart
              key={feature}
              feature={feature}
              unit={unitForLiveFeature(feature, status.featureUnits)}
              observations={status.observations}
              horizon={status.horizon}
              thresholds={(() => {
                const axis = health?.axes.find((item) => item.feature === feature);
                return axis ? chartThresholdsFor(axis, name, thresholds ?? null) : null;
              })()}
            />
          ))}
        </div>
      </section>

      <details className="border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
          Recent activity
        </summary>
        <div className="border-t border-border p-4">
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">{labelCopy.activityEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border border border-border text-sm">
              {activity.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    {item.kind === "inference" ? (
                      <CpuIcon aria-hidden="true" className="text-muted-foreground" />
                    ) : (
                      <TagIcon aria-hidden="true" className="text-muted-foreground" />
                    )}
                    <Badge variant={badgeVariantForMachineLabel(item.label)} className="uppercase">
                      {item.label ?? "—"}
                    </Badge>
                    <span>{item.text}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{formatTimeWithSeconds(item.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}

type MachineMonitorProps = {
  entityId: string;
};

/** Self-polling monitor for one CMTK-connected machine. */
export function MachineMonitor({ entityId }: MachineMonitorProps) {
  const provider = useDataProvider();
  const live = useEntityLiveStatus(entityId, { limit: MONITOR_OBSERVATION_LIMIT });
  const [setup, setSetup] = useState<CmtkSetup | null>(null);
  const [setupError, setSetupError] = useState<UserFacingError | null>(null);
  const [editing, setEditing] = useState(false);
  const [setupVersion, setSetupVersion] = useState(0);
  const [thresholds, setThresholds] = useState<EntityVibrationThresholds | null>(null);
  const [thresholdsError, setThresholdsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      provider
        .getEntityVibrationThresholds(entityId)
        .then((next) => {
          if (!active) return;
          setThresholds(next);
          setThresholdsError(null);
        })
        .catch(() => {
          if (!active) return;
          setThresholdsError("Vibration thresholds could not be loaded. Readings and predictions still work; the checks retry automatically.");
        });
    };
    load();
    const timer = window.setInterval(load, THRESHOLDS_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [provider, entityId]);

  useEffect(() => {
    let active = true;
    provider
      .getCmtkSetup()
      .then((next) => {
        if (!active) return;
        setSetup(next);
        setSetupError(null);
      })
      .catch((caught) => {
        if (!active) return;
        setSetupError(
          toUserFacingError(caught, "data.load", {
            title: "Machine details could not be loaded",
            message: "Live readings still work. Try again in a moment to edit the name or description.",
          }),
        );
      });
    return () => {
      active = false;
    };
  }, [provider, setupVersion]);

  const machines = setup?.machines ?? [];
  const machine = machines.find((candidate) => candidate.entityId === entityId) ?? null;

  return (
    <>
      {setupError ? <ErrorNotice error={setupError} className="mb-4" /> : null}
      <MachineMonitorContent
        status={live.status}
        connectionState={live.connectionState}
        error={live.error}
        lastCheckedAt={live.lastCheckedAt}
        machine={machine}
        machineCount={Math.max(machines.length, 1)}
        onEditDetails={() => setEditing(true)}
        thresholds={thresholds}
        thresholdsError={thresholdsError}
      />
      <EditMachineDetailsDialog
        open={editing}
        onOpenChange={setEditing}
        entityId={entityId}
        initialName={machine?.name ?? live.status?.entityName ?? ""}
        initialDescription={machine?.description ?? ""}
        setup={setup}
        onSaved={() => setSetupVersion((version) => version + 1)}
      />
    </>
  );
}
