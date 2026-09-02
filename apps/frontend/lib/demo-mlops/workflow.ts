/**
 * The four steps of the machine model workflow.
 *
 * This mirrors `lib/mlops/workflow.ts` in the production app: the same stage ids, the same
 * labels, and the same rule that a step counts as complete only because of state that
 * already exists, never because someone walked past it. Production reads that state from
 * the backend readiness gate; the demo reads it from the browser store, which is the only
 * difference worth having.
 */

import type { Capability, DatasetVersion, Stage, TrainingRun } from "./types";

const STAGE_LABELS: Record<Stage, string> = {
  machine: "Add Machine",
  data: "Add Machine Data",
  prepare: "Prepare Training Data",
  train: "Train Model",
};

export const MACHINE_MODEL_STAGES = (
  Object.entries(STAGE_LABELS) as Array<[Stage, string]>
).map(([id, label]) => ({ id, label }));

export type WorkflowStep = {
  id: Stage;
  label: string;
  complete: boolean;
};

export function isStage(value: string | null): value is Stage {
  return MACHINE_MODEL_STAGES.some((stage) => stage.id === value);
}

type WorkflowInput = {
  hasMachine: boolean;
  /** Persisted rows exist for this machine. The demo ships them; production ingests them. */
  hasData: boolean;
  capability: Capability;
  datasets: DatasetVersion[];
  runs: TrainingRun[];
};

export function deriveWorkflow(input: WorkflowInput): WorkflowStep[] {
  const hasReadyData = input.datasets.some(
    (item) => item.capability === input.capability && item.status === "ready",
  );
  const hasSuccessfulRun = input.runs.some(
    (item) => item.capability === input.capability && item.status === "succeeded",
  );

  const completion: Record<Stage, boolean> = {
    machine: input.hasMachine,
    data: input.hasMachine && input.hasData,
    prepare: input.hasMachine && hasReadyData,
    train: input.hasMachine && hasSuccessfulRun,
  };

  return MACHINE_MODEL_STAGES.map((stage) => ({
    ...stage,
    complete: completion[stage.id],
  }));
}

/**
 * What is missing before a stage can do anything, in the words the operator needs. Null
 * means the stage is usable. The stage still opens: naming the gap beats a dead tab.
 */
export function getStagePrerequisite(stage: Stage, steps: WorkflowStep[]): string | null {
  const complete = Object.fromEntries(
    steps.map((step) => [step.id, step.complete]),
  ) as Record<Stage, boolean>;

  if (stage === "machine") return null;
  if (!complete.machine) return "Add or select a machine first.";
  if (stage === "data") return null;
  if (!complete.data) {
    return stage === "prepare"
      ? "Add more machine data before preparing it for training."
      : "Add enough machine data, then prepare it for training.";
  }
  if (stage === "prepare") return null;
  if (!complete.prepare) return "Prepare training data first.";
  return null;
}
