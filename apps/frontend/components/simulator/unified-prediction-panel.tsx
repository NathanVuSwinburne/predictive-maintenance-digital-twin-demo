"use client";

import { useCallback, useMemo, useState } from "react";

import { LiveMachinePanel } from "@/components/live/live-machine-panel";
import { GenericModelSimulator } from "@/components/simulator/generic-model-simulator";
import { ManualPredictionPanel } from "@/components/simulator/manual-prediction-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CanonicalMachine, SimulatorEntityModel } from "@/lib/domain/types";

type Props = {
  machines: CanonicalMachine[];
  models: SimulatorEntityModel[];
  /** The machine chosen in the page-level selector. */
  entityId: string;
  requestedPredictionId?: string;
};

const LEGACY_MANUAL_MACHINE_TYPES = new Set(["ai4i", "real-sensor", "kaggle"]);

/** True when the Predict tab can actually run something for this machine (registered model or a supported legacy adapter). */
export function hasPredictionPath(
  machine: CanonicalMachine,
  models: SimulatorEntityModel[],
) {
  if (models.some((model) => model.entityId === machine.id && model.objectives.includes("predict"))) {
    return true;
  }
  return machine.legacyCompatible && LEGACY_MANUAL_MACHINE_TYPES.has(machine.machineType ?? "");
}

export function predictionCapableMachines(
  machines: CanonicalMachine[],
  models: SimulatorEntityModel[],
) {
  const genericIds = new Set(
    models.filter((model) => model.objectives.includes("predict")).map((model) => model.entityId),
  );
  return machines.filter(
    (machine) =>
      machine.capabilities.includes("predict") ||
      genericIds.has(machine.id) ||
      machine.legacyCompatible,
  );
}

export function UnifiedPredictionPanel({
  machines,
  models,
  entityId,
  requestedPredictionId,
}: Props) {
  const genericByEntity = useMemo(
    () => new Map(models.filter((model) => model.objectives.includes("predict")).map((model) => [model.entityId, model])),
    [models],
  );
  const options = useMemo(() => predictionCapableMachines(machines, models), [machines, models]);
  const selected = options.find((machine) => machine.id === entityId);
  const generic = genericByEntity.get(entityId);
  const [liveVisible, setLiveVisible] = useState(false);
  const onLiveVisibilityChange = useCallback((visible: boolean) => setLiveVisible(visible), []);

  if (!selected) {
    const anyMachine = machines.find((machine) => machine.id === entityId);
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Prediction isn&apos;t available for {anyMachine?.name ?? "this machine"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This machine has no active prediction model yet. Train and activate one in Machine
          Registry, or choose another machine above.
        </CardContent>
      </Card>
    );
  }

  const technicalDetails = (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer py-1 font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        Technical details
      </summary>
      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt>Machine ID</dt>
        <dd className="font-mono">{entityId}</dd>
        <dt>Prediction path</dt>
        <dd>
          {generic
            ? `Registered production model, version ${generic.currentVersions.predict ?? "—"}`
            : "Legacy compatibility adapter"}
        </dd>
      </dl>
    </details>
  );

  if (!generic) {
    return (
      <div className="flex flex-col gap-4">
        <ManualPredictionPanel
          machines={[selected]}
          requestedMachineId={entityId}
          requestedPredictionId={requestedPredictionId}
          showMachineSelector={false}
        />
        {technicalDetails}
      </div>
    );
  }

  const runner = (
    <GenericModelSimulator
      models={[generic]}
      objective="predict"
      requestedEntityId={entityId}
      showEntitySelector={false}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <LiveMachinePanel
        entityId={entityId}
        machineName={selected.name}
        onVisibilityChange={onLiveVisibilityChange}
      />
      {liveVisible ? (
        // Live data is the answer; the manual check is a secondary what-if tool.
        <details key="secondary" className="border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
            Check with custom values
          </summary>
          <div className="border-t border-border p-4">{runner}</div>
        </details>
      ) : (
        <div key="primary">{runner}</div>
      )}
      {technicalDetails}
    </div>
  );
}
