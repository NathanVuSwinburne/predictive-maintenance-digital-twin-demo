"use client";

import { PlayIcon, SpinnerIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ErrorNotice } from "@/components/feedback/error-notice";

import { Badge } from "@/components/ui/badge";
import { SourceAttribution } from "@/components/provenance/source-attribution";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDataProvider } from "@/hooks/use-data-provider";
import type {
  EntityTelemetryRecord,
  GenericSimulationResult,
  JsonValue,
  SimulatorEntityOption,
} from "@/lib/domain/types";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";
import { formatInAppTimeZone } from "@/lib/time";

type Props = {
  entities: SimulatorEntityOption[];
  requestedEntityId?: string;
  entityId?: string;
  onEntityIdChange?: (entityId: string) => void;
  showEntitySelector?: boolean;
};

const SOURCE_PREVIEW_LIMIT = 60;

const REASON_LABELS: Record<string, string> = {
  NO_SIMULATE_CAPABILITY: "Simulation capability is not declared",
  NO_PRODUCTION_MODEL: "No model has been promoted to production",
  INSUFFICIENT_CONTEXT: "The current schema has insufficient session context",
  SCHEMA_MISMATCH: "The production model contract does not match the current schema",
  MODEL_UNAVAILABLE: "The production model is temporarily unavailable",
  UNSUPPORTED_MODEL_CONTRACT: "The production model contract is not supported by this simulator",
};

const chartConfig = {
  actual: { label: "Actual context", color: "var(--chart-2)" },
  simulated: { label: "Simulated future", color: "var(--chart-1)" },
} satisfies ChartConfig;

function featureLabel(name: string) {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value: JsonValue | undefined) {
  if (typeof value === "number") {
    return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 4 }).format(value);
  }
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "string") return value;
  return value == null ? "Not available" : JSON.stringify(value);
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return formatInAppTimeZone(date, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDurationMinutes(durationMinutes: number) {
  if (durationMinutes === 60) return "1 hour";
  if (durationMinutes === 240) return "4 hours";
  return `${durationMinutes} minutes`;
}

function formatCadence(cadenceSeconds: number) {
  if (cadenceSeconds >= 60 && cadenceSeconds % 60 === 0) return `Every ${cadenceSeconds / 60} min`;
  if (cadenceSeconds >= 60) return `Every ${(cadenceSeconds / 60).toFixed(1)} min`;
  return `Every ${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(cadenceSeconds)} s`;
}

function readinessNumber(selected: SimulatorEntityOption | undefined, key: string) {
  const value = selected?.readiness[key];
  return typeof value === "number" ? value : null;
}

function forecastTimestamp(
  sourceTimestamp: string | undefined,
  cadenceSeconds: number | null | undefined,
  step: number,
) {
  if (!sourceTimestamp || !cadenceSeconds) return null;
  const sourceTime = new Date(sourceTimestamp).getTime();
  if (!Number.isFinite(sourceTime)) return null;
  return new Date(sourceTime + cadenceSeconds * 1000 * step).toISOString();
}

function buildFeatureSeries(
  sourceReadings: EntityTelemetryRecord[],
  result: GenericSimulationResult,
  featureName: string,
) {
  const actual = sourceReadings.flatMap((reading) => {
    const value = reading.payload[featureName];
    return typeof value === "number"
      ? [{ timestamp: reading.timestamp, label: formatTimestamp(reading.timestamp), actual: value }]
      : [];
  });
  const latest = actual.at(-1);
  const boundary = latest ? [{ ...latest, simulated: latest.actual }] : [];
  const simulated = result.forecasts.flatMap((forecast, index) => {
    const value = forecast[featureName];
    if (typeof value !== "number") return [];
    const timestamp = result.forecastTimestamps?.[index] ?? forecastTimestamp(
      sourceReadings.at(-1)?.timestamp,
      result.forecastCadenceSeconds,
      index + 1,
    );
    return [{
      timestamp,
      label: timestamp ? formatTimestamp(timestamp) : `Step ${index + 1}`,
      simulated: value,
    }];
  });
  return [...actual.slice(0, -1), ...boundary, ...simulated];
}

export function SchemaDrivenSimulator({
  entities,
  requestedEntityId,
  entityId: controlledEntityId,
  onEntityIdChange,
  showEntitySelector = true,
}: Props) {
  const provider = useDataProvider();
  const candidates = useMemo(
    () => entities.filter((entity) => !entity.reasonCodes.includes("NO_SIMULATE_CAPABILITY")),
    [entities],
  );
  const [internalEntityId, setInternalEntityId] = useState("");
  const entityId = controlledEntityId ?? internalEntityId;
  const setEntityId = (value: string) => {
    setInternalEntityId(value);
    onEntityIdChange?.(value);
  };
  const [sessionId, setSessionId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<30 | 60 | 240>(30);
  const [sourceReadings, setSourceReadings] = useState<EntityTelemetryRecord[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<UserFacingError | null>(null);
  const [runError, setRunError] = useState<UserFacingError | null>(null);
  const [result, setResult] = useState<GenericSimulationResult | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const requested = candidates.find((entity) => entity.entityId === requestedEntityId);
    const next = requested?.entityId
      ?? candidates.find((entity) => entity.entityId === entityId)?.entityId
      ?? candidates[0]?.entityId
      ?? "";
    if (!controlledEntityId && next !== internalEntityId) setInternalEntityId(next);
  }, [candidates, controlledEntityId, entityId, internalEntityId, requestedEntityId]);

  const selected = candidates.find((entity) => entity.entityId === entityId);

  useEffect(() => {
    setSessionId(selected?.sessionIds[0] ?? "");
    setResult(null);
  }, [selected?.entityId, selected?.sessionIds]);

  useEffect(() => {
    if (!selected || !sessionId) {
      setSourceReadings([]);
      setSourceError(null);
      setSourceLoading(false);
      return;
    }

    let active = true;
    setSourceReadings([]);
    setSourceError(null);
    setSourceLoading(true);
    provider
      .listEntityTelemetry(selected.entityId, { sessionId, limit: SOURCE_PREVIEW_LIMIT })
      .then((readings) => {
        if (active) setSourceReadings(readings);
      })
      .catch((error) => {
        if (active) {
          setSourceError(toUserFacingError(error, "data.load", {
            title: "Current sensor data could not be loaded",
            message: "The selected session cannot be previewed.",
          }));
        }
      })
      .finally(() => {
        if (active) setSourceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [provider, selected, sessionId]);

  const latestReading = sourceReadings.at(-1);
  const outputFeatures = result
    ? selected?.outputFeatures.filter((feature) => result.forecasts.some((row) => feature in row)) ?? []
    : [];

  async function run() {
    if (!selected?.eligible || !sessionId || !latestReading) return;
    setRunError(null);
    setRunning(true);
    try {
      setResult(await provider.runGenericSimulation(selected.entityId, {
        sessionId,
        durationMinutes,
      }));
    } catch (error) {
      setRunError(toUserFacingError(error, "simulation.run"));
    } finally {
      setRunning(false);
    }
  }

  if (candidates.length === 0) return null;

  const availableRows = readinessNumber(selected, "availableContextRows");
  const requiredRows = readinessNumber(selected, "requiredContextRows");

  return (
    <section className="grid gap-4" aria-label="Generic registered machine simulator">
      {runError ? <ErrorNotice error={runError} /> : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run a forecast</CardTitle>
          <CardDescription className="text-sm">
            Simulates the next 30 minutes to 4 hours from the latest saved readings with the active model.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {showEntitySelector ? (
            <div className="grid gap-2 md:max-w-sm">
              <Label htmlFor="generic-simulator-machine">Machine</Label>
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger id="generic-simulator-machine"><SelectValue placeholder="Select a registered machine" /></SelectTrigger>
                <SelectContent>
                  {candidates.map((entity) => (
                    <SelectItem key={entity.entityId} value={entity.entityId}>
                      {entity.machineName}{entity.eligible ? "" : " · not ready"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {selected && !selected.eligible ? (
            <div className="flex gap-3 border border-warning/40 bg-warning/10 p-3 text-sm">
              <WarningCircleIcon className="mt-0.5 shrink-0 text-warning" size={20} aria-hidden="true" />
              <div>
                <p className="font-medium">This machine is not ready to simulate yet.</p>
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {selected.reasonCodes.map((reason) => <li key={reason}>{REASON_LABELS[reason] ?? reason}</li>)}
                </ul>
                <p className="mt-1 text-muted-foreground">Finish the model setup in Machine Registry, then return here.</p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label htmlFor="generic-simulator-horizon">How far ahead</Label>
              <Select
                value={String(durationMinutes)}
                onValueChange={(value) => setDurationMinutes(Number(value) as 30 | 60 | 240)}
              >
                <SelectTrigger id="generic-simulator-horizon" className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="240">4 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="lg"
              onClick={() => void run()}
              disabled={running || sourceLoading || !selected?.eligible || !sessionId || !latestReading}
            >
              {running ? <SpinnerIcon className="animate-spin" /> : <PlayIcon />}
              {running ? "Running..." : "Run simulation"}
            </Button>
          </div>

          <div className="border border-border bg-background p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">Current sensor context</p>
              <p className="text-xs text-muted-foreground">
                {latestReading
                  ? `Latest saved reading · ${formatTimestamp(latestReading.timestamp)}`
                  : "Starting point for the forecast"}
              </p>
            </div>
            {sourceLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <SpinnerIcon className="animate-spin" /> Loading saved readings...
              </div>
            ) : sourceError ? (
              <div className="mt-2"><ErrorNotice error={sourceError} /></div>
            ) : latestReading ? (
              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {selected?.inputFeatures.map((feature) => (
                  <div className="flex items-baseline gap-1.5" key={feature.name}>
                    <dt className="text-muted-foreground">
                      {featureLabel(feature.name)}{feature.unit ? ` (${feature.unit})` : ""}
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {formatValue(latestReading.payload[feature.name])}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="py-3 text-sm text-muted-foreground">No saved readings are available for this session.</p>
            )}
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer py-1 font-medium focus-visible:outline-2 focus-visible:outline-ring">
              Advanced options and technical details
            </summary>
            <div className="mt-3 grid gap-4">
              <div className="grid gap-2 md:max-w-md">
                <Label htmlFor="generic-simulator-session">Source session</Label>
                <Select
                  value={sessionId}
                  onValueChange={(value) => {
                    setSessionId(value);
                    setResult(null);
                  }}
                  disabled={!selected?.sessionIds.length}
                >
                  <SelectTrigger id="generic-simulator-session"><SelectValue placeholder="No compatible session" /></SelectTrigger>
                  <SelectContent>
                    {selected?.sessionIds.map((session) => <SelectItem key={session} value={session}>{session}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The latest saved session is used by default. Its most recent readings anchor the forecast.
                </p>
              </div>
              <dl className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-[auto_1fr]">
                <dt>Readings loaded</dt>
                <dd>
                  {sourceReadings.length} recent reading{sourceReadings.length === 1 ? "" : "s"}
                  {availableRows !== null ? ` · ${availableRows} rows available` : ""}
                  {requiredRows !== null ? ` · model requires ${requiredRows} context row${requiredRows === 1 ? "" : "s"}` : ""}
                </dd>
                <dt>Data format</dt>
                <dd>Schema v{selected?.schemaVersion ?? "—"}</dd>
                <dt>Active model</dt>
                <dd>
                  Version {selected?.productionModel?.modelVersion ?? "—"}
                  {selected?.uncertaintySupported ? " · uncertainty supported" : ""}
                </dd>
              </dl>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Simulation results</CardTitle>
          <CardDescription className="text-sm">
            {result
              ? `${selected?.machineName ?? "Machine"} · recent saved readings continuing into the simulated next ${formatDurationMinutes(result.durationMinutes)}`
              : "Run a simulation to compare recent readings with the simulated future."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 text-sm" aria-live="polite">
          {!result ? (
            <p className="text-muted-foreground">
              Results will appear here after the simulation runs.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <SourceAttribution provenance={result.provenance} />
                <span className="text-muted-foreground">Simulated values are generated by the model, not measured.</span>
                <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="size-2 bg-[var(--chart-2)]" aria-hidden="true" />Actual context</span>
                  <span className="flex items-center gap-1"><span className="size-2 border border-dashed border-[var(--chart-1)] bg-[var(--chart-1)]/40" aria-hidden="true" />Simulated future</span>
                </span>
              </div>

              {result.warnings.length ? (
                <div className="flex gap-3 border border-warning/40 bg-warning/10 p-3 text-sm">
                  <WarningCircleIcon className="mt-0.5 shrink-0 text-warning" size={20} />
                  <div>
                    <p className="font-medium">Simulation notice</p>
                    <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                      {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                {outputFeatures.map((featureName) => {
                  const definition = selected?.inputFeatures.find((feature) => feature.name === featureName);
                  const series = buildFeatureSeries(sourceReadings, result, featureName);
                  const boundaryLabel = sourceReadings.at(-1)?.timestamp
                    ? formatTimestamp(sourceReadings.at(-1)!.timestamp)
                    : undefined;
                  return (
                    <div className="border border-border p-3" key={featureName}>
                      <div className="mb-3 flex items-baseline justify-between gap-2">
                        <p className="font-medium">{featureLabel(featureName)}</p>
                        {definition?.unit ? <span className="text-xs text-muted-foreground">{definition.unit}</span> : null}
                      </div>
                      <ChartContainer config={chartConfig} className="h-[220px] w-full aspect-auto">
                        <LineChart data={series} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="label" minTickGap={42} tickLine={false} axisLine={false} />
                          <YAxis width={48} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          {boundaryLabel ? <ReferenceLine x={boundaryLabel} stroke="var(--border)" strokeDasharray="4 4" /> : null}
                          <Line type="monotone" dataKey="actual" stroke="var(--color-actual)" strokeWidth={2} dot={false} connectNulls={false} />
                          <Line type="monotone" dataKey="simulated" stroke="var(--color-simulated)" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls={false} />
                        </LineChart>
                      </ChartContainer>
                    </div>
                  );
                })}
              </div>

              <div className="border border-border">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
                  <p className="font-medium">Forecast values</p>
                  <p className="text-xs text-muted-foreground">
                    {result.forecasts.length} row{result.forecasts.length === 1 ? "" : "s"} · scroll inside the table
                  </p>
                </div>
                {/* A long horizon produces hundreds of rows. Capped and scrolled in place so
                    the uncertainty panel below it stays reachable without a page-long scroll.
                    The cap goes on the table's own scroll container -- shadcn primitives are
                    regenerated and must not be hand-edited -- because a sticky header sticks
                    to its nearest scrolling ancestor, and that container is it. */}
                <div className="[&>[data-slot=table-container]]:max-h-[22rem]">
                  <Table>
                    <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card">
                      <TableRow>
                        <TableHead>Forecast time</TableHead>
                        {outputFeatures.map((featureName) => {
                          const definition = selected?.inputFeatures.find((feature) => feature.name === featureName);
                          return <TableHead key={featureName}>{featureLabel(featureName)}{definition?.unit ? ` (${definition.unit})` : ""}</TableHead>;
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.forecasts.map((forecast, index) => {
                        const timestamp = result.forecastTimestamps?.[index] ?? forecastTimestamp(
                          sourceReadings.at(-1)?.timestamp,
                          result.forecastCadenceSeconds,
                          index + 1,
                        );
                        return (
                          <TableRow key={`${result.id}-${index}`}>
                            <TableCell>{timestamp ? formatTimestamp(timestamp) : `Step ${index + 1}`}</TableCell>
                            {outputFeatures.map((featureName) => <TableCell className="tabular-nums" key={featureName}>{formatValue(forecast[featureName])}</TableCell>)}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer py-1 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                  Technical details
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">Model v{result.modelVersion}</Badge>
                  {result.sessionId ? <Badge variant="secondary">Session {result.sessionId}</Badge> : null}
                  <Badge variant="secondary">{result.horizonSteps} forecast step{result.horizonSteps === 1 ? "" : "s"}</Badge>
                  <Badge variant="secondary">{formatDurationMinutes(result.durationMinutes)}</Badge>
                  {result.forecastCadenceSeconds ? <Badge variant="outline">{formatCadence(result.forecastCadenceSeconds)}</Badge> : null}
                </div>
                {Object.keys(result.uncertainty).length ? (
                  <div className="mt-3">
                    <p className="font-medium text-foreground">Model uncertainty</p>
                    <dl className="mt-1 grid gap-1 sm:grid-cols-2">
                      {Object.entries(result.uncertainty).map(([name, value]) => (
                        <div key={name} className="flex justify-between gap-3">
                          <dt>{featureLabel(name)}</dt>
                          <dd className="font-medium text-foreground">{formatValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
              </details>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
