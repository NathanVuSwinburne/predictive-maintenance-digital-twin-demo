"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowsDownUpIcon,
  MagnifyingGlassIcon,
  SquaresFourIcon,
  TableIcon,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDataProvider } from "@/hooks/use-data-provider";
import { badgeVariantForMachineStatus } from "@/lib/domain/presentation";
import type { MachineSummary, MachineStatus } from "@/lib/domain/types";

export default function MachinesPage() {
  const provider = useDataProvider();
  const router = useRouter();
  const { activePersona } = useAuth();

  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [search, setSearch] = useState("");
  const [line, setLine] = useState("all");
  const [status, setStatus] = useState<MachineStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"risk" | "health" | "name" | "uptime">(
    "risk",
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!activePersona) {
      return;
    }

    const currentPersona = activePersona;
    let active = true;

    async function loadMachines() {
      setIsLoading(true);
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
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to load machines",
        );
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
  }, [activePersona, line, provider, search, sortBy, sortDirection, status]);

  const lines = useMemo(() => {
    const allLines = new Set(machines.map((machine) => machine.line));
    return ["all", ...Array.from(allLines)];
  }, [machines]);

  if (!isLoading && activePersona?.role === "user" && machines.length === 0) {
    return <NoMachineAccessState />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="instrument-label">Asset registry</p>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] md:text-3xl">Machine fleet</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Search, filter, and compare the current condition of every monitored asset.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Fleet filters</CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <MagnifyingGlassIcon />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Search machines"
                placeholder="Search by name, ID, model, or line"
                className="text-sm"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </InputGroup>

            <Select value={line} onValueChange={setLine}>
              <SelectTrigger className="w-full text-sm">
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

            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as MachineStatus | "all")
              }
            >
              <SelectTrigger className="w-full text-sm">
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

            <Select
              value={sortBy}
              onValueChange={(value) =>
                setSortBy(value as "risk" | "health" | "name" | "uptime")
              }
            >
              <SelectTrigger className="w-full text-sm">
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

            <ToggleGroup
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

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{machines.length} machines match current filters.</span>
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
                          <span className="font-medium">{machine.name}</span>
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
                  className="block"
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
