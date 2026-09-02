"use client";

import { useMemo } from "react";
import { ArrowRightIcon, DatabaseIcon, PlugsConnectedIcon, WarningIcon } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CAPABILITY_LABEL } from "@/lib/demo-mlops/datasets";
import type { Capability, DemoMachine } from "@/lib/demo-mlops/types";

const REQUIRED_ROWS: Record<Capability, number> = { predict: 400, simulate: 300 };
const REQUIRED_EXAMPLES_PER_CLASS = 25;
const REQUIRED_SESSIONS = 3;

export type CapabilityReadiness = {
  capability: Capability;
  readyToTrain: boolean;
  progressPercent: number;
  nextAction: string;
  observedRows: number;
  observedSessions: number;
  classCounts: Record<string, number>;
};

/**
 * Whether this machine has enough of the right shape of data for a goal.
 *
 * The gate is deliberately about the *rare* class rather than the row total: 2 000 rows
 * with nine failures in them is not a training set for failure detection, however healthy
 * the row count looks on a dashboard.
 */
export function readinessFor(machine: DemoMachine, capability: Capability): CapabilityReadiness {
  const rows = machine.sampleRows;
  const sessions = new Set(rows.map((row) => row.sessionId)).size;
  const classCounts: Record<string, number> = {};
  if (machine.target) {
    for (const row of rows) {
      const key = String(row.values[machine.target.column] ?? "missing");
      classCounts[key] = (classCounts[key] ?? 0) + 1;
    }
  }

  if (capability === "predict") {
    const counts = Object.values(classCounts);
    const smallest = counts.length > 0 ? Math.min(...counts) : 0;
    const rowScore = Math.min(1, rows.length / REQUIRED_ROWS.predict);
    const classScore = Math.min(1, smallest / REQUIRED_EXAMPLES_PER_CLASS);
    const ready = counts.length >= 2 && smallest >= REQUIRED_EXAMPLES_PER_CLASS && rows.length >= REQUIRED_ROWS.predict;
    return {
      capability,
      readyToTrain: ready,
      progressPercent: Math.round(((rowScore + classScore) / 2) * 100),
      observedRows: rows.length,
      observedSessions: sessions,
      classCounts,
      nextAction: ready
        ? "Enough of every outcome to hold some back and still measure them."
        : counts.length < 2
          ? "Only one outcome appears in this data, so nothing can be detected from it."
          : `The rarest outcome has ${smallest} examples; ${REQUIRED_EXAMPLES_PER_CLASS} are needed before a held-out score means anything.`,
    };
  }

  const rowScore = Math.min(1, rows.length / REQUIRED_ROWS.simulate);
  const sessionScore = Math.min(1, sessions / REQUIRED_SESSIONS);
  const ready = rows.length >= REQUIRED_ROWS.simulate && sessions >= REQUIRED_SESSIONS;
  return {
    capability,
    readyToTrain: ready,
    progressPercent: Math.round(((rowScore + sessionScore) / 2) * 100),
    observedRows: rows.length,
    observedSessions: sessions,
    classCounts,
    nextAction: ready
      ? "Enough consecutive readings inside sessions to build forecasting windows."
      : `Needs ${REQUIRED_ROWS.simulate} readings across at least ${REQUIRED_SESSIONS} sessions.`,
  };
}

type Props = {
  machine: DemoMachine;
  onContinue: () => void;
};

export function MachineDataStage({ machine, onContinue }: Props) {
  const rows = machine.sampleRows;

  const missingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const feature of machine.features) {
      counts[feature.name] = rows.filter((row) => {
        const value = row.values[feature.name];
        return value === null || value === undefined || value === "";
      }).length;
    }
    return counts;
  }, [machine.features, rows]);

  const readiness = machine.capabilities.map((capability) => readinessFor(machine, capability));
  const preview = rows.slice(0, 8);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,1fr)]">
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="gap-1 border-b bg-muted/30 py-4">
            <p className="instrument-label">Column contract</p>
            <CardTitle className="text-lg">What {machine.name} sends</CardTitle>
            <CardDescription>
              The registered column contract. Timestamp and session stay metadata: they
              order and group the rows, and never become model inputs.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Column</TableHead>
                  <TableHead>Read as</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Blank</TableHead>
                  <TableHead>What it is</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/20">
                  <TableCell className="font-mono text-xs">{machine.timeColumn}</TableCell>
                  <TableCell className="text-xs">timestamp</TableCell>
                  <TableCell className="text-xs">n/a</TableCell>
                  <TableCell className="text-right font-mono text-xs">0</TableCell>
                  <TableCell className="text-xs text-muted-foreground">Metadata: orders rows</TableCell>
                </TableRow>
                <TableRow className="bg-muted/20">
                  <TableCell className="font-mono text-xs">{machine.sessionColumn}</TableCell>
                  <TableCell className="text-xs">text</TableCell>
                  <TableCell className="text-xs">n/a</TableCell>
                  <TableCell className="text-right font-mono text-xs">0</TableCell>
                  <TableCell className="text-xs text-muted-foreground">Metadata: groups a run</TableCell>
                </TableRow>
                {machine.features.map((feature) => (
                  <TableRow key={feature.name}>
                    <TableCell className="font-mono text-xs">{feature.name}</TableCell>
                    <TableCell className="text-xs">{feature.dtype}</TableCell>
                    <TableCell className="text-xs">{feature.unit ?? "n/a"}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {missingCounts[feature.name] > 0 ? (
                        <span className="text-[var(--status-watch)]">{missingCounts[feature.name]}</span>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{feature.note}</TableCell>
                  </TableRow>
                ))}
                {machine.target && (
                  <TableRow className="bg-primary/5">
                    <TableCell className="font-mono text-xs">{machine.target.column}</TableCell>
                    <TableCell className="text-xs">{machine.target.taskType}</TableCell>
                    <TableCell className="text-xs">n/a</TableCell>
                    <TableCell className="text-right font-mono text-xs">0</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      Target · {machine.target.classes.join(" / ")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {machine.sources.map((source) => (
            <Card key={source.id}>
              <CardHeader className="gap-1">
                <p className="instrument-label">Connected source</p>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PlugsConnectedIcon /> {source.label}
                </CardTitle>
                <CardDescription>{source.origin}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border bg-muted/20 p-2">
                    <span className="data-value block text-lg font-semibold">
                      {source.rowCount.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">rows</span>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-2">
                    <span className="data-value block text-lg font-semibold">{source.sessionCount}</span>
                    <span className="text-xs text-muted-foreground">sessions</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{source.licence}</p>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {source.kind}
                </Badge>
              </CardContent>
            </Card>
          ))}

          {readiness.map((item) => (
            <Card key={item.capability}>
              <CardHeader className="gap-1 pb-3">
                <p className="instrument-label">Training gate</p>
                <CardTitle className="text-base">{CAPABILITY_LABEL[item.capability]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={item.progressPercent} />
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  {item.readyToTrain ? null : <WarningIcon className="mt-0.5 shrink-0 text-[var(--status-watch)]" />}
                  {item.nextAction}
                </p>
                {Object.keys(item.classCounts).length > 0 && item.capability === "predict" && (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(item.classCounts).map(([label, count]) => (
                      <Badge key={label} variant="secondary" className="text-[10px]">
                        {label}: {count}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="gap-1 border-b bg-muted/30 py-4">
          <p className="instrument-label">Authoritative row preview</p>
          <CardTitle className="flex items-center gap-2 text-base">
            <DatabaseIcon /> First 8 of {rows.length.toLocaleString()} bundled rows
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>timestamp</TableHead>
                <TableHead>session</TableHead>
                {machine.features.map((feature) => (
                  <TableHead key={feature.name}>{feature.name}</TableHead>
                ))}
                {machine.target && <TableHead>{machine.target.column}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((row) => (
                <TableRow key={`${row.sessionId}-${row.timestamp}`}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {row.timestamp.replace("T", " ").slice(0, 19)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.sessionId}</TableCell>
                  {machine.features.map((feature) => (
                    <TableCell key={feature.name} className="font-mono text-xs">
                      {row.values[feature.name] === null ? (
                        <span className="text-[var(--status-watch)]">missing</span>
                      ) : (
                        String(row.values[feature.name])
                      )}
                    </TableCell>
                  ))}
                  {machine.target && (
                    <TableCell className="font-mono text-xs">
                      {String(row.values[machine.target.column])}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onContinue}>
          Prepare training data <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
