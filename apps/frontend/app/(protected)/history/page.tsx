"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ClockCounterClockwiseIcon,
  FunnelSimpleIcon,
  UserIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/auth-context";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useDataProvider } from "@/hooks/use-data-provider";
import {
  badgeVariantForSeverity,
  formatDateTime,
  labelForEventType,
} from "@/lib/domain/presentation";
import type {
  HistoryEvent,
  HistoryEventType,
  MachineSummary,
  UserPersona,
} from "@/lib/domain/types";

export default function HistoryPage() {
  const provider = useDataProvider();
  const { activePersona } = useAuth();

  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [users, setUsers] = useState<UserPersona[]>([]);
  const [machines, setMachines] = useState<MachineSummary[]>([]);

  const [userFilter, setUserFilter] = useState<string>("all");
  const [machineFilter, setMachineFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<HistoryEventType | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!activePersona) {
      return;
    }

    const currentPersona = activePersona;
    let active = true;

    async function bootstrap() {
      try {
        const isStandardUser = currentPersona.role === "user";
        const [loadedUsers, loadedMachines] = await Promise.all([
          isStandardUser
            ? Promise.resolve([currentPersona])
            : provider.listUsers(),
          provider.listMachines({
            sortBy: "name",
            sortDirection: "asc",
            authorizedForUserId: isStandardUser ? currentPersona.id : undefined,
          }),
        ]);

        if (!active) {
          return;
        }

        setUsers(loadedUsers);
        setMachines(loadedMachines);
        setUserFilter(isStandardUser ? currentPersona.id : "all");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to load filters",
        );
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [activePersona, provider]);

  useEffect(() => {
    if (!activePersona) {
      return;
    }

    const currentPersona = activePersona;
    let active = true;

    async function loadEvents() {
      setIsLoading(true);
      try {
        const isStandardUser = currentPersona.role === "user";
        const historyEvents = await provider.listHistoryEvents({
          userId: isStandardUser ? currentPersona.id : userFilter,
          machineId: machineFilter,
          machineIds: isStandardUser
            ? machines.map((machine) => machine.id)
            : undefined,
          type: typeFilter,
          dateFrom: dateFrom
            ? new Date(`${dateFrom}T00:00:00`).toISOString()
            : undefined,
          dateTo: dateTo
            ? new Date(`${dateTo}T23:59:59`).toISOString()
            : undefined,
        });

        if (active) {
          setEvents(historyEvents);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to load history",
        );
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadEvents();

    return () => {
      active = false;
    };
  }, [
    activePersona,
    dateFrom,
    dateTo,
    machineFilter,
    machines,
    provider,
    typeFilter,
    userFilter,
  ]);

  const eventTypeCounts = useMemo(() => {
    return events.reduce<Record<string, number>>((acc, event) => {
      acc[event.type] = (acc[event.type] ?? 0) + 1;
      return acc;
    }, {});
  }, [events]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="instrument-label">Operational record</p>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] md:text-3xl">History and events</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Review anomalies, predictions, simulations, and maintenance decisions across the fleet.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Operations History</CardTitle>
          <CardDescription className="text-sm">
            Browse through telemetry anomalies, predictions, maintenance
            actions, simulations and chat outcomes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 lg:grid-cols-5">
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger
                className="w-full text-sm"
                disabled={activePersona?.role === "user"}
              >
                <SelectValue placeholder="User" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All users</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select value={machineFilter} onValueChange={setMachineFilter}>
              <SelectTrigger className="w-full text-sm">
                <SelectValue placeholder="Machine" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All machines</SelectItem>
                  {machines.map((machine) => (
                    <SelectItem key={machine.id} value={machine.id}>
                      {machine.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              value={typeFilter}
              onValueChange={(value) =>
                setTypeFilter(value as HistoryEventType | "all")
              }
            >
              <SelectTrigger className="w-full text-sm">
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="telemetry-anomaly">
                    Telemetry anomaly
                  </SelectItem>
                  <SelectItem value="fault-prediction">
                    Fault prediction
                  </SelectItem>
                  <SelectItem value="maintenance-action">
                    Maintenance action
                  </SelectItem>
                  <SelectItem value="simulation-run">Simulation run</SelectItem>
                  <SelectItem value="chat-insight">Chat insight</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <input
              type="date"
              className="h-8 border border-input bg-background px-2 text-sm"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />

            <input
              type="date"
              className="h-8 border border-input bg-background px-2 text-sm"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <FunnelSimpleIcon />
            {events.length} events found.
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setUserFilter(
                  activePersona?.role === "user" && activePersona
                    ? activePersona.id
                    : "all",
                );
                setMachineFilter("all");
                setTypeFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear filters
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(eventTypeCounts).map(([type, count]) => (
              <Badge key={type} variant="outline">
                {labelForEventType(type as HistoryEventType)}: {count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Timeline</CardTitle>
          <CardDescription className="text-sm">
            Newest events first.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {events.map((event) => (
            <div key={event.id} className="border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{labelForEventType(event.type)}</Badge>
                <Badge variant={badgeVariantForSeverity(event.severity)}>
                  {event.severity}
                </Badge>
                <span className="text-muted-foreground">
                  {formatDateTime(event.timestamp)}
                </span>
              </div>

              <p className="mt-1 font-medium">{event.title}</p>
              <p className="text-muted-foreground">{event.description}</p>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-muted-foreground">
                {event.machineId && (
                  <span>
                    <WrenchIcon className="mr-1 inline" />
                    {event.machineId}
                  </span>
                )}
                {event.userId && (
                  <span>
                    <UserIcon className="mr-1 inline" />
                    {event.userId}
                  </span>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <p className="text-sm text-muted-foreground">
              Loading history timeline...
            </p>
          )}

          {!isLoading && events.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No history records match the current filters.
            </p>
          )}
        </CardContent>
      </Card>

      <Separator />

      <p className="text-sm text-muted-foreground">
        <ClockCounterClockwiseIcon className="mr-1 inline" />
        {activePersona?.role === "admin"
          ? "History records contain actions from all users, including diagnostic, simulation and maintenance events."
          : "History records shown here are limited to your authorised machine activity."}
      </p>
    </div>
  );
}
