"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { MachineDataStage } from "@/components/mlops/machine-data-stage";
import { MachineRegistryStage } from "@/components/mlops/machine-registry-stage";
import { PreprocessingWorkspace } from "@/components/mlops/preprocessing-workspace";
import { TrainingStage } from "@/components/mlops/training-stage";
import { WorkflowNav } from "@/components/mlops/workflow-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CAPABILITY_LABEL, DEMO_MACHINES, findMachine } from "@/lib/demo-mlops/datasets";
import { defaultRecipe } from "@/lib/demo-mlops/preprocessing";
import {
  buildDataset,
  cancelRun,
  datasetsFor,
  getServerSnapshot,
  getSnapshot,
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
} from "@/lib/demo-mlops/types";
import { deriveWorkflow, getStagePrerequisite, isStage } from "@/lib/demo-mlops/workflow";

type StageHeaderProps = {
  step: number;
  eyebrow: string;
  title: string;
  description: string;
  meta?: string;
};

/** The banded step header production puts above each stage, so a stage says where it sits. */
function StageHeader({ step, eyebrow, title, description, meta }: StageHeaderProps) {
  return (
    <section className="grid border border-border bg-muted/30 lg:grid-cols-[1fr_auto] lg:items-end">
      <div className="p-5">
        <p className="instrument-label">
          Step {step} · {eyebrow}
        </p>
        <h2 className="mt-1 text-xl font-semibold">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      {meta && (
        <p className="border-t px-5 py-4 font-mono text-xs text-muted-foreground lg:border-l lg:border-t-0">
          {meta}
        </p>
      )}
    </section>
  );
}

export default function MachineRegistryPage() {
  // Datasets and runs live outside React so they survive a walk to the simulator and back.
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  // A link into a step carries its machine and goal with it, so both are read back here.
  const linkedMachine = findMachine(searchParams.get("entityId") ?? "") ?? DEMO_MACHINES[0];
  const [machineId, setMachineId] = useState<string>(() => linkedMachine.id);
  const [capability, setCapability] = useState<Capability>(() => {
    const value = searchParams.get("capability");
    return (value === "predict" || value === "simulate") && linkedMachine.capabilities.includes(value)
      ? value
      : linkedMachine.capabilities[0];
  });
  const [stage, setStage] = useState<Stage>(() => {
    const value = searchParams.get("stage");
    return isStage(value) ? value : "machine";
  });
  const [recipes, setRecipes] = useState<Record<string, PreprocessingRecipe>>({});
  const [isBuilding, setIsBuilding] = useState(false);

  // Back and forward through the browser's history are the same navigation as a click here,
  // so a query string this page did not write is read back into state. React's own way of
  // reacting to a changed input is to adjust during render; an effect would cost a second
  // render and is what the cascading-render rule warns about.
  const [syncedQuery, setSyncedQuery] = useState(queryString);
  if (queryString !== syncedQuery) {
    setSyncedQuery(queryString);

    const stageParam = searchParams.get("stage");
    if (isStage(stageParam) && stageParam !== stage) setStage(stageParam);

    const entity = findMachine(searchParams.get("entityId") ?? "");
    if (entity && entity.id !== machineId) setMachineId(entity.id);

    const capabilityParam = searchParams.get("capability");
    const goalOwner = entity ?? findMachine(machineId) ?? DEMO_MACHINES[0];
    if (
      (capabilityParam === "predict" || capabilityParam === "simulate") &&
      goalOwner.capabilities.includes(capabilityParam) &&
      capabilityParam !== capability
    ) {
      setCapability(capabilityParam);
    }
  }

  // The query string we last asked the router for. `searchParams` only catches up on the
  // render after a `replace`, so two updates in one tick would both merge onto the same
  // pre-update params and the second would resurrect what the first removed.
  const writtenQueryRef = useRef(queryString);
  useEffect(() => {
    writtenQueryRef.current = queryString;
  }, [queryString]);

  const updateQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(writtenQueryRef.current);
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      const query = params.toString();
      writtenQueryRef.current = query;
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const machine = findMachine(machineId) ?? DEMO_MACHINES[0];
  const recipeKey = `${machine.id}:${capability}`;
  // A fresh default on every render would hand the workspace a new object each time and
  // send its preview effect round again, so the fallback is memoised too.
  const fallbackRecipe = useMemo(() => defaultRecipe(machine, capability), [capability, machine]);
  const recipe = recipes[recipeKey] ?? fallbackRecipe;

  const datasets = datasetsFor(machine.id, capability);
  const runs = runsFor(machine.id, capability);

  const steps = useMemo(
    () =>
      deriveWorkflow({
        hasMachine: true,
        hasData: machine.sampleRows.length > 0,
        capability,
        datasets,
        runs,
      }),
    [capability, datasets, machine.sampleRows.length, runs],
  );
  const prerequisite = getStagePrerequisite(stage, steps);

  function changeStage(next: Stage) {
    setStage(next);
    updateQuery({ stage: next });
  }

  /**
   * Selecting a machine and opening its data are one act, as in production: the registry is
   * the way into a machine, not a form that asks you to confirm the choice you just made.
   */
  function selectMachine(nextId: string) {
    const next = findMachine(nextId);
    if (!next) return;
    setMachineId(nextId);
    setStage("data");
    // A goal the new machine does not support would leave every stage below it empty.
    const nextCapability = next.capabilities.includes(capability) ? capability : next.capabilities[0];
    setCapability(nextCapability);
    updateQuery({ entityId: nextId, stage: "data", capability: nextCapability });
  }

  function selectCapability(next: Capability) {
    setCapability(next);
    updateQuery({ capability: next });
  }

  function setRecipe(next: PreprocessingRecipe) {
    setRecipes((current) => ({ ...current, [recipeKey]: next }));
  }

  function freeze(preview: PreviewResult) {
    setIsBuilding(true);
    const dataset = buildDataset(machine, capability, preview);
    window.setTimeout(() => {
      setIsBuilding(false);
      changeStage("train");
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

  const activeRuns = runs.filter((run) => run.status === "queued" || run.status === "running").length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-sm" role="heading" aria-level={1}>
              Machine Registry
            </CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-sm">
              How a model gets from a machine&rsquo;s raw columns to something allowed to serve:
              register a machine, inspect its data, prepare a training set, and fit a model.
              Approving one to serve is an admin decision and happens on{" "}
              <Link href="/admin/models" className="underline underline-offset-2">
                Machine model approvals
              </Link>
              .
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{DEMO_MACHINES.length} registered machines</Badge>
            <Badge variant="secondary">Current machine: {machine.name}</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetWorkspace();
                setRecipes({});
                changeStage("machine");
                toast.info("Workspace cleared", {
                  description: "Datasets, runs and deployments are gone. The bundled rows are not.",
                });
              }}
            >
              <ArrowClockwiseIcon aria-hidden="true" /> Reset
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card className="p-3">
        <WorkflowNav currentStage={stage} steps={steps} onStageChange={changeStage} />
        {machine.capabilities.length > 1 && (stage === "prepare" || stage === "train") && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="text-sm font-medium">Model goal</span>
            {machine.capabilities.map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={capability === item ? "secondary" : "outline"}
                aria-pressed={capability === item}
                onClick={() => selectCapability(item)}
              >
                {CAPABILITY_LABEL[item]}
              </Button>
            ))}
          </div>
        )}
      </Card>

      {prerequisite && (
        <p
          className="border border-[var(--status-watch)]/50 bg-[var(--status-watch)]/10 p-3 text-sm"
          role="status"
        >
          {prerequisite}
        </p>
      )}

      {stage === "machine" && (
        <MachineRegistryStage
          machines={DEMO_MACHINES}
          selectedId={machine.id}
          onSelect={selectMachine}
        />
      )}

      {stage === "data" && (
        <>
          <StageHeader
            step={2}
            eyebrow="Machine Data"
            title={`Add Data for ${machine.name}`}
            description="The registered column contract and the rows persisted against it. The demo's sources are fixed, so this step reads the machine data rather than ingesting more of it."
            meta={`Sensor schema v${machine.schemaVersion}`}
          />
          <MachineDataStage machine={machine} onContinue={() => changeStage("prepare")} />
        </>
      )}

      {stage === "prepare" && (
        <>
          <StageHeader
            step={3}
            eyebrow="Prepare Training Data"
            title={`Prepare ${machine.name}'s machine data`}
            description="Choose features, split Train from Test, and compare reversible cleaning and scaling on a bounded preview. The immutable dataset version is built only after you approve the recipe."
          />
          <PreprocessingWorkspace
            machine={machine}
            recipe={recipe}
            onRecipeChange={setRecipe}
            isBuilding={isBuilding}
            onBuild={freeze}
          />
        </>
      )}

      {stage === "train" && (
        <>
          <StageHeader
            step={4}
            eyebrow="Train Model"
            title="Train a machine model"
            description="Train a model from your prepared machine data. A run cites one frozen dataset version, so the model and the rows behind it can never drift apart."
            meta={`${activeRuns} running · ${runs.length} total`}
          />
          <TrainingStage
            capability={capability}
            datasets={datasets}
            runs={runs}
            isRecipeFrozen={datasets.length > 0}
            onLaunch={launch}
            onCancel={cancelRun}
            onBack={() => changeStage("prepare")}
          />
        </>
      )}
    </div>
  );
}
