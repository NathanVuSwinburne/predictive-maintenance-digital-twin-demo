"use client";

import {
  ArrowRightIcon,
  CpuIcon,
  GitBranchIcon,
  LockSimpleIcon,
  StackIcon,
} from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CAPABILITY_LABEL } from "@/lib/demo-mlops/datasets";
import type { DemoMachine } from "@/lib/demo-mlops/types";
import { cn } from "@/lib/utils";

type Props = {
  machines: DemoMachine[];
  selectedId: string | null;
  onSelect: (machineId: string) => void;
  onContinue: () => void;
};

export function MachineRegistryStage({ machines, selectedId, onSelect, onContinue }: Props) {
  const selected = machines.find((machine) => machine.id === selectedId) ?? null;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.68fr)]">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="gap-1 border-b bg-muted/30 py-4">
          <p className="instrument-label">Machine registry</p>
          <CardTitle className="text-lg">Choose a machine</CardTitle>
          <CardDescription>
            Every machine here is the same kind of object: named columns, a declared type per
            column, a schema version, and a list of goals it can support.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {machines.map((machine, index) => {
            const isSelected = machine.id === selectedId;
            return (
              <button
                key={machine.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(machine.id)}
                className={cn(
                  "group grid w-full gap-3 border-b p-4 text-left transition-colors last:border-b-0 sm:grid-cols-[44px_1fr_auto] sm:items-center",
                  isSelected ? "bg-primary/6 ring-1 ring-inset ring-primary/35" : "hover:bg-accent/40",
                )}
              >
                <span className="grid size-10 place-items-center rounded-lg border bg-primary/10 font-mono text-xs font-semibold text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{machine.name}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      schema v{machine.schemaVersion}
                    </Badge>
                    {machine.capabilities.map((capability) => (
                      <Badge key={capability} variant="secondary" className="text-[10px]">
                        {CAPABILITY_LABEL[capability]}
                      </Badge>
                    ))}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{machine.description}</span>
                  <span className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <span>{machine.features.length} columns</span>
                    <span>{machine.sampleRows.length.toLocaleString()} rows bundled</span>
                    <span>{machine.sources.length} source</span>
                  </span>
                </span>
                <ArrowRightIcon className="hidden text-muted-foreground transition-transform group-hover:translate-x-1 sm:block" />
              </button>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="gap-1">
            <p className="instrument-label">Why there is no “add machine” form</p>
            <CardTitle className="text-base">Read-only registry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              In the full stack this stage registers a machine, uploads an image and opens a
              data source against a database. This demo has no backend, so the registry is
              fixed at three entries — but everything downstream of it is live, computed in
              your browser from the rows bundled with the page.
            </p>
            <p className="flex items-start gap-2">
              <LockSimpleIcon className="mt-0.5 shrink-0" />
              No client telemetry ships with this repository. Two machines are public
              benchmark data, one is a seeded synthetic fixture.
            </p>
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader className="gap-1">
              <p className="instrument-label">Schema history</p>
              <CardTitle className="flex items-center gap-2 text-base">
                <GitBranchIcon /> How {selected.name} became generic
              </CardTitle>
              <CardDescription>
                Each entry is a version of this machine&rsquo;s contract. The last one is the
                point it stopped needing code of its own.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              <ol className="relative ml-6 border-l border-border/70 pb-4 pr-4">
                {selected.migrations.map((migration) => (
                  <li key={migration.schemaVersion} className="relative py-3 pl-5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute -left-[5px] top-4 size-2.5 rounded-full border-2 border-card",
                        migration.schemaVersion === selected.schemaVersion
                          ? "bg-primary"
                          : "bg-muted-foreground/50",
                      )}
                    />
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[11px] font-semibold text-primary">
                        v{migration.schemaVersion}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">{migration.at}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{migration.summary}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        <Button onClick={onContinue} disabled={!selected} className="w-full">
          <StackIcon data-icon="inline-start" />
          {selected ? `Open ${selected.name}'s data` : "Select a machine"}
        </Button>
        {selected && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <CpuIcon className="mt-0.5 shrink-0" />
            {selected.population.rows.toLocaleString()} rows across{" "}
            {selected.population.sessions} sessions in the full source ·{" "}
            {selected.population.span}
          </p>
        )}
      </div>
    </div>
  );
}
