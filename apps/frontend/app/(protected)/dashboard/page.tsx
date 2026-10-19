"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
} from "recharts";
import {
  CalendarDotsIcon,
  ChartLineIcon,
  CpuIcon,
  FlaskIcon,
} from "@phosphor-icons/react";

import { useAuth } from "@/components/auth/auth-context";
import {
  LiveDataHealthContent,
  LivePredictionBar,
  shownLiveState,
} from "@/components/dashboard/live-data-health";
import { ErrorNotice } from "@/components/feedback/error-notice";
import { NoMachineAccessState } from "@/components/machines/no-machine-access-state";
import {
  mergeInformationProvenance,
  SourceAttribution,
} from "@/components/provenance/source-attribution";
import { LiveTelemetrySummary } from "@/components/telemetry/live-telemetry-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useDataProvider } from "@/hooks/use-data-provider";
import { useFleetLiveHealth } from "@/hooks/use-fleet-live-health";
import { useLiveTelemetry } from "@/hooks/use-live-telemetry";
import {
  badgeVariantForMachineStatus,
  badgeVariantForSeverity,
  formatDateTime,
  labelForEventType,
  telemetryMetricsForMachine,
} from "@/lib/domain/presentation";
import type {
  CanonicalMachine,
  HistoryEvent,
  SimulationRun,
  TelemetryMetric,
} from "@/lib/domain/types";
import {
  toUserFacingError,
  type UserFacingError,
} from "@/lib/errors/user-facing-error";
import { formatInAppTimeZone } from "@/lib/time";

const downtimeConfig = {
  downtime: {
    label: "Projected Downtime (hours)",
    color: "var(--warning)",
  },
} satisfies ChartConfig;

const telemetryColors: Record<TelemetryMetric, string> = {
  temperature: "var(--primary)",
  vibration: "var(--primary)",
  pressure: "var(--primary)",
  power: "var(--primary)",
};

function formatTelemetryChartTime(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return formatInAppTimeZone(date, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .replace(" am", "am")
    .replace(" pm", "pm");
}

function formatTelemetryTooltipTimestamp(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return formatInAppTimeZone(date, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .replace(" am", "am")
    .replace(" pm", "pm");
}

function MachineMetric({
  label,
  value,
  indicatorClassName,
}: {
  label: string;
  value: number;
  indicatorClassName: string;
}) {
  return (
    <div className="min-w-24 flex-1">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}%</span>
      </div>
      <Progress
        value={value}
        aria-label={`${label}: ${value}%`}
        indicatorClassName={indicatorClassName}
      />
    </div>
  );
}

export default function DashboardPage() {
  const provider = useDataProvider();
  const { activePersona } = useAuth();

  const [machines, setMachines] = useState<CanonicalMachine[]>([]);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [simulationRuns, setSimulationRuns] = useState<SimulationRun[]>([]);
  const [selectedMetric, setSelectedMetric] =
    useState<TelemetryMetric>("temperature");
  const [selectedTelemetryMachineId, setSelectedTelemetryMachineId] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<UserFacingError | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const displayedSimulationProvenance = useMemo(
    () =>
      mergeInformationProvenance(
        simulationRuns.slice(0, 6).map((run) => run.provenance),
      ),
    [simulationRuns],
  );

  useEffect(() => {
    if (!activePersona) {
      return;
    }

    const currentPersona = activePersona;
    const activeUserId = currentPersona.id;
    const isStandardUser = currentPersona.role === "user";
    let active = true;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const loadedMachines = await provider.listCanonicalMachines({
          sortBy: "risk",
          sortDirection: "desc",
          authorizedForUserId: isStandardUser ? activeUserId : undefined,
        });
        const visibleMachineIds = loadedMachines.map((machine) => machine.id);
        const [loadedHistory, loadedRuns] = await Promise.all([
          provider.listHistoryEvents({
            userId: activeUserId,
            machineIds: isStandardUser ? visibleMachineIds : undefined,
          }),
          provider.listSimulationRuns(activeUserId),
        ]);

        if (!active) {
          return;
        }

        setMachines(loadedMachines);
        setHistory(loadedHistory);
        setSimulationRuns(
          isStandardUser
            ? loadedRuns.filter((run) =>
                visibleMachineIds.includes(run.machineId),
              )
            : loadedRuns,
        );
      } catch (error) {
        if (active) {
          setLoadError(
            toUserFacingError(error, "data.load", {
              title: "Dashboard information could not be loaded",
              message:
                "Machine, history, and simulation summaries are unavailable.",
            }),
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [activePersona, loadAttempt, provider]);

  const telemetryMachineId = selectedTelemetryMachineId ?? machines[0]?.id;
  const telemetryMachine = machines.find(
    (machine) => machine.id === telemetryMachineId,
  );
  const telemetryMetrics = useMemo(
    () => telemetryMetricsForMachine(telemetryMachine?.machineType),
    [telemetryMachine?.machineType],
  );
  const telemetryConfig = useMemo(
    () =>
      Object.fromEntries(
        telemetryMetrics.map((metric) => [
          metric.key,
          {
            label: `${metric.label} (${metric.unit})`,
            color: telemetryColors[metric.key],
          },
        ]),
      ) satisfies ChartConfig,
    [telemetryMetrics],
  );
  const liveTelemetry = useLiveTelemetry(telemetryMachineId);
  const fleetLive = useFleetLiveHealth(activePersona?.id);
  const liveHealthById = useMemo(
    () =>
      new Map(
        (fleetLive.fleet?.machines ?? []).map((health) => [
          health.entityId,
          {
            ...health,
            state: shownLiveState(health.state, fleetLive.error !== null),
          },
        ]),
      ),
    [fleetLive.error, fleetLive.fleet],
  );
  const liveServerTime = fleetLive.fleet?.serverTime ?? null;

  useEffect(() => {
    if (!telemetryMetrics.some((metric) => metric.key === selectedMetric)) {
      setSelectedMetric(telemetryMetrics[0]?.key ?? "temperature");
    }
  }, [selectedMetric, telemetryMetrics]);

  const attentionCounts = useMemo(
    () => ({
      risk: machines.filter((machine) => machine.status === "risk").length,
      watch: machines.filter((machine) => machine.status === "watch").length,
    }),
    [machines],
  );
  const needsAttentionCount = attentionCounts.risk + attentionCounts.watch;
  const machinesNeedingAttention = useMemo(
    () =>
      machines.filter(
        (machine) => machine.status === "risk" || machine.status === "watch",
      ),
    [machines],
  );
  const otherMachines = useMemo(
    () =>
      machines.filter(
        (machine) => machine.status !== "risk" && machine.status !== "watch",
      ),
    [machines],
  );

  const fleetStatus = useMemo(
    () => [
      {
        label: "At Risk",
        count: machines.filter(
          (machine) => machine.legacyCompatible && machine.status === "risk",
        ).length,
        colorClassName: "bg-destructive/70",
      },
      {
        label: "Needs Watching",
        count: machines.filter(
          (machine) => machine.legacyCompatible && machine.status === "watch",
        ).length,
        colorClassName: "bg-warning/70",
      },
      {
        label: "Healthy",
        count: machines.filter(
          (machine) =>
            machine.legacyCompatible && machine.status === "healthy",
        ).length,
        colorClassName: "bg-success/70",
      },
      {
        label: "Offline",
        count: machines.filter(
          (machine) =>
            machine.legacyCompatible && machine.status === "offline",
        ).length,
        colorClassName: "bg-muted-foreground/70",
      },
      {
        label: "Not Assessed",
        count: machines.filter((machine) => !machine.legacyCompatible).length,
        colorClassName: "bg-border",
      },
    ],
    [machines],
  );

  const machineById = useMemo(
    () => Object.fromEntries(machines.map((machine) => [machine.id, machine])),
    [machines],
  );

  const downtimeData = useMemo(() => {
    return simulationRuns
      .slice(0, 6)
      .reverse()
      .map((run) => ({
        label: `${machineById[run.machineId]?.name ?? "Machine"} · ${run.scenarioName}`,
        downtime: run.projectedDowntimeHours,
      }));
  }, [machineById, simulationRuns]);

  const compactTelemetry = liveTelemetry.telemetry;

  const recentActivity = history.slice(0, 5);

  if (
    !loading &&
    !loadError &&
    activePersona?.role === "user" &&
    machines.length === 0
  ) {
    return <NoMachineAccessState />;
  }

  return (
    <div className="flex flex-col gap-6">
      {loadError ? (
        <ErrorNotice
          error={loadError}
          actionLabel="Try Again"
          onAction={() => setLoadAttempt((value) => value + 1)}
        />
      ) : null}
      <div className="grid w-full gap-3 sm:grid-cols-2">
        <Card size="sm">
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <CardDescription className="text-sm">Fleet Size</CardDescription>
              <CardTitle className="mt-1 text-xl tabular-nums">
                {machines.length}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CpuIcon aria-hidden="true" />
              Monitored assets
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <CardDescription className="text-sm">
                Recent Simulations
              </CardDescription>
              <CardTitle className="mt-1 text-xl tabular-nums">
                {simulationRuns.length}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FlaskIcon aria-hidden="true" />
              Your scenario runs
            </div>
          </CardContent>
        </Card>
      </div>

      {machines.length > 0 && (
        <LiveDataHealthContent
          machines={machines}
          fleet={fleetLive.fleet}
          isLoading={fleetLive.isLoading}
          error={fleetLive.error}
          lastCheckedAt={fleetLive.lastCheckedAt}
        />
      )}

      {machines.length > 0 && (
        <div className="flex flex-col gap-6">
          <section aria-labelledby="machines-needing-attention-heading">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2
                  id="machines-needing-attention-heading"
                  className="text-lg font-semibold"
                >
                  Machines Needing Attention
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Prioritise overdue service and higher-risk machines before
                  routine activity.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium tabular-nums">
                  {needsAttentionCount}{" "}
                  {needsAttentionCount === 1 ? "machine" : "machines"}
                </span>
                <Badge
                  variant={attentionCounts.risk > 0 ? "destructive" : "outline"}
                >
                  {attentionCounts.risk} At Risk
                </Badge>
                <Badge
                  variant={attentionCounts.watch > 0 ? "warning" : "outline"}
                >
                  {attentionCounts.watch} Needs Watching
                </Badge>
              </div>
            </div>

            {machinesNeedingAttention.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {machinesNeedingAttention.map((machine) => {
                  const nextServiceDate = new Date(machine.nextServiceDate);
                  const hasScheduledService = !Number.isNaN(
                    nextServiceDate.getTime(),
                  );
                  const isOverdue =
                    hasScheduledService && nextServiceDate < new Date();
                  const statusLabel =
                    machine.status === "risk" ? "At Risk" : "Needs Watching";

                  return (
                    <Card key={machine.id}>
                      <CardHeader className="gap-3 pb-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <CardTitle>{machine.name}</CardTitle>
                            <CardDescription className="mt-1 text-sm">
                              {machine.line} · {machine.model}
                            </CardDescription>
                          </div>
                          <Badge
                            variant={badgeVariantForMachineStatus(
                              machine.status,
                            )}
                          >
                            {statusLabel}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {machine.status === "risk"
                            ? "Review this machine before routine fleet activity."
                            : "Monitor this machine for signs of increasing risk."}
                        </p>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-6 border-y border-border py-4">
                          <LivePredictionBar
                            health={liveHealthById.get(machine.id) ?? null}
                            serverTime={liveServerTime}
                          />
                          <MachineMetric
                            label="Health"
                            value={machine.healthScore}
                            indicatorClassName="bg-success/55"
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm text-muted-foreground">
                            Next service:{" "}
                            {isOverdue
                              ? "Overdue"
                              : hasScheduledService
                                ? formatDateTime(machine.nextServiceDate)
                                : machine.nextServiceDate}
                          </p>
                          <Button asChild size="sm">
                            <Link href={`/machines/${machine.id}`}>
                              Review Machine
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="border border-border p-4">
                <p className="text-sm font-medium">
                  No machines currently need attention
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No machines are currently marked at risk or needing watch.
                </p>
              </div>
            )}
          </section>

          {otherMachines.length > 0 && (
            <section aria-labelledby="other-machines-heading">
              <h2
                id="other-machines-heading"
                className="mb-4 text-lg font-semibold"
              >
                Other Machines
              </h2>
              <div className="border border-border">
                {otherMachines.map((machine) => (
                  <div
                    key={machine.id}
                    className="grid gap-4 border-b border-border p-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{machine.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {machine.legacyCompatible
                          ? `${machine.line} · ${machine.model}`
                          : "Registered machine · Health monitoring not available"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <Badge
                        variant={
                          machine.legacyCompatible
                            ? badgeVariantForMachineStatus(machine.status)
                            : "outline"
                        }
                      >
                        {machine.legacyCompatible
                          ? machine.status === "healthy"
                            ? "Healthy"
                            : "Offline"
                          : "Not Assessed"}
                      </Badge>
                      <div className="flex min-w-56 flex-wrap gap-4 sm:w-96 sm:flex-nowrap">
                        <LivePredictionBar
                          health={liveHealthById.get(machine.id) ?? null}
                          serverTime={liveServerTime}
                        />
                        {machine.legacyCompatible ? (
                          <MachineMetric
                            label="Health"
                            value={machine.healthScore}
                            indicatorClassName="bg-success/55"
                          />
                        ) : null}
                      </div>
                    </div>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="justify-self-start sm:justify-self-end"
                    >
                      <Link href={`/machines/${machine.id}`}>View Machine</Link>
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-sm">Fleet Status</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            Overall condition of the machines available to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {machines.length > 0 ? (
            <>
              <div
                className="flex h-2.5 w-full overflow-hidden bg-muted"
                role="img"
                aria-label={fleetStatus
                  .map(({ label, count }) => `${label}: ${count}`)
                  .join(", ")}
              >
                {fleetStatus.map(
                  ({ label, count, colorClassName }) =>
                    count > 0 && (
                      <div
                        key={label}
                        className={colorClassName}
                        style={{ flexGrow: count }}
                      />
                    ),
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {fleetStatus.map(({ label, count, colorClassName }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span
                      className={`size-2.5 shrink-0 ${colorClassName}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className="text-sm font-medium tabular-nums">
                        {count} {count === 1 ? "machine" : "machines"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {loading ? "Loading fleet status…" : "No machines available."}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="text-sm">Machine Sensor Data</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              View recent readings for a selected machine and sensor.
            </CardDescription>
            <div className="grid gap-3 border border-border bg-muted/30 p-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Machine</span>
                <Select
                  value={telemetryMachineId}
                  onValueChange={setSelectedTelemetryMachineId}
                >
                  <SelectTrigger
                    aria-label="Telemetry machine"
                    className="w-full bg-background text-sm"
                  >
                    <SelectValue placeholder="Select a machine" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {machines.map((machine) => (
                        <SelectItem key={machine.id} value={machine.id}>
                          {machine.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Sensor</span>
                <Select
                  value={selectedMetric}
                  onValueChange={(value) =>
                    setSelectedMetric(value as TelemetryMetric)
                  }
                >
                  <SelectTrigger
                    aria-label="Telemetry sensor"
                    className="w-full bg-background text-sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {telemetryMetrics.map((metric) => (
                        <SelectItem key={metric.key} value={metric.key}>
                          {metric.label} ({metric.unit})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <LiveTelemetrySummary
              latestPoint={liveTelemetry.latestPoint}
              connectionState={liveTelemetry.connectionState}
              isStale={liveTelemetry.isStale}
              lastCheckedAt={liveTelemetry.lastCheckedAt}
              provenance={liveTelemetry.provenance}
              machineType={telemetryMachine?.machineType}
            />
            {compactTelemetry.length > 0 ? (
              <ChartContainer config={telemetryConfig} className="h-56 w-full">
                <LineChart data={compactTelemetry}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatTelemetryChartTime}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        className="min-w-48 [&_.justify-between]:gap-6"
                        labelFormatter={formatTelemetryTooltipTimestamp}
                      />
                    }
                  />
                  <Line
                    dataKey={selectedMetric}
                    stroke={`var(--color-${selectedMetric})`}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            ) : liveTelemetry.connectionState === "connecting" &&
              !liveTelemetry.lastCheckedAt ? (
              <div className="flex h-56 items-center justify-center border border-dashed border-border bg-muted/20 px-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Checking for sensor data…
                </p>
              </div>
            ) : liveTelemetry.connectionState === "connected" &&
              liveTelemetry.lastCheckedAt ? (
              <div className="flex h-56 flex-col items-center justify-center border border-dashed border-border bg-muted/20 px-6 text-center">
                <ChartLineIcon
                  className="mb-3 size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium">No Sensor Data Available</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  This machine has not provided any readings yet. Add machine
                  data to begin monitoring it, or choose another machine above.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-4">
                  <Link href="/mlops">Add Machine Data</Link>
                </Button>
              </div>
            ) : (
              <div className="flex h-56 items-center justify-center border border-dashed border-border bg-muted/20 px-6 text-center">
                <div>
                  <p className="text-sm font-medium">
                    Sensor Data Is Currently Unavailable
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The dashboard will try to reconnect automatically.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="text-sm">Recent Activity</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Latest machine and workflow events.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">
                Loading recent activity…
              </p>
            ) : recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No recent activity yet.
              </p>
            ) : null}
            {recentActivity.map((event) => {
              const eventMachineId = event.entityId ?? event.machineId;
              const machine = eventMachineId
                ? machineById[eventMachineId]
                : undefined;
              const isAttentionEvent =
                event.type === "fault-prediction" ||
                event.type === "telemetry-anomaly";

              return (
                <div
                  key={event.id}
                  className="border border-border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {labelForEventType(event.type)}
                    </Badge>
                    {isAttentionEvent ? (
                      <Badge variant={badgeVariantForSeverity(event.severity)}>
                        {event.severity}
                      </Badge>
                    ) : null}
                    <SourceAttribution provenance={event.provenance} />
                    <span className="text-xs text-muted-foreground lg:ml-auto">
                      {formatDateTime(event.timestamp)}
                    </span>
                  </div>
                  <p className="mt-2 font-medium">{event.title}</p>
                  <p className="mt-1 text-muted-foreground">
                    {event.description}
                  </p>
                  {machine && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {machine.name}
                      </span>
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="h-6 px-0 text-xs"
                      >
                        <Link href={`/machines/${machine.id}`}>
                          View Machine →
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            <Separator />
            <Button asChild variant="ghost" size="sm">
              <Link href="/history">
                <CalendarDotsIcon data-icon="inline-start" />
                View Full History
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">
              Downtime Impact from Simulations
            </CardTitle>
            <SourceAttribution provenance={displayedSimulationProvenance} />
          </div>
          <CardDescription className="text-sm leading-relaxed">
            Most recent scenario outcomes for the current user.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-56 items-center justify-center border border-dashed border-border bg-muted/20 px-6 text-center">
              <p className="text-sm text-muted-foreground">
                Loading simulation results…
              </p>
            </div>
          ) : downtimeData.length > 0 ? (
            <ChartContainer config={downtimeConfig} className="h-56 w-full">
              <AreaChart data={downtimeData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => {
                    const label = String(value);
                    return label.length > 24
                      ? `${label.slice(0, 22)}…`
                      : label;
                  }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="downtime"
                  stroke="var(--color-downtime)"
                  fill="var(--color-downtime)"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ChartContainer>
          ) : !loadError ? (
            <div className="flex h-56 flex-col items-center justify-center border border-dashed border-border bg-muted/20 px-6 text-center">
              <FlaskIcon
                className="mb-3 size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-sm font-medium">No Simulation Results Yet</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Run a scenario to compare its projected downtime with current
                machine conditions.
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link href="/simulator">Run a Simulation</Link>
              </Button>
            </div>
          ) : (
            <div className="flex h-56 items-center justify-center border border-dashed border-border bg-muted/20 px-6 text-center">
              <p className="text-sm text-muted-foreground">
                Simulation results are currently unavailable.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
