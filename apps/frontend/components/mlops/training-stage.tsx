"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  CubeIcon,
  PlayIcon,
  ProhibitIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";

import { ModelScorecard } from "@/components/mlops/model-scorecard";
import { TrainingConfigurationPanel } from "@/components/mlops/training-configuration-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CAPABILITY_LABEL } from "@/lib/demo-mlops/datasets";
import {
  architecturesFor,
  BROWSER_ARCHITECTURES,
  defaultsForArchitecture,
  findArchitecture,
} from "@/lib/demo-mlops/training";
import type {
  ArchitectureOption,
  Capability,
  DatasetVersion,
  TrainingRun,
} from "@/lib/demo-mlops/types";
import { cn } from "@/lib/utils";

type Values = Record<string, string | number | boolean>;

/**
 * Everything wrong with the configuration, stated before the run starts rather than
 * discovered as a stack trace 90 seconds in.
 */
function configurationProblems(architecture: ArchitectureOption, values: Values): string[] {
  const problems: string[] = [];
  for (const parameter of architecture.parameters) {
    const value = values[parameter.key];
    if (parameter.type === "boolean" || parameter.type === "select") continue;
    if (value === "" || value === undefined || value === null) {
      problems.push(`${parameter.label} is empty.`);
      continue;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      problems.push(`${parameter.label} must be a number.`);
      continue;
    }
    if (parameter.type === "integer" && !Number.isInteger(numeric)) {
      problems.push(`${parameter.label} must be a whole number.`);
    }
    if (parameter.minimum !== undefined && numeric < parameter.minimum) {
      problems.push(`${parameter.label} is below the supported minimum of ${parameter.minimum}.`);
    }
    if (parameter.maximum !== undefined && numeric > parameter.maximum) {
      problems.push(`${parameter.label} is above the supported maximum of ${parameter.maximum}.`);
    }
  }
  return problems;
}

/** Numbers leave the form as numbers, so the JSON preview is the payload, not a lookalike. */
function coerce(architecture: ArchitectureOption, values: Values): Values {
  const payload: Values = {};
  for (const parameter of architecture.parameters) {
    const value = values[parameter.key];
    payload[parameter.key] =
      parameter.type === "integer" || parameter.type === "number" ? Number(value) : value;
  }
  return payload;
}

const STATUS_TONE: Record<TrainingRun["status"], string> = {
  queued: "border-border text-muted-foreground",
  running: "border-primary/45 text-primary",
  succeeded: "border-[var(--status-healthy)]/45 text-[var(--status-healthy)]",
  failed: "border-destructive/45 text-destructive",
  cancelled: "border-border text-muted-foreground",
};

type Props = {
  capability: Capability;
  datasets: DatasetVersion[];
  runs: TrainingRun[];
  isRecipeFrozen: boolean;
  onLaunch: (dataset: DatasetVersion, architectureId: string, hyperparameters: Values) => void;
  onCancel: (runId: string) => void;
  onBack: () => void;
};

export function TrainingStage({
  capability,
  datasets,
  runs,
  isRecipeFrozen,
  onLaunch,
  onCancel,
  onBack,
}: Props) {
  const architectures = useMemo(() => architecturesFor(capability), [capability]);
  const readyDatasets = datasets.filter((dataset) => dataset.status === "ready");

  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [architectureId, setArchitectureId] = useState(architectures[0]?.id ?? "");
  const [values, setValues] = useState<Values>(() =>
    architectures[0] ? defaultsForArchitecture(architectures[0]) : {},
  );

  const architecture = findArchitecture(architectureId) ?? architectures[0];
  // The newest ready dataset is almost always the one meant, so it stands in until a
  // choice is made — and a choice that stops existing falls back to it rather than
  // leaving the picker pointing at nothing.
  const dataset =
    readyDatasets.find((item) => item.id === datasetId) ?? readyDatasets[0] ?? null;
  const runnableHere = architecture ? BROWSER_ARCHITECTURES.has(architecture.id) : false;
  const problems = architecture ? configurationProblems(architecture, values) : [];
  const busyRun = runs.find((run) => run.status === "queued" || run.status === "running") ?? null;
  const hasSucceeded = runs.some((run) => run.status === "succeeded");

  function chooseArchitecture(id: string) {
    setArchitectureId(id);
    const next = findArchitecture(id);
    setValues(next ? defaultsForArchitecture(next) : {});
  }

  function launch() {
    if (!dataset || !architecture) return;
    onLaunch(dataset, architecture.id, coerce(architecture, values));
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(340px,0.72fr)_minmax(0,1fr)]">
      <Card className="gap-0 py-0">
        <CardHeader className="gap-1 border-b bg-muted/30 py-4">
          <p className="instrument-label">Step 4 · Train</p>
          <CardTitle className="text-lg">Fit a model</CardTitle>
          <CardDescription>
            A run cites one frozen dataset version. Change the recipe and you get a new
            version — never a quietly different model over the same name.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-4">
          {readyDatasets.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Nothing to train on yet.</p>
              <p className="mt-1 leading-5">
                {isRecipeFrozen
                  ? "The dataset is still building."
                  : "Go back and freeze a recipe into a dataset version first."}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={onBack}>
                Back to the recipe
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="dataset-version">Dataset version</Label>
                <select
                  id="dataset-version"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={dataset?.id ?? ""}
                  onChange={(event) => setDatasetId(event.target.value)}
                >
                  {readyDatasets.map((item) => (
                    <option key={item.id} value={item.id}>
                      v{item.datasetVersion} · {item.rowCount.toLocaleString()} rows ·{" "}
                      {item.featureSignature.length} features
                    </option>
                  ))}
                </select>
                {dataset && (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {dataset.splitSummary.train.toLocaleString()} train /{" "}
                    {dataset.splitSummary.test.toLocaleString()} test ·{" "}
                    <span className="font-mono">{dataset.contentDigest.slice(0, 19)}…</span>
                    {dataset.lockedAt ? " · locked by an earlier run" : ""}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="architecture">Model</Label>
                <select
                  id="architecture"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={architectureId}
                  onChange={(event) => chooseArchitecture(event.target.value)}
                >
                  <optgroup label="Trains here, in this tab">
                    {architectures
                      .filter((item) => BROWSER_ARCHITECTURES.has(item.id))
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Production worker only">
                    {architectures
                      .filter((item) => !BROWSER_ARCHITECTURES.has(item.id))
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                  </optgroup>
                </select>
                {architecture && (
                  <p className="text-xs leading-5 text-muted-foreground">{architecture.description}</p>
                )}
              </div>

              {!runnableHere && (
                <div
                  className="flex items-start gap-2 rounded-lg border border-[var(--status-watch)]/45 bg-[var(--status-watch)]/10 p-3 text-xs leading-5"
                  role="note"
                >
                  <ProhibitIcon className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    This one is real in production and absent here. Launch it if you like — the
                    run will fail with the reason rather than print a plausible score nobody
                    computed.
                  </span>
                </div>
              )}

              {architecture && architecture.parameters.length > 0 && (
                <TrainingConfigurationPanel
                  architecture={architecture}
                  values={values}
                  onChange={setValues}
                />
              )}

              {problems.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              )}

              {architecture && (
                <details className="rounded-lg border p-3 text-xs">
                  <summary className="cursor-pointer font-medium">
                    The configuration this run will carry
                  </summary>
                  <pre className="mt-2 overflow-auto rounded-md bg-muted/40 p-3">
                    {JSON.stringify(
                      {
                        machine_dataset_version: dataset?.datasetVersion ?? null,
                        dataset_content_digest: dataset?.contentDigest ?? null,
                        architecture: architecture.id,
                        hyperparameters: coerce(architecture, values),
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              )}

              <Button
                className="w-full"
                disabled={!dataset || problems.length > 0 || busyRun !== null}
                onClick={launch}
              >
                {busyRun ? (
                  <>
                    <CircleNotchIcon className="animate-spin" aria-hidden="true" /> A run is already
                    going
                  </>
                ) : (
                  <>
                    <PlayIcon aria-hidden="true" /> Train {CAPABILITY_LABEL[capability].toLowerCase()}
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {runs.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              <CubeIcon className="mx-auto mb-2 size-6" aria-hidden="true" />
              Runs appear here as they finish, each with the score it actually earned on rows it
              never saw.
            </CardContent>
          </Card>
        ) : (
          runs.map((run) => (
            <Card key={run.id} className="panel-enter gap-0 py-0">
              <CardHeader className="gap-2 border-b bg-muted/20 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="instrument-label">{run.id}</p>
                    <CardTitle className="text-base">{run.architectureLabel}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("font-mono text-[10px]", STATUS_TONE[run.status])}>
                      {run.status}
                    </Badge>
                    {(run.status === "queued" || run.status === "running") && (
                      <Button variant="ghost" size="sm" onClick={() => onCancel(run.id)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
                <CardDescription>
                  Dataset v{run.datasetVersion} ·{" "}
                  <span className="font-mono">{run.datasetContentDigest.slice(0, 19)}…</span>
                  {run.modelVersion ? ` · model version ${run.modelVersion}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {(run.status === "queued" || run.status === "running") && (
                  <div className="space-y-2">
                    <Progress value={Math.round(run.progress * 100)} />
                    <p className="text-xs text-muted-foreground">
                      {run.status === "queued"
                        ? "Queued behind the dataset lock."
                        : "Fitting on the training rows, then scoring on the held-out ones."}
                    </p>
                  </div>
                )}

                {run.status === "failed" && (
                  <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    <XCircleIcon className="mt-0.5 shrink-0" aria-hidden="true" />
                    {run.errorMessage}
                  </p>
                )}

                {run.status === "cancelled" && (
                  <p className="text-sm text-muted-foreground">
                    Cancelled before it produced a score.
                  </p>
                )}

                <ModelScorecard run={run} />

                {run.status === "succeeded" && run.promotedAt && (
                  <p className="mt-3 flex items-center gap-2 text-xs text-[var(--status-healthy)]">
                    <CheckCircleIcon aria-hidden="true" /> Serving as production for this goal.
                  </p>
                )}

                {(run.status === "succeeded" || run.status === "failed") && (
                  <details className="mt-3 rounded-lg border p-3 text-xs">
                    <summary className="cursor-pointer font-medium">Technical details</summary>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted/40 p-3">
                      {JSON.stringify(
                        { hyperparameters: run.hyperparameters, metrics: run.metrics },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                )}
              </CardContent>
            </Card>
          ))
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {!hasSucceeded && runs.length > 0 && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <WarningIcon className="shrink-0 text-[var(--status-watch)]" aria-hidden="true" />
              Nothing has finished successfully yet, so there is nothing to promote.
            </p>
          )}
          {hasSucceeded ? (
            <Button asChild className="ml-auto">
              <Link href="/admin/models">
                Review for promotion <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          ) : (
            <Button className="ml-auto" disabled>
              Review for promotion <ArrowRightIcon data-icon="inline-end" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
