"use client";

import {
  ArrowRightIcon,
  GitBranchIcon,
  ImageIcon,
  LockSimpleIcon,
  PlusIcon,
} from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.62fr)]">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="gap-1 border-b bg-muted/30 py-4">
          <p className="instrument-label">Machine registry</p>
          <CardTitle className="text-lg">Choose a machine</CardTitle>
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
                  "group grid w-full gap-3 border-b p-4 text-left transition-colors last:border-b-0 sm:grid-cols-[42px_1fr_auto] sm:items-center",
                  isSelected ? "bg-primary/6 ring-1 ring-inset ring-primary/40" : "hover:bg-accent/40",
                )}
              >
                <span className="grid size-10 place-items-center border bg-primary/10 font-mono text-xs font-semibold text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{machine.name}</span>
                    <Badge variant="outline">Data source configured</Badge>
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Select to review this machine&rsquo;s historical data.
                  </span>
                </span>
                <ArrowRightIcon className="hidden text-muted-foreground transition-transform group-hover:translate-x-1 sm:block" />
              </button>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="gap-0 py-0">
          <CardHeader className="gap-1 border-b bg-muted/30 py-4">
            <p className="instrument-label">New registry entry</p>
            <CardTitle className="text-lg">Register a machine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 py-5">
            <div className="space-y-2">
              <Label htmlFor="entity-name">Machine name</Label>
              <Input
                id="entity-name"
                placeholder="Example: North line compressor 07"
                disabled
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-image">
                Machine image <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <div className="flex items-center gap-3 border border-dashed p-3 opacity-60">
                <span className="grid size-10 shrink-0 place-items-center border bg-muted/40 text-muted-foreground">
                  <ImageIcon size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Choose JPEG, PNG, or WebP</span>
                  <span className="block text-xs text-muted-foreground">
                    Up to 5 MB. Stored and served by this application.
                  </span>
                </span>
              </div>
            </div>
            <Button className="w-full" disabled>
              <PlusIcon aria-hidden="true" /> Register machine
            </Button>
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <LockSimpleIcon className="mt-0.5 shrink-0" />
              Registering writes to a database, so it is off in this demo. The three machines
              below it are fixed; everything downstream is computed live in your browser.
            </p>
          </CardContent>
        </Card>

        {selected && (
          <details className="border bg-card">
            <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-medium">
              <GitBranchIcon aria-hidden="true" />
              Schema history for {selected.name}
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                v{selected.schemaVersion}
              </span>
            </summary>
            <ol className="ml-6 border-l border-border/70 pb-4 pr-4">
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
                    <span className="font-mono text-[11px] text-muted-foreground">{migration.at}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{migration.summary}</p>
                </li>
              ))}
            </ol>
          </details>
        )}

        <Button onClick={onContinue} disabled={!selected} className="w-full">
          {selected ? `Open ${selected.name}'s data` : "Select a machine"}
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
