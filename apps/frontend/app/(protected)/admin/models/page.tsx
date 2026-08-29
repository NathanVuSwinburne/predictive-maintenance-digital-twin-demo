"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { CheckCircleIcon, SealCheckIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CAPABILITY_LABEL, DEMO_MACHINES, findMachine } from "@/lib/demo-mlops/datasets";
import {
  activeDeployment,
  getServerSnapshot,
  getSnapshot,
  promoteRun,
  runsFor,
  subscribe,
} from "@/lib/demo-mlops/store";
import type { Capability, QualityStatus, TrainingRun } from "@/lib/demo-mlops/types";

const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });

const QUALITY_LABEL: Record<QualityStatus, string> = {
  recommended: "recommended",
  borderline: "borderline",
  not_recommended: "not recommended",
  incompatible: "incompatible",
};

/**
 * The one number a promotion hangs on: how much better than the answer you get for free.
 * Raw accuracy is not it. 96% on a dataset that is 96% healthy is worth nothing.
 */
function scoreAgainstBaseline(run: TrainingRun): { score: string; baseline: string } {
  if (run.capability === "predict") {
    const balanced = run.metrics.test_balanced_accuracy;
    const lift = run.metrics.test_accuracy_lift;
    return {
      score: balanced === undefined ? "not scored" : `${percent.format(balanced)} balanced`,
      baseline:
        lift === undefined
          ? "no baseline recorded"
          : `${lift >= 0 ? "+" : ""}${percent.format(lift)} over always "${run.outputContract?.baselineLabel ?? "the common outcome"}"`,
    };
  }
  const rmse = run.metrics.test_rmse;
  const persistence = run.metrics.persistence_baseline_rmse;
  const gain =
    rmse !== undefined && persistence !== undefined && persistence > 0
      ? (persistence - rmse) / persistence
      : undefined;
  return {
    score: rmse === undefined ? "not scored" : `error ${decimal.format(rmse)}`,
    baseline:
      gain === undefined
        ? "no baseline recorded"
        : `${gain >= 0 ? "+" : ""}${percent.format(gain)} over repeating the last reading`,
  };
}

export default function MachineModelApprovalsPage() {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [machineId, setMachineId] = useState(DEMO_MACHINES[0].id);
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});

  const machine = findMachine(machineId) ?? DEMO_MACHINES[0];
  const candidates = machine.capabilities.flatMap((capability) =>
    runsFor(machine.id, capability).filter((run) => run.status === "succeeded"),
  );
  const activeByGoal = new Map(
    machine.capabilities
      .map((capability) => [capability, activeDeployment(machine.id, capability)] as const)
      .filter(([, deployment]) => deployment !== undefined),
  );
  const deployments = [...activeByGoal.values()].filter((item) => item !== undefined);

  function approve(run: TrainingRun) {
    const quality = run.outputContract?.qualityStatus ?? "incompatible";
    const reason = overrideReasons[run.id]?.trim() ?? "";
    if (quality === "not_recommended" && reason.length < 12) {
      toast.error("This one needs a reason", {
        description:
          "At least a sentence. The gate is not asking to be dismissed, it is asking to be answered.",
      });
      return;
    }
    promoteRun(run, quality === "not_recommended" ? reason : null);
    setOverrideReasons((current) => ({ ...current, [run.id]: "" }));
    toast.success(`Model version v${run.modelVersion} is now @production for this goal.`, {
      description:
        quality === "not_recommended"
          ? "Promoted over the gate. The reason is stored with the deployment."
          : "The alias moved. Nothing was copied.",
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="instrument-label">Model operations</p>
        <h1 className="text-2xl font-semibold tracking-[-0.04em]">Machine model approvals</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Training makes candidates. Only this page moves one to production, and it moves an
          alias rather than a file, so everything asking this machine for a prediction follows
          one decision made here.
        </p>
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheckIcon /> Registered machine
            </CardTitle>
            <CardDescription className="mt-2">
              Candidates come from the <Link href="/mlops" className="underline underline-offset-2">MLOps workspace</Link>.
              Train one there and it appears here.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-w-md space-y-2">
            <Label htmlFor="approval-machine">Machine</Label>
            <select
              id="approval-machine"
              className="h-9 w-full border border-input bg-background px-2 text-sm"
              value={machineId}
              onChange={(event) => setMachineId(event.target.value)}
            >
              {DEMO_MACHINES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Candidate and production versions</CardTitle>
          <CardDescription>
            Training and import create candidates only. Approval changes the alias and records
            the deployment audit.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Goal</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Dataset</TableHead>
                <TableHead>Score vs baseline</TableHead>
                <TableHead>Quality</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Admin action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((run) => {
                const active =
                  activeByGoal.get(run.capability as Capability)?.trainingRunId === run.id;
                const quality = run.outputContract?.qualityStatus ?? "incompatible";
                const score = scoreAgainstBaseline(run);
                return (
                  <TableRow key={run.id}>
                    <TableCell>{CAPABILITY_LABEL[run.capability]}</TableCell>
                    <TableCell className="font-mono">v{run.modelVersion}</TableCell>
                    <TableCell>
                      {run.datasetVersion ? `Dataset v${run.datasetVersion}` : "No dataset version"}
                      <span className="block max-w-40 truncate font-mono text-[11px] text-muted-foreground">
                        {run.datasetContentDigest}
                      </span>
                    </TableCell>
                    <TableCell>
                      {score.score}
                      <span className="block text-[11px] text-muted-foreground">
                        {score.baseline}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={quality === "incompatible" ? "destructive" : "outline"}>
                        {QUALITY_LABEL[quality]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {active ? (
                        <Badge className="gap-1">
                          <CheckCircleIcon /> @production
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Candidate</Badge>
                      )}
                    </TableCell>
                    <TableCell className="min-w-72">
                      {active ? (
                        <span className="text-xs text-muted-foreground">Currently serving</span>
                      ) : (
                        <div className="flex gap-2">
                          {quality === "not_recommended" && (
                            <Input
                              value={overrideReasons[run.id] ?? ""}
                              placeholder="Required override reason"
                              aria-label={`Override reason for v${run.modelVersion}`}
                              onChange={(event) =>
                                setOverrideReasons((current) => ({
                                  ...current,
                                  [run.id]: event.target.value,
                                }))
                              }
                            />
                          )}
                          <Button
                            size="sm"
                            disabled={quality === "incompatible"}
                            onClick={() => approve(run)}
                          >
                            <SealCheckIcon aria-hidden="true" /> Approve
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {candidates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No candidate versions for this machine yet. Train one in the MLOps workspace.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {deployments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Deployment audit</CardTitle>
            <CardDescription>What each alias points at, and who decided.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {deployments.map((deployment) => (
              <div key={deployment.id} className="border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">
                    {deployment.modelName}@{deployment.alias}
                  </span>
                  <Badge variant="outline">{CAPABILITY_LABEL[deployment.capability]}</Badge>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {deployment.requestedAt}
                  </span>
                </div>
                {deployment.overrideReason && (
                  <p className="mt-2 border-l-2 border-[var(--status-watch)] pl-3 text-xs leading-5 text-muted-foreground">
                    Override: {deployment.overrideReason}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
