"use client";

import { useState } from "react";
import {
  ArrowUUpLeftIcon,
  BroadcastIcon,
  CheckCircleIcon,
  SealCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CAPABILITY_LABEL } from "@/lib/demo-mlops/datasets";
import type {
  Capability,
  DemoMachine,
  ModelDeployment,
  QualityStatus,
  TrainingRun,
} from "@/lib/demo-mlops/types";
import { cn } from "@/lib/utils";

const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });

const QUALITY_LABEL: Record<QualityStatus, string> = {
  recommended: "Beats the trivial answer",
  borderline: "Narrow, or a deliberate trade",
  not_recommended: "No better than the trivial answer",
  incompatible: "Cannot be compared",
};

const QUALITY_TONE: Record<QualityStatus, string> = {
  recommended: "border-[var(--status-healthy)]/45 text-[var(--status-healthy)]",
  borderline: "border-[var(--status-watch)]/50 text-[var(--status-watch)]",
  not_recommended: "border-destructive/45 text-destructive",
  incompatible: "border-border text-muted-foreground",
};

/**
 * The one number a promotion decision hangs on: how much better than the answer you would
 * get for free. A raw accuracy is not it — 96 % on a dataset that is 96 % healthy is zero.
 */
function scoreAgainstBaseline(run: TrainingRun): { headline: string; against: string } {
  if (run.capability === "predict") {
    const lift = run.metrics.test_accuracy_lift;
    return {
      headline:
        run.metrics.test_balanced_accuracy !== undefined
          ? percent.format(run.metrics.test_balanced_accuracy)
          : "—",
      against:
        lift === undefined
          ? "no baseline"
          : `${lift >= 0 ? "+" : ""}${percent.format(lift)} over always guessing "${run.outputContract?.baselineLabel ?? "the common outcome"}"`,
    };
  }
  const rmse = run.metrics.test_rmse;
  const baseline = run.metrics.persistence_baseline_rmse;
  const gain = rmse !== undefined && baseline !== undefined && baseline > 0 ? (baseline - rmse) / baseline : undefined;
  return {
    headline: rmse !== undefined ? decimal.format(rmse) : "—",
    against:
      gain === undefined
        ? "no baseline"
        : `${gain >= 0 ? "+" : ""}${percent.format(gain)} over repeating the last reading`,
  };
}

type Props = {
  machine: DemoMachine;
  capability: Capability;
  runs: TrainingRun[];
  deployment: ModelDeployment | undefined;
  onPromote: (run: TrainingRun, overrideReason: string | null) => void;
  onBack: () => void;
};

export function PromotionStage({
  machine,
  capability,
  runs,
  deployment,
  onPromote,
  onBack,
}: Props) {
  const candidates = runs.filter((run) => run.status === "succeeded");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const selected = candidates.find((run) => run.id === selectedId) ?? null;
  const quality = selected?.outputContract?.qualityStatus ?? "incompatible";
  const needsReason = quality === "not_recommended";
  const blocked = quality === "incompatible";
  const canPromote = selected !== null && !blocked && (!needsReason || reason.trim().length >= 12);

  function promote() {
    if (!selected || !canPromote) return;
    onPromote(selected, needsReason ? reason.trim() : null);
    setSelectedId(null);
    setReason("");
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="gap-1 border-b bg-muted/30 py-4">
          <p className="instrument-label">Step 5 · Promote</p>
          <CardTitle className="text-lg">Decide what serves</CardTitle>
          <CardDescription>
            Promotion moves an alias, not a file. Everything that asks this machine for a{" "}
            {CAPABILITY_LABEL[capability].toLowerCase()} follows the alias, so one decision here
            changes every caller at once — and the previous version stays exactly where it was.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {candidates.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No finished runs to choose between yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Run</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Dataset</TableHead>
                  <TableHead className="text-right">
                    {capability === "predict" ? "Balanced accuracy" : "RMSE"}
                  </TableHead>
                  <TableHead>Against the trivial answer</TableHead>
                  <TableHead>Verdict</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((run) => {
                  const score = scoreAgainstBaseline(run);
                  const status = run.outputContract?.qualityStatus ?? "incompatible";
                  const isSelected = run.id === selectedId;
                  const isServing = deployment?.trainingRunId === run.id;
                  return (
                    <TableRow
                      key={run.id}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn("cursor-pointer", isSelected && "bg-primary/6")}
                      onClick={() => {
                        setSelectedId(run.id);
                        setReason("");
                      }}
                    >
                      <TableCell>
                        <input
                          type="radio"
                          name="promotion-candidate"
                          aria-label={`Select ${run.id}`}
                          checked={isSelected}
                          onChange={() => {
                            setSelectedId(run.id);
                            setReason("");
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {run.id}
                        {isServing && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            serving
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {run.architectureLabel}
                        <span className="block text-muted-foreground">
                          version {run.modelVersion}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">v{run.datasetVersion}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {score.headline}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{score.against}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px]", QUALITY_TONE[status])}>
                          {QUALITY_LABEL[status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="gap-1">
            <p className="instrument-label">Promotion</p>
            <CardTitle className="flex items-center gap-2 text-base">
              <SealCheckIcon /> Send to production
            </CardTitle>
            <CardDescription>
              {selected
                ? `${selected.architectureLabel} · ${selected.id}`
                : "Pick a run from the table above."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selected && (
              <p
                className={cn(
                  "flex items-start gap-2 rounded-lg border p-3 text-sm",
                  quality === "recommended"
                    ? "border-[var(--status-healthy)]/40 bg-[var(--status-healthy)]/10"
                    : quality === "borderline"
                      ? "border-[var(--status-watch)]/45 bg-[var(--status-watch)]/10"
                      : "border-destructive/40 bg-destructive/10 text-destructive",
                )}
              >
                {quality === "recommended" ? (
                  <CheckCircleIcon className="mt-0.5 shrink-0" aria-hidden="true" />
                ) : (
                  <WarningCircleIcon className="mt-0.5 shrink-0" aria-hidden="true" />
                )}
                <span>{selected.outputContract?.qualityNote}</span>
              </p>
            )}

            {blocked && selected && (
              <p className="text-xs leading-5 text-muted-foreground">
                This run has no comparable baseline, so there is no evidence it would help. The
                gate does not take a reason for this one — retrain it on a dataset the score can
                be judged against.
              </p>
            )}

            {needsReason && (
              <div className="space-y-1.5">
                <Label htmlFor="override-reason">
                  Why promote a model no better than the trivial answer?
                </Label>
                <Textarea
                  id="override-reason"
                  className="min-h-24"
                  placeholder="Recorded against the deployment. e.g. shadow-serving only, to collect calibration data before the next retrain."
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {reason.trim().length >= 12
                    ? "Stored with the deployment record."
                    : "At least a sentence. The gate is not asking to be dismissed, it is asking to be answered."}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={!canPromote} onClick={promote}>
                <SealCheckIcon aria-hidden="true" /> Promote to production
              </Button>
              <Button variant="ghost" onClick={onBack}>
                <ArrowUUpLeftIcon aria-hidden="true" /> Train another
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-1">
            <p className="instrument-label">Currently serving</p>
            <CardTitle className="flex items-center gap-2 text-base">
              <BroadcastIcon /> {machine.name} · {CAPABILITY_LABEL[capability]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {deployment ? (
              <>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="font-mono text-xs text-muted-foreground">
                    {deployment.modelName}@{deployment.alias}
                  </p>
                  <p className="data-value mt-1 text-lg font-semibold">
                    version {deployment.modelVersion}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Promoted {deployment.requestedAt.replace("T", " ").slice(0, 19)} from{" "}
                    {deployment.trainingRunId}.
                  </p>
                </div>
                {deployment.overrideReason && (
                  <div className="rounded-lg border border-[var(--status-watch)]/45 bg-[var(--status-watch)]/10 p-3 text-xs leading-5">
                    <p className="font-medium">Promoted over the gate</p>
                    <p className="mt-1">{deployment.overrideReason}</p>
                  </div>
                )}
                <p className="text-xs leading-5 text-muted-foreground">
                  In production this alias is what the API resolves at request time. In this demo
                  nothing is served — the point on screen is the decision and its paper trail, not
                  the traffic.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                Nothing serves this goal yet. Until something does, callers get an honest error
                rather than a silently stale model.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
