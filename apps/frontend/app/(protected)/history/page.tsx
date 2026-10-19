"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ClockCounterClockwiseIcon,
  FunnelSimpleIcon,
  UserIcon,
  WrenchIcon,
} from "@phosphor-icons/react";

import { useAuth } from "@/components/auth/auth-context";
import { ErrorNotice } from "@/components/feedback/error-notice";
import { SourceAttribution } from "@/components/provenance/source-attribution";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
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
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";

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
  const [isLoading, setIsLoading] = useState(true);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [filtersError, setFiltersError] = useState<UserFacingError | null>(null);
  const [filterAttempt, setFilterAttempt] = useState(0);
  const [loadError, setLoadError] = useState<UserFacingError | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  useEffect(() => {
    if (!activePersona) {
      return;
    }

    const currentPersona = activePersona;
    let active = true;

    async function bootstrap() {
      setFiltersError(null);
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
        setFiltersLoaded(true);
      } catch (error) {
        if (active) setFiltersError(toUserFacingError(error, "data.load", {
          title: "History filters could not be loaded",
          message: "Try again to load the user and machine filters.",
        }));
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [activePersona, filterAttempt, provider]);

  useEffect(() => {
    if (!activePersona || !filtersLoaded || invalidDateRange) {
      return;
    }

    const currentPersona = activePersona;
    let active = true;

    async function loadEvents() {
      setIsLoading(true);
      setLoadError(null);
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
        if (active) setLoadError(toUserFacingError(error, "data.load", {
          title: "History could not be loaded",
          message: "Operational events are temporarily unavailable.",
        }));
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
    filtersLoaded,
    invalidDateRange,
    loadAttempt,
    machineFilter,
    machines,
    provider,
    typeFilter,
    userFilter,
  ]);

  const hasFilters = Boolean((activePersona?.role === "admin" && userFilter !== "all") || machineFilter !== "all" || typeFilter !== "all" || dateFrom || dateTo);
  const showCurrentResults = filtersLoaded && !filtersError && !isLoading && !loadError && !invalidDateRange;

  const eventTypeCounts = useMemo(() => {
    return events.reduce<Record<string, number>>((acc, event) => {
      acc[event.type] = (acc[event.type] ?? 0) + 1;
      return acc;
    }, {});
  }, [events]);

  return (
    <div className="flex flex-col gap-4">
      {filtersError ? (
        <ErrorNotice error={filtersError} actionLabel="Try Again" onAction={() => setFilterAttempt((value) => value + 1)} />
      ) : null}
      {loadError ? (
        <ErrorNotice error={loadError} actionLabel="Try Again" onAction={() => setLoadAttempt((value) => value + 1)} />
      ) : null}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 lg:grid-cols-5">
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor="history-user" className="text-sm font-medium">User</label>
              <Select value={activePersona?.role === "user" ? activePersona.id : userFilter} onValueChange={setUserFilter}>
                <SelectTrigger
                  id="history-user"
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

            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor="history-machine" className="text-sm font-medium">Machine</label>
              <Select value={machineFilter} onValueChange={setMachineFilter}>
                <SelectTrigger id="history-machine" className="w-full text-sm">
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

            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor="history-type" className="text-sm font-medium">Event type</label>
              <Select
                value={typeFilter}
                onValueChange={(value) =>
                  setTypeFilter(value as HistoryEventType | "all")
                }
              >
                <SelectTrigger id="history-type" className="w-full text-sm">
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
                    <SelectItem value="failure-label">Failure label</SelectItem>
                    <SelectItem value="training-run">Training run</SelectItem>
                    <SelectItem value="model-import">Model import</SelectItem>
                    <SelectItem value="model-promotion">Model promotion</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>

            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor="history-from" className="text-sm font-medium">From date</label>
              <input
                id="history-from"
                type="date"
                className="h-8 border border-input bg-background px-2 text-sm"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />

            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor="history-to" className="text-sm font-medium">To date</label>
              <input
                id="history-to"
                aria-invalid={invalidDateRange}
                aria-describedby={invalidDateRange ? "history-date-error" : undefined}
                type="date"
                className="h-8 border border-input bg-background px-2 text-sm"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
              {invalidDateRange && <p id="history-date-error" role="alert" className="text-sm text-destructive">Choose an end date on or after the start date.</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <FunnelSimpleIcon />
            <span role="status">
              {showCurrentResults ? `${events.length} ${events.length === 1 ? "event" : "events"} found.` : invalidDateRange ? "Check the date range." : filtersError || loadError ? "History results unavailable." : "Loading history…"}
            </span>
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
            {showCurrentResults && Object.entries(eventTypeCounts).map(([type, count]) => (
              <Badge key={type} variant="outline">
                {labelForEventType(type as HistoryEventType)}: {count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card role="region" aria-label="History timeline">
        <CardHeader>
          <CardTitle className="text-sm">Timeline</CardTitle>
          <CardDescription className="text-sm">
            Newest events first.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2" aria-busy={isLoading && !filtersError && !invalidDateRange}>
          {!showCurrentResults && events.length > 0 && (
            <p className="text-sm text-muted-foreground">Showing previously loaded events; they may not match the selected filters.</p>
          )}
          {events.map((event) => (
            <div key={event.id} className="border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{labelForEventType(event.type)}</Badge>
                <Badge variant={badgeVariantForSeverity(event.severity)}>
                  {event.severity}
                </Badge>
                <SourceAttribution provenance={event.provenance} />
                <span className="text-muted-foreground">
                  {formatDateTime(event.timestamp)}
                </span>
              </div>

              <p className="mt-1 font-medium">{event.title}</p>
              <p className="text-muted-foreground">{event.description}</p>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-muted-foreground">
                {(event.entityId ?? event.machineId) && (
                  <span>
                    <WrenchIcon className="mr-1 inline" />
                    {machines.find((machine) => machine.id === event.entityId || machine.id === event.machineId)?.name ?? "Machine unavailable"}
                  </span>
                )}
                {event.userId && (
                  <span>
                    <UserIcon className="mr-1 inline" />
                    {users.find((user) => user.id === event.userId)?.name ?? "Operator unavailable"}
                  </span>
                )}
              </div>
            </div>
          ))}

          {isLoading && !filtersError && !invalidDateRange && (
            <p className="text-sm text-muted-foreground">
              Loading history timeline...
            </p>
          )}

          {showCurrentResults && events.length === 0 && (
            <Empty className="border border-dashed border-border">
              <EmptyHeader>
                <EmptyTitle>{hasFilters ? "No history records match the current filters." : "No activity recorded yet"}</EmptyTitle>
                <EmptyDescription className="text-sm">{hasFilters ? "Try a different date range, machine, or event type, or clear the filters." : "Recorded predictions, simulations, and maintenance activity will appear here."}</EmptyDescription>
              </EmptyHeader>
            </Empty>
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
