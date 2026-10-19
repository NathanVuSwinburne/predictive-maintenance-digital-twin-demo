"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowsDownUpIcon,
  MagnifyingGlassIcon,
  SquaresFourIcon,
  TableIcon,
} from "@phosphor-icons/react";

import { useAuth } from "@/components/auth/auth-context";
import { ErrorNotice } from "@/components/feedback/error-notice";
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDataProvider } from "@/hooks/use-data-provider";
import { badgeVariantForMachineStatus } from "@/lib/domain/presentation";
import type { MachineSummary, MachineStatus } from "@/lib/domain/types";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";

export default function MachinesPage() {
  const provider = useDataProvider();
  const router = useRouter();
  const { activePersona } = useAuth();

  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [search, setSearch] = useState("");
  const [line, setLine] = useState("all");
  const [lines, setLines] = useState<string[]>(["all"]);
  const [status, setStatus] = useState<MachineStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"risk" | "health" | "name" | "uptime">(
    "risk",
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<UserFacingError | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!activePersona) {
      return;
    }

    const currentPersona = activePersona;
    let active = true;

    async function loadMachines() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const loadedMachines = await provider.listMachines({
          search,
          line,
          status,
          sortBy,
          sortDirection,
          authorizedForUserId:
            currentPersona.role === "user" ? currentPersona.id : undefined,
        });

        if (active) {
          setMachines(loadedMachines);
          const loadedLines = loadedMachines.map((machine) => machine.line);
          setLines((previous) => Array.from(new Set([
            ...(!search && line === "all" && status === "all" ? ["all"] : previous),
            ...loadedLines,
          ])));
        }
      } catch (error) {
        if (active) {
          setLoadError(toUserFacingError(error, "data.load", {
            title: "Machines could not be loaded",
            message: "The machine list is unavailable.",
          }));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadMachines();

    return () => {
      active = false;
    };
  }, [activePersona, line, loadAttempt, provider, search, sortBy, sortDirection, status]);

  const hasFilters = Boolean(search || line !== "all" || status !== "all");

  if (!hasFilters && !isLoading && !loadError && activePersona?.role === "user" && machines.length === 0) {
    return <NoMachineAccessState />;
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError ? (
        <ErrorNotice error={loadError} actionLabel="Try Again" onAction={() => setLoadAttempt((value) => value + 1)} />
      ) : null}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 items-end lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor="machine-search" className="text-sm font-medium">Search machines</label>
              <InputGroup>
                <InputGroupAddon align="inline-start">
                  <MagnifyingGlassIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="machine-search"
                  placeholder="Search by name, ID, model, or line"
                  className="text-sm"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </InputGroup>

            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor="machine-line" className="text-sm font-medium">Line</label>
              <Select value={line} onValueChange={setLine}>
                <SelectTrigger id="machine-line" className="w-full text-sm">
                  <SelectValue placeholder="Line" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {lines.map((lineOption) => (
                      <SelectItem key={lineOption} value={lineOption}>
                        {lineOption === "all" ? "All lines" : lineOption}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor="machine-status" className="text-sm font-medium">Status</label>
              <Select
                value={status}
                onValueChange={(value) =>
                  setStatus(value as MachineStatus | "all")
                }
              >
                <SelectTrigger id="machine-status" className="w-full text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="healthy">Healthy</SelectItem>
                    <SelectItem value="watch">Watch</SelectItem>
                    <SelectItem value="risk">Risk</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>

            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor="machine-sort" className="text-sm font-medium">Sort by</label>
              <Select
                value={sortBy}
                onValueChange={(value) =>
                  setSortBy(value as "risk" | "health" | "name" | "uptime")
                }
              >
                <SelectTrigger id="machine-sort" className="w-full text-sm">
                  <ArrowsDownUpIcon />
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="risk">Risk score</SelectItem>
                    <SelectItem value="health">Health score</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="uptime">Uptime</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>

            </div>
            <ToggleGroup
              aria-label="Machine view"
              type="single"
              value={viewMode}
              onValueChange={(value) => {
                if (value === "table" || value === "cards") {
                  setViewMode(value);
                }
              }}
              spacing={1}
            >
              <ToggleGroupItem value="table">
                <TableIcon />
                Table
              </ToggleGroupItem>
              <ToggleGroupItem value="cards">
                <SquaresFourIcon />
                Cards
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span role="status">{isLoading ? "Loading machines…" : loadError ? "Machine results unavailable." : `${machines.length} ${machines.length === 1 ? "machine matches" : "machines match"} current filters.`}</span>
              <Button variant="ghost" size="xs" disabled={!hasFilters} onClick={() => {
                setSearch("");
                setLine("all");
                setStatus("all");
              }}>Clear filters</Button>
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={() =>
                setSortDirection((current) =>
                  current === "asc" ? "desc" : "asc",
                )
              }
            >
              <ArrowsDownUpIcon data-icon="inline-start" />
              Direction: {sortDirection.toUpperCase()}
            </Button>
          </div>

          {!isLoading && !loadError && machines.length === 0 && (
            <Empty className="border border-dashed border-border">
              <EmptyHeader>
                <EmptyTitle>{hasFilters ? "No machines match your filters" : "No machines available"}</EmptyTitle>
                <EmptyDescription className="text-sm">{hasFilters ? "Try a different search, line, or status, or clear the filters." : "Add a machine through Machine Registry to get started."}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {(isLoading || loadError) && machines.length > 0 && (
            <p className="text-sm text-muted-foreground">Showing previously loaded machines; they may not match the selected filters.</p>
          )}
          {viewMode === "table" ? (
            <div className="overflow-x-auto border border-border">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Machine</TableHead>
                    <TableHead>Line</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Uptime</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {machines.map((machine) => (
                    <TableRow
                      key={machine.id}
                      className="cursor-pointer hover:bg-muted/60"
                      onClick={() => router.push(`/machines/${machine.id}`)}
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <Link href={`/machines/${machine.id}`} onClick={(event) => event.stopPropagation()} className="w-fit font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{machine.name}</Link>
                          <span className="text-sm text-muted-foreground">
                            {machine.id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{machine.line}</TableCell>
                      <TableCell>
                        <Badge
                          variant={badgeVariantForMachineStatus(machine.status)}
                        >
                          {machine.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{machine.riskScore}%</TableCell>
                      <TableCell>{machine.healthScore}%</TableCell>
                      <TableCell>{machine.uptimePercent}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {machines.map((machine) => (
                <Link
                  key={machine.id}
                  href={`/machines/${machine.id}`}
                  className="block focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Card className="transition-colors hover:bg-muted/60">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-sm">
                        {machine.name}
                        <Badge
                          variant={badgeVariantForMachineStatus(machine.status)}
                        >
                          {machine.status}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-sm">
                        {machine.id} · {machine.model}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Line</span>
                        <span>{machine.line}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Risk</span>
                        <span>{machine.riskScore}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Health</span>
                        <span>{machine.healthScore}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Uptime</span>
                        <span>{machine.uptimePercent}%</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {isLoading && (
            <p className="text-sm text-muted-foreground">
              Refreshing machine data...
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
