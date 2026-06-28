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
  ClockCountdownIcon,
  CpuIcon,
  FlaskIcon,
  GaugeIcon,
  RobotIcon,
  TrendUpIcon,
  WarningDiamondIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/auth-context";
import { NoMachineAccessState } from "@/components/machines/no-machine-access-state";
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
import { Separator } from "@/components/ui/separator";
import { useDataProvider } from "@/hooks/use-data-provider";
import {
  badgeVariantForMachineStatus,
  formatDateTime,
} from "@/lib/domain/presentation";
import type {
  HistoryEvent,
  MachineSummary,
  SimulationRun,
} from "@/lib/domain/types";

const trendConfig = {
  risk: {
    label: "Risk",
    color: "var(--chart-2)",
  },
  uptime: {
    label: "Uptime",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

const downtimeConfig = {
  downtime: {
    label: "Downtime",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

export default function DashboardPage() {
  const provider = useDataProvider();
  const { activePersona } = useAuth();

  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [simulationRuns, setSimulationRuns] = useState<SimulationRun[]>([]);
  const [loading, setLoading] = useState(true);

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
      try {
        const loadedMachines = await provider.listMachines({
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
            ? loadedRuns.filter((run) => visibleMachineIds.includes(run.machineId))
            : loadedRuns,
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to load dashboard",
        );
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
  }, [activePersona, provider]);

  const atRiskMachines = useMemo(
    () =>
      machines.filter(
        (machine) => machine.status === "risk" || machine.status === "watch",
      ),
    [machines],
  );

  const averageRisk = useMemo(() => {
    if (machines.length === 0) {
      return 0;
    }

    return Math.round(
      machines.reduce((sum, machine) => sum + machine.riskScore, 0) /
        machines.length,
    );
  }, [machines]);

  const trendData = useMemo(() => {
    return machines.slice(0, 8).map((machine) => ({
      machine: machine.name.replace("Machine ", "M"),
      risk: machine.riskScore,
      uptime: machine.uptimePercent,
    }));
  }, [machines]);

  const downtimeData = useMemo(() => {
    return simulationRuns
      .slice(0, 6)
      .reverse()
      .map((run, index) => ({
        label: `Run ${index + 1}`,
        downtime: run.projectedDowntimeHours,
      }));
  }, [simulationRuns]);

  const upcomingMaintenance = useMemo(
    () =>
      [...machines]
        .sort((a, b) => (a.nextServiceDate > b.nextServiceDate ? 1 : -1))
        .slice(0, 5),
    [machines],
  );

  const latestInsights = history.slice(0, 5);

  if (!loading && activePersona?.role === "user" && machines.length === 0) {
    return <NoMachineAccessState />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-sm">Fleet Size</CardDescription>
            <CardTitle className="text-lg">{machines.length}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <CpuIcon />
            Active monitored assets
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-sm">
              At-risk Machines
            </CardDescription>
            <CardTitle className="text-lg">{atRiskMachines.length}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <WarningDiamondIcon />
            Watch + risk states combined
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-sm">
              Average Risk Score
            </CardDescription>
            <CardTitle className="text-lg">{averageRisk}%</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendUpIcon />
            Based on latest prediction pass
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-sm">
              Recent Simulations
            </CardDescription>
            <CardTitle className="text-lg">{simulationRuns.length}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <FlaskIcon />
            Scenario runs by active user
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="text-sm">Risk and Uptime Snapshot</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Compare machine risk against uptime to prioritise prescriptive
              maintenance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendConfig} className="h-72 w-full">
              <LineChart data={trendData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="machine" tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="risk"
                  stroke="var(--color-risk)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="uptime"
                  stroke="var(--color-uptime)"
                  strokeWidth={2}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="text-sm">Quick Actions</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Most common workflows for technicians.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button asChild variant="outline">
              <Link href="/machines">
                <GaugeIcon data-icon="inline-start" />
                Review machine list
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/chat">
                <RobotIcon data-icon="inline-start" />
                Open AI Assistant
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/simulator">
                <FlaskIcon data-icon="inline-start" />
                Run simulation
              </Link>
            </Button>
            <Button asChild>
              <Link href="/history">
                <ClockCountdownIcon data-icon="inline-start" />
                Open operations history
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="text-sm">
              Upcoming Maintenance Windows
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Scheduled interventions by next service date.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {upcomingMaintenance.map((machine) => (
              <div
                key={machine.id}
                className="flex items-center justify-between border border-border p-3 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{machine.name}</span>
                  <span className="text-muted-foreground">
                    {machine.line} · {machine.model}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={badgeVariantForMachineStatus(machine.status)}>
                    {machine.status}
                  </Badge>
                  <span className="text-muted-foreground">
                    {formatDateTime(machine.nextServiceDate)}
                  </span>
                </div>
              </div>
            ))}
            {loading && (
              <p className="text-sm text-muted-foreground">
                Loading maintenance plan...
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="text-sm">
              Downtime Impact from Simulations
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Most recent scenario outcomes for the current user.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={downtimeConfig} className="h-56 w-full">
              <AreaChart data={downtimeData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-sm">Latest Operational Insights</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            Recent events from predictions, chat diagnostics and maintenance
            actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {latestInsights.map((event) => (
            <div key={event.id} className="border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{event.type}</Badge>
                <span className="text-sm text-muted-foreground">
                  {formatDateTime(event.timestamp)}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium">{event.title}</p>
              <p className="text-sm text-muted-foreground">
                {event.description}
              </p>
            </div>
          ))}
          <Separator />
          <Button asChild variant="ghost" size="sm">
            <Link href="/history">
              <CalendarDotsIcon data-icon="inline-start" />
              View full history
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
