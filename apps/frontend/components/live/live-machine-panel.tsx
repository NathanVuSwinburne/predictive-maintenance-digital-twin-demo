"use client";

import { useEffect, useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  BroadcastIcon,
  CpuIcon,
  TagIcon,
  WarningIcon,
} from "@phosphor-icons/react";

import { ErrorNotice } from "@/components/feedback/error-notice";
import { LiveStateBadge } from "@/components/live/live-state-badge";
import { SourceAttribution } from "@/components/provenance/source-attribution";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { useEntityLiveStatus } from "@/hooks/use-entity-live-status";
import type { TelemetryConnectionState } from "@/hooks/use-live-telemetry";
import {
  badgeVariantForMachineLabel,
  formatDateTime,
  formatElapsed,
  formatTimeWithSeconds,
  liveStatePresentation,
  isVibrationFeature,
  unitForLiveFeature,
  usesVibrationLevelLabels,
} from "@/lib/domain/presentation";
import type {
  EntityLiveForecast,
  EntityLiveInference,
  EntityLiveObservation,
  EntityLiveState,
  EntityLiveStatus,
  InformationProvenance,
  LiveForecastSummary,
  LiveInferenceSummary,
} from "@/lib/domain/types";
import type { UserFacingError } from "@/lib/errors/user-facing-error";

const readingChartConfig = {
  actual: { label: "Reading", color: "var(--chart-1)" },
  forecast: { label: "Forecast", color: "var(--chart-4)" },
} satisfies ChartConfig;

const LABEL_ORDER = ["low", "medium", "high", "critical"];

type ChartRow = { t: number; actual?: number; forecast?: number };

export type LiveActivityItem = {
  id: string;
  at: string;
  kind: "inference" | "label";
  text: string;
  label: string | null;
};

function formatReading(value: number) {
  return value.toLocaleString("en-AU", { maximumFractionDigits: 3 });
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function toMs(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Vibration first (the demo's primary signal), then the remaining features alphabetically. */
function orderFeatures(names: Iterable<string>) {
  return [...new Set(names)].sort((a, b) => {
    const aVibration = isVibrationFeature(a) ? 0 : 1;
    const bVibration = isVibrationFeature(b) ? 0 : 1;
    return aVibration - bVibration || a.localeCompare(b);
  });
}

function numericFeatures(status: EntityLiveStatus) {
  const names = new Set(status.features);
  for (const observation of status.observations) {
    for (const key of Object.keys(observation.values)) names.add(key);
  }
  const hasAnyNumeric = status.observations.length > 0;
  return orderFeatures(
    [...names].filter(
      (name) =>
        !hasAnyNumeric ||
        status.observations.some((observation) => typeof observation.values[name] === "number"),
    ),
  );
}

/** Typical gap between readings, so a forecast can be drawn one step after the sample it continues. */
function medianCadenceMs(observations: EntityLiveObservation[]) {
  const times = observations
    .map((observation) => toMs(observation.timestamp))
    .filter((value): value is number => value !== null);
  const gaps = times.slice(1).map((value, index) => value - times[index]).filter((gap) => gap > 0);
  if (!gaps.length) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

function uniqueById<T extends { id: string }>(items: Array<T | null>) {
  const seen = new Map<string, T>();
  for (const item of items) {
    if (item && !seen.has(item.id)) seen.set(item.id, item);
  }
  return [...seen.values()];
}

export function chartRowsForFeature(
  feature: string,
  observations: EntityLiveObservation[],
  forecasts: LiveForecastSummary[],
  cadenceMs: number,
): ChartRow[] {
  const rows = new Map<number, ChartRow>();
  let firstReading = Number.POSITIVE_INFINITY;
  for (const observation of observations) {
    const t = toMs(observation.timestamp);
    const value = observation.values[feature];
    if (t === null || typeof value !== "number") continue;
    firstReading = Math.min(firstReading, t);
    rows.set(t, { ...rows.get(t), t, actual: value });
  }
  for (const forecast of forecasts) {
    const value = forecast.forecast[feature];
    const base = toMs(forecast.basedOnTimestamp) ?? toMs(forecast.generatedAt);
    if (base === null || typeof value !== "number") continue;
    const t = base + cadenceMs;
    // Forecasts older than the plotted readings would stretch the axis into a
    // stretch of dots with no reading line to compare against.
    if (t < firstReading) continue;
    rows.set(t, { ...rows.get(t), t, forecast: value });
  }
  return [...rows.values()].sort((a, b) => a.t - b.t);
}

function sortedProbabilities(probabilities: Record<string, number>) {
  return Object.entries(probabilities).sort(([a], [b]) => {
    const aIndex = LABEL_ORDER.indexOf(a.toLowerCase());
    const bIndex = LABEL_ORDER.indexOf(b.toLowerCase());
    return (aIndex === -1 ? LABEL_ORDER.length : aIndex) - (bIndex === -1 ? LABEL_ORDER.length : bIndex) || a.localeCompare(b);
  });
}

export function confidenceFor(summary: LiveInferenceSummary) {
  if (!summary.predictedLabel) return null;
  const probability = summary.probabilities[summary.predictedLabel];
  return typeof probability === "number" ? probability : null;
}

function inferenceProvenance(summary: LiveInferenceSummary): InformationProvenance {
  return {
    outputSources: ["ml-prediction"],
    basisSources: ["live-machine-data"],
    evidence: [
      {
        source: "ml-prediction",
        label: `${summary.modelName} v${summary.modelVersion}`,
        timestamp: summary.generatedAt,
        detail: `${summary.inputRows} live readings scored`,
      },
    ],
  };
}

function unavailableInferenceCopy(inference: EntityLiveInference) {
  switch (inference.status) {
    case "waiting":
      return {
        title: "Waiting for enough readings",
        message: inference.message ?? "The first prediction runs automatically once enough live readings have arrived.",
      };
    case "disabled":
      return {
        title: "Automatic prediction is turned off",
        message: inference.message ?? "No prediction runs for this machine's live feed.",
      };
    case "error":
      return {
        title: "The last prediction could not run",
        message: "The active model could not score the latest readings. The system will retry automatically.",
      };
    default:
      return {
        title: "Prediction isn't available yet",
        message: inference.message ?? "This machine needs an active prediction model before live results can be shown.",
      };
  }
}

function unavailableForecastCopy(forecast: EntityLiveForecast) {
  switch (forecast.status) {
    case "ok":
      return null;
    case "waiting":
      return forecast.message ?? "Forecasts start automatically once enough live readings have arrived.";
    case "disabled":
      return forecast.message ?? "No forecast runs for this machine's live feed.";
    case "error":
      return "The active forecast model could not process the latest readings. The system will retry automatically.";
    default:
      return forecast.message ?? "This machine needs an active forecast model before next-step values can be shown.";
  }
}

/**
 * Wording for the low/medium/high labels on live surfaces. For Machine C and the
 * CMTK sensor layout those labels are the machine's vibration intensity level, not
 * failure risk; any other machine keeps neutral status/prediction wording.
 */
export function liveLabelCopy(status: Pick<EntityLiveStatus, "entityId" | "features">) {
  if (usesVibrationLevelLabels(status)) {
    return {
      vibrationLevel: true,
      predictionHeading: "Predicted vibration level",
      meaning: "Low, medium or high: how strongly the machine is vibrating. This is not a failure risk.",
      probabilitiesLabel: "Vibration level probabilities",
      reportedHeading: "Vibration level reported by the machine",
      noReportedLabel: "The machine sends readings only; it does not report a vibration level of its own.",
      matches: "Matches the vibration level the machine is reporting.",
      differs: (label: string | undefined) =>
        `Differs from the vibration level the machine is reporting (${label}).`,
      predicted: (label: string) => `Predicted vibration level: ${label}`,
      reported: (label: string) => `Machine reported vibration level: ${label}`,
      activityEmpty: "Predictions and vibration level changes will appear here as they happen.",
    };
  }
  return {
    vibrationLevel: false,
    predictionHeading: "Current prediction",
    meaning: null,
    probabilitiesLabel: "Class probabilities",
    reportedHeading: "Status reported by the machine",
    noReportedLabel: "The machine has not reported a status label.",
    matches: "Matches the status the machine is reporting.",
    differs: (label: string | undefined) => `Differs from the status the machine is reporting (${label}).`,
    predicted: (label: string) => `Predicted ${label}`,
    reported: (label: string) => `Machine reported ${label}`,
    activityEmpty: "Predictions and machine status changes will appear here as they happen.",
  };
}

export function activityItems(status: EntityLiveStatus): LiveActivityItem[] {
  const copy = liveLabelCopy(status);
  const inferences = uniqueById([status.inference.latest, ...status.inference.recent]).map(
    (summary): LiveActivityItem => {
      const confidence = confidenceFor(summary);
      return {
        id: `inference-${summary.id}`,
        at: summary.generatedAt,
        kind: "inference",
        label: summary.predictedLabel,
        text: summary.predictedLabel
          ? `${copy.predicted(summary.predictedLabel)}${confidence !== null ? ` · ${formatPercent(confidence)} confidence` : ""}`
          : "Prediction ran without a label",
      };
    },
  );
  const labels = status.labelHistory.map(
    (span): LiveActivityItem => ({
      id: `label-${span.startedAt}-${span.label}`,
      at: span.startedAt,
      kind: "label",
      label: span.label,
      text: copy.reported(span.label),
    }),
  );
  return [...inferences, ...labels]
    .sort((a, b) => (toMs(b.at) ?? 0) - (toMs(a.at) ?? 0))
    .slice(0, 10);
}

/**
 * The state the operator should believe. Transport failures to our own server
 * override whatever the last payload claimed, so a dead backend never looks live.
 */
export function displayState(
  serverState: EntityLiveState,
  connectionState: TelemetryConnectionState,
): { state: EntityLiveState; message: string } {
  if (connectionState === "disconnected") {
    return {
      state: "disconnected",
      message:
        "The connection to the server was lost. Showing last-known values. Retrying automatically.",
    };
  }
  if (connectionState === "reconnecting") {
    return {
      state: "reconnecting",
      message: "The last refresh failed. Showing last-known values. Trying again automatically.",
    };
  }
  return { state: serverState, message: liveStatePresentation[serverState].description };
}

type LiveMachinePanelContentProps = {
  status: EntityLiveStatus | null;
  connectionState: TelemetryConnectionState;
  error: UserFacingError | null;
  lastCheckedAt: Date | null;
  machineName?: string;
  className?: string;
};

export function LiveMachinePanelContent({
  status,
  connectionState,
  error,
  lastCheckedAt,
  machineName,
  className,
}: LiveMachinePanelContentProps) {
  const features = useMemo(() => (status ? numericFeatures(status) : []), [status]);
  const forecasts = useMemo(
    () => (status ? uniqueById([status.forecast.latest, ...status.forecast.recent]) : []),
    [status],
  );
  const cadenceMs = useMemo(
    () => (status ? medianCadenceMs(status.observations) : 0),
    [status],
  );
  const activity = useMemo(() => (status ? activityItems(status) : []), [status]);

  if (!status || status.state === "no-source") return null;

  const shown = displayState(status.state, connectionState);
  const latest = status.observations.at(-1) ?? null;
  const latestAgo = latest ? formatElapsed(latest.receivedAt, status.serverTime) : null;
  const showingLastKnown = shown.state !== "live" && latest !== null;
  const inference = status.inference.latest;
  const inferenceConfidence = inference ? confidenceFor(inference) : null;
  const inferenceUnavailable =
    status.inference.status !== "ok" || !inference ? unavailableInferenceCopy(status.inference) : null;
  const forecastNote = unavailableForecastCopy(status.forecast);
  const nextForecast = status.forecast.latest;
  const reportedLabel = status.latestLabel;
  const agreesWithMachine =
    inference?.predictedLabel && reportedLabel
      ? inference.predictedLabel.toLowerCase() === reportedLabel.label.toLowerCase()
      : null;
  const name = machineName ?? status.entityName;
  const labelCopy = liveLabelCopy(status);

  return (
    <Card className={className} data-testid="live-machine-panel">
      <CardHeader>
        <CardTitle className="text-sm">Live machine data</CardTitle>
        <CardDescription className="text-sm">
          {name} · readings arrive directly from
          {status.source ? ` ${status.source.name}` : " the machine"} over MQTT. These are measured
          values, not simulated data.
        </CardDescription>
        <CardAction>
          <LiveStateBadge state={shown.state} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 border-y border-border py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <BroadcastIcon data-icon="inline-start" aria-hidden="true" />
              CMTK live (MQTT)
            </Badge>
            {status.provenance?.outputSources.length ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Data source:</span>
                <SourceAttribution provenance={status.provenance} />
              </span>
            ) : null}
            {showingLastKnown ? <Badge variant="warning">Showing last-known values</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {shown.message}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Last reading:{" "}
              {latest
                ? `${formatTimeWithSeconds(latest.timestamp)}${latestAgo ? ` · received ${latestAgo}` : ""}`
                : "Not available"}
            </span>
            <span>
              Last checked: {lastCheckedAt ? formatTimeWithSeconds(lastCheckedAt.toISOString()) : "-"}
            </span>
            <span>Counts as live for {status.freshnessSeconds} s after each reading</span>
          </div>
        </div>

        {!status.subscriberEnabled ? (
          <Alert role="status" className="text-warning">
            <WarningIcon aria-hidden="true" />
            <AlertTitle className="text-xs font-medium">Live data collection is turned off on the server</AlertTitle>
            <AlertDescription className="text-xs">
              Readings cannot arrive until an administrator enables the MQTT subscriber on the backend.
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? <ErrorNotice error={error} /> : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,1fr)]">
          <section aria-labelledby="live-readings-heading" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="live-readings-heading" className="text-sm font-semibold">
                How are the sensors trending?
              </h3>
              <span className="text-xs text-muted-foreground">
                {status.observations.length} most recent readings
              </span>
            </div>
            {features.length === 0 ? (
              <div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
                No readings have arrived from this machine yet.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {features.map((feature) => {
                  const value = latest?.values[feature];
                  const unit = unitForLiveFeature(feature, status.featureUnits);
                  const rows = chartRowsForFeature(feature, status.observations, forecasts, cadenceMs);
                  const next = nextForecast?.forecast[feature];
                  return (
                    <article key={feature} className="border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {feature}
                            {unit ? ` (${unit})` : ""}
                          </p>
                          <p className="text-base font-semibold tabular-nums">
                            {typeof value === "number" ? formatReading(value) : "—"}
                          </p>
                        </div>
                        {typeof next === "number" ? (
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Next forecast</p>
                            <p className="text-sm font-medium tabular-nums text-muted-foreground">
                              {formatReading(next)}
                            </p>
                          </div>
                        ) : null}
                      </div>
                      {rows.length > 1 ? (
                        <ChartContainer config={readingChartConfig} className="mt-2 aspect-auto h-24 w-full">
                          <LineChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                            <CartesianGrid vertical={false} />
                            <XAxis
                              dataKey="t"
                              type="number"
                              domain={["dataMin", "dataMax"]}
                              tickLine={false}
                              axisLine={false}
                              tickCount={3}
                              tickFormatter={(value: number) =>
                                formatTimeWithSeconds(new Date(value).toISOString())
                              }
                            />
                            <YAxis hide domain={["auto", "auto"]} />
                            <ChartTooltip
                              content={
                                <ChartTooltipContent
                                  labelFormatter={(_, payload) => {
                                    const t = payload?.[0]?.payload?.t;
                                    return typeof t === "number"
                                      ? formatTimeWithSeconds(new Date(t).toISOString())
                                      : null;
                                  }}
                                />
                              }
                            />
                            <Line
                              dataKey="actual"
                              name="Reading"
                              type="monotone"
                              stroke="var(--color-actual)"
                              strokeWidth={2}
                              dot={false}
                              connectNulls
                              isAnimationActive={false}
                            />
                            <Line
                              dataKey="forecast"
                              name="Forecast"
                              type="monotone"
                              stroke="var(--color-forecast)"
                              strokeWidth={2}
                              strokeDasharray="4 4"
                              dot={{ r: 3, strokeWidth: 2, fill: "var(--background)" }}
                              connectNulls
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ChartContainer>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Solid line: readings from the machine. Dashed line with hollow points: model forecast for the
              next reading.
              {forecastNote ? ` ${forecastNote}` : ""}
            </p>
          </section>

          <div className="flex flex-col gap-3">
            <section aria-labelledby="live-prediction-heading" className="border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="live-prediction-heading" className="flex items-center gap-1.5 text-sm font-semibold">
                  <CpuIcon aria-hidden="true" />
                  {labelCopy.predictionHeading}
                </h3>
                {inference ? <SourceAttribution provenance={inferenceProvenance(inference)} /> : null}
              </div>
              {inference && !inferenceUnavailable ? (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={badgeVariantForMachineLabel(inference.predictedLabel)}
                      className="h-7 px-3 text-sm uppercase"
                      data-testid="predicted-label"
                    >
                      {inference.predictedLabel ?? "No label"}
                    </Badge>
                    {inferenceConfidence !== null ? (
                      <span className="text-sm">
                        {formatPercent(inferenceConfidence)} confidence
                      </span>
                    ) : null}
                  </div>
                  {labelCopy.meaning ? (
                    <p className="text-xs text-muted-foreground">{labelCopy.meaning}</p>
                  ) : null}
                  <ul className="flex flex-col gap-1" aria-label={labelCopy.probabilitiesLabel}>
                    {sortedProbabilities(inference.probabilities).map(([label, probability]) => (
                      <li key={label} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-xs">
                        <span className="capitalize">{label}</span>
                        <Progress value={Math.round(probability * 100)} aria-label={`${label} probability`} />
                        <span className="text-right tabular-nums text-muted-foreground">
                          {formatPercent(probability)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    {inference.modelName} v{inference.modelVersion} · {formatTimeWithSeconds(inference.generatedAt)} ·{" "}
                    {inference.inputRows} readings
                  </p>
                  {agreesWithMachine !== null ? (
                    <p className="text-xs text-muted-foreground">
                      {agreesWithMachine ? labelCopy.matches : labelCopy.differs(reportedLabel?.label)}
                    </p>
                  ) : null}
                </div>
              ) : inferenceUnavailable ? (
                <div className="mt-2 text-sm">
                  <p className="font-medium">{inferenceUnavailable.title}</p>
                  <p className="text-muted-foreground">{inferenceUnavailable.message}</p>
                </div>
              ) : null}
            </section>

            <section aria-labelledby="live-label-heading" className="border border-border p-3">
              <h3 id="live-label-heading" className="flex items-center gap-1.5 text-sm font-semibold">
                <TagIcon aria-hidden="true" />
                {labelCopy.reportedHeading}
              </h3>
              {reportedLabel ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <Badge
                    variant={badgeVariantForMachineLabel(reportedLabel.label)}
                    className="uppercase"
                    data-testid="reported-label"
                  >
                    {reportedLabel.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    since {formatTimeWithSeconds(status.labelHistory[0]?.startedAt ?? reportedLabel.observedAt)}
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {labelCopy.noReportedLabel}
                </p>
              )}
            </section>

            {status.source?.lastError ? (
              <p className="text-xs text-muted-foreground">
                Most recent source issue: {status.source.lastError}
              </p>
            ) : null}
          </div>
        </div>

        <section aria-labelledby="live-activity-heading" className="flex flex-col gap-2">
          <h3 id="live-activity-heading" className="text-sm font-semibold">
            Recent activity
          </h3>
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
        </section>

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer py-1 font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            Technical details
          </summary>
          <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            <dt>Machine ID</dt>
            <dd className="font-mono">{status.entityId}</dd>
            <dt>Source</dt>
            <dd>
              {status.source
                ? `${status.source.name} · ${status.source.status} · ${status.source.acceptedRows} accepted / ${status.source.rejectedRows} rejected`
                : "None"}
            </dd>
            <dt>Server time</dt>
            <dd>{formatDateTime(status.serverTime)}</dd>
            <dt>Subscriber</dt>
            <dd>{status.subscriberEnabled ? "Enabled" : "Disabled"}</dd>
            <dt>Prediction model</dt>
            <dd>{inference ? `${inference.modelName} v${inference.modelVersion}` : status.inference.status}</dd>
            <dt>Forecast model</dt>
            <dd>
              {nextForecast
                ? `${nextForecast.modelName} v${nextForecast.modelVersion}`
                : status.forecast.status}
            </dd>
          </dl>
        </details>
      </CardContent>
    </Card>
  );
}

type LiveMachinePanelProps = {
  entityId: string | undefined;
  machineName?: string;
  className?: string;
  /** Reports whether the card is currently rendered, so a parent can demote its own controls while live data is the hero. */
  onVisibilityChange?: (visible: boolean) => void;
};

/** Self-polling live card; renders nothing until a status arrives or when the entity has no MQTT source. */
export function LiveMachinePanel({ entityId, machineName, className, onVisibilityChange }: LiveMachinePanelProps) {
  const live = useEntityLiveStatus(entityId);
  const visible = Boolean(live.status) && live.status?.state !== "no-source";
  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [onVisibilityChange, visible]);
  return (
    <LiveMachinePanelContent
      status={live.status}
      connectionState={live.connectionState}
      error={live.error}
      lastCheckedAt={live.lastCheckedAt}
      machineName={machineName}
      className={className}
    />
  );
}
