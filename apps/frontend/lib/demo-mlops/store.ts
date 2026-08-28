"use client";

/**
 * The demo's MLOps state, held in module scope.
 *
 * A dataset that took a recipe to build, and a model that took a dataset to train, should
 * still be there when you walk to the simulator and come back — so this outlives any one
 * React tree. It does not outlive a reload, and that is deliberate: nothing about this
 * workspace is persisted anywhere, because there is nowhere to persist it to.
 */

import { digestOf } from "@/lib/demo-mlops/preprocessing";
import { findArchitecture, trainModel } from "@/lib/demo-mlops/training";
import type {
  Capability,
  DatasetVersion,
  DemoMachine,
  ModelDeployment,
  PreviewResult,
  TrainingRun,
} from "@/lib/demo-mlops/types";

type State = {
  datasets: DatasetVersion[];
  runs: TrainingRun[];
  deployments: ModelDeployment[];
};

let state: State = { datasets: [], runs: [], deployments: [] };
const listeners = new Set<() => void>();
let counter = 0;

function emit(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): State {
  return state;
}

export function getServerSnapshot(): State {
  return state;
}

function nextId(prefix: string) {
  counter += 1;
  return `${prefix}-${counter.toString().padStart(3, "0")}`;
}

/** A clock the demo controls, so timestamps read sensibly without a real one. */
function now() {
  return new Date().toISOString();
}

export function datasetsFor(machineId: string, capability: Capability) {
  return state.datasets.filter((dataset) => dataset.machineId === machineId && dataset.capability === capability);
}

export function runsFor(machineId: string, capability: Capability) {
  return state.runs.filter((run) => run.machineId === machineId && run.capability === capability);
}

export function activeDeployment(machineId: string, capability: Capability) {
  return state.deployments.find(
    (deployment) => deployment.machineId === machineId && deployment.capability === capability && deployment.active,
  );
}

/**
 * Freeze a recipe into an immutable dataset version.
 *
 * The build is deliberately not instant. A dataset is the thing a training run cites, and
 * watching it move through `building` is the clearest way to show that the recipe stops
 * being editable at exactly this point.
 */
export function buildDataset(
  machine: DemoMachine,
  capability: Capability,
  preview: PreviewResult,
): DatasetVersion {
  const existing = datasetsFor(machine.id, capability).length;
  const dataset: DatasetVersion = {
    id: nextId("dsv"),
    machineId: machine.id,
    datasetVersion: existing + 1,
    capability,
    status: "building",
    rowCount: preview.raw.rowCount,
    featureSignature: preview.transformedFeatureNames,
    recipe: preview.recipe,
    recipeDigest: preview.recipeDigest,
    contentDigest: digestOf({ recipe: preview.recipe, boundary: preview.sourceBoundaryDigest }),
    splitSummary: { train: preview.train.rowCount, test: preview.test.rowCount },
    fittedStatistics: preview.fittedStatistics,
    createdAt: now(),
    lockedAt: null,
  };
  emit({ ...state, datasets: [dataset, ...state.datasets] });

  window.setTimeout(() => {
    emit({
      ...state,
      datasets: state.datasets.map((item) =>
        item.id === dataset.id ? { ...item, status: "ready" } : item,
      ),
    });
  }, 900);

  return dataset;
}

export function startTraining(
  machine: DemoMachine,
  dataset: DatasetVersion,
  architectureId: string,
  hyperparameters: Record<string, string | number | boolean>,
): TrainingRun {
  const architecture = findArchitecture(architectureId);
  const run: TrainingRun = {
    id: nextId("run"),
    machineId: machine.id,
    datasetVersionId: dataset.id,
    datasetVersion: dataset.datasetVersion,
    datasetContentDigest: dataset.contentDigest,
    capability: dataset.capability,
    architecture: architectureId,
    architectureLabel: architecture?.label ?? architectureId,
    hyperparameters,
    status: "queued",
    progress: 0,
    metrics: {},
    outputContract: null,
    modelName: null,
    modelVersion: null,
    errorMessage: null,
    createdAt: now(),
    completedAt: null,
    promotedAt: null,
  };

  emit({
    ...state,
    runs: [run, ...state.runs],
    // A dataset a run has cited can no longer be quietly rebuilt under it.
    datasets: state.datasets.map((item) =>
      item.id === dataset.id ? { ...item, lockedAt: item.lockedAt ?? run.createdAt } : item,
    ),
  });

  const patch = (changes: Partial<TrainingRun>) => {
    emit({
      ...state,
      runs: state.runs.map((item) => (item.id === run.id ? { ...item, ...changes } : item)),
    });
  };

  window.setTimeout(() => {
    if (state.runs.find((item) => item.id === run.id)?.status !== "queued") return;
    patch({ status: "running", progress: 0.15 });

    let progress = 0.15;
    const ticker = window.setInterval(() => {
      const current = state.runs.find((item) => item.id === run.id);
      if (!current || current.status !== "running") {
        window.clearInterval(ticker);
        return;
      }
      progress = Math.min(0.9, progress + 0.14);
      patch({ progress });
    }, 260);

    window.setTimeout(() => {
      window.clearInterval(ticker);
      const current = state.runs.find((item) => item.id === run.id);
      if (!current || current.status !== "running") return;
      try {
        const outcome = trainModel(machine, dataset.recipe, architectureId, hyperparameters);
        const version = state.runs.filter(
          (item) => item.machineId === machine.id && item.capability === dataset.capability && item.status === "succeeded",
        ).length + 1;
        patch({
          status: "succeeded",
          progress: 1,
          metrics: outcome.metrics,
          outputContract: outcome.outputContract,
          modelName: `${machine.id}-${dataset.capability}`,
          modelVersion: String(version),
          completedAt: now(),
        });
      } catch (error) {
        patch({
          status: "failed",
          progress: 1,
          errorMessage: error instanceof Error ? error.message : "Training failed.",
          completedAt: now(),
        });
      }
    }, 1500);
  }, 500);

  return run;
}

export function cancelRun(runId: string) {
  emit({
    ...state,
    runs: state.runs.map((item) =>
      item.id === runId && (item.status === "queued" || item.status === "running")
        ? { ...item, status: "cancelled", progress: 1, completedAt: now() }
        : item,
    ),
  });
}

export function promoteRun(run: TrainingRun, overrideReason: string | null) {
  const deployment: ModelDeployment = {
    id: nextId("dep"),
    machineId: run.machineId,
    capability: run.capability,
    trainingRunId: run.id,
    modelName: run.modelName ?? run.machineId,
    modelVersion: run.modelVersion ?? "1",
    alias: "production",
    active: true,
    requestedAt: now(),
    overrideReason,
  };
  emit({
    ...state,
    deployments: [
      deployment,
      ...state.deployments.map((item) =>
        item.machineId === run.machineId && item.capability === run.capability
          ? { ...item, active: false }
          : item,
      ),
    ],
    runs: state.runs.map((item) =>
      item.id === run.id
        ? { ...item, promotedAt: deployment.requestedAt }
        : item.machineId === run.machineId && item.capability === run.capability
          ? { ...item, promotedAt: null }
          : item,
    ),
  });
  return deployment;
}

export function resetWorkspace() {
  counter = 0;
  emit({ datasets: [], runs: [], deployments: [] });
}

/** Derived: how far this machine and goal have got through the five stages. */
export function workflowProgress(
  machine: DemoMachine | null,
  capability: Capability,
  recipeReady: boolean,
) {
  const datasets = machine ? datasetsFor(machine.id, capability) : [];
  const runs = machine ? runsFor(machine.id, capability) : [];
  return {
    machine: machine !== null,
    data: machine !== null && machine.sampleRows.length > 0,
    prepare: datasets.some((dataset) => dataset.status === "ready") || recipeReady,
    train: runs.some((run) => run.status === "succeeded"),
    promote: machine !== null && activeDeployment(machine.id, capability) !== undefined,
  };
}
