"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { MachineDataStage } from "@/components/mlops/machine-data-stage";
import { MachineRegistryStage } from "@/components/mlops/machine-registry-stage";
import { PreprocessingWorkspace } from "@/components/mlops/preprocessing-workspace";
import { PromotionStage } from "@/components/mlops/promotion-stage";
import { TrainingStage } from "@/components/mlops/training-stage";
import { WorkflowNav } from "@/components/mlops/workflow-nav";
import { Button } from "@/components/ui/button";
import { CAPABILITY_LABEL, DEMO_MACHINES, findMachine } from "@/lib/demo-mlops/datasets";
import { defaultRecipe } from "@/lib/demo-mlops/preprocessing";
import {
  activeDeployment,
  buildDataset,
  cancelRun,
  datasetsFor,
  getServerSnapshot,
  getSnapshot,
  promoteRun,
  resetWorkspace,
  runsFor,
  startTraining,
  subscribe,
} from "@/lib/demo-mlops/store";
import type {
  Capability,
  DatasetVersion,
  PreprocessingRecipe,
  PreviewResult,
  Stage,
  TrainingRun,
} from "@/lib/demo-mlops/types";
import { cn } from "@/lib/utils";

export default function MlopsPage() {
  // Datasets and runs live outside React so they survive a walk to the simulator and back.
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [machineId, setMachineId] = useState<string>(DEMO_MACHINES[0].id);
  const [capability, setCapability] = useState<Capability>(DEMO_MACHINES[0].capabilities[0]);
  const [stage, setStage] = useState<Stage>("machine");
  const [recipes, setRecipes] = useState<Record<string, PreprocessingRecipe>>({});
  const [isBuilding, setIsBuilding] = useState(false);

  const machine = findMachine(machineId) ?? DEMO_MACHINES[0];
  const recipeKey = `${machine.id}:${capability}`;
  // A fresh default on every render would hand the workspace a new object each time and
  // send its preview effect round again, so the fallback is memoised too.
  const fallbackRecipe = useMemo(() => defaultRecipe(machine, capability), [capability, machine]);
  const recipe = recipes[recipeKey] ?? fallbackRecipe;

  const datasets = datasetsFor(machine.id, capability);
  const runs = runsFor(machine.id, capability);
  const deployment = activeDeployment(machine.id, capability);

  const complete = useMemo<Record<Stage, boolean>>(
    () => ({
      machine: true,
      data: machine.sampleRows.length > 0,
      prepare: datasets.some((dataset) => dataset.status === "ready"),
      train: runs.some((run) => run.status === "succeeded"),
      promote: deployment !== undefined,
    }),
    [datasets, deployment, machine.sampleRows.length, runs],
  );

  function selectMachine(nextId: string) {
    const next = findMachine(nextId);
    if (!next) return;
    setMachineId(nextId);
    // A goal the new machine does not support would leave every stage below it empty.
    if (!next.capabilities.includes(capability)) {
      setCapability(next.capabilities[0]);
    }
  }

  function setRecipe(next: PreprocessingRecipe) {
    setRecipes((current) => ({ ...current, [recipeKey]: next }));
  }

  function freeze(preview: PreviewResult) {
    setIsBuilding(true);
    const dataset = buildDataset(machine, capability, preview);
    window.setTimeout(() => {
      setIsBuilding(false);
      setStage("train");
      toast.success(`Dataset v${dataset.datasetVersion} is ready`, {
        description: `${preview.raw.rowCount.toLocaleString()} rows frozen behind ${dataset.contentDigest.slice(0, 19)}…`,
      });
    }, 950);
  }

  function launch(
    dataset: DatasetVersion,
    architectureId: string,
    hyperparameters: Record<string, string | number | boolean>,
  ) {
    startTraining(machine, dataset, architectureId, hyperparameters);
  }

  function promote(run: TrainingRun, overrideReason: string | null) {
    promoteRun(run, overrideReason);
    toast.success(`${run.architectureLabel} now serves ${CAPABILITY_LABEL[capability].toLowerCase()}`, {
      description: overrideReason
        ? "Promoted over the quality gate. The reason is stored with the deployment."
        : "The production alias now points at this version.",
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="instrument-label">Model operations</p>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] md:text-3xl">MLOps workspace</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The path a model takes from a machine&rsquo;s raw columns to something allowed to
            serve: inspect the data, write a preprocessing recipe, freeze it into an immutable
            dataset version, fit a model, and defend the score before promoting it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Training goal"
            className="flex rounded-lg border bg-card p-0.5"
          >
            {machine.capabilities.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={item === capability}
                onClick={() => setCapability(item)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  item === capability
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {CAPABILITY_LABEL[item]}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetWorkspace();
              setRecipes({});
              setStage("machine");
              toast.info("Workspace cleared", {
                description: "Datasets, runs and deployments are gone. The bundled rows are not.",
              });
            }}
          >
            <ArrowClockwiseIcon aria-hidden="true" /> Reset
          </Button>
        </div>
      </div>

      <WorkflowNav current={stage} complete={complete} onChange={setStage} />

      {stage === "machine" && (
        <MachineRegistryStage
          machines={DEMO_MACHINES}
          selectedId={machine.id}
          onSelect={selectMachine}
          onContinue={() => setStage("data")}
        />
      )}

      {stage === "data" && (
        <MachineDataStage machine={machine} onContinue={() => setStage("prepare")} />
      )}

      {stage === "prepare" && (
        <PreprocessingWorkspace
          machine={machine}
          recipe={recipe}
          onRecipeChange={setRecipe}
          isBuilding={isBuilding}
          onBuild={freeze}
        />
      )}

      {stage === "train" && (
        <TrainingStage
          capability={capability}
          datasets={datasets}
          runs={runs}
          isRecipeFrozen={datasets.length > 0}
          onLaunch={launch}
          onCancel={cancelRun}
          onBack={() => setStage("prepare")}
          onContinue={() => setStage("promote")}
        />
      )}

      {stage === "promote" && (
        <PromotionStage
          machine={machine}
          capability={capability}
          runs={runs}
          deployment={deployment}
          onPromote={promote}
          onBack={() => setStage("train")}
        />
      )}
    </div>
  );
}
