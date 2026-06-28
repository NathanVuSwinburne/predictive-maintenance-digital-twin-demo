"use client";

import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { MachineSimulationSchemaResolution } from "@/lib/simulation/resolver";

type SimulationParameterStateProps = {
  resolution: MachineSimulationSchemaResolution;
};

export function SimulationParameterState({
  resolution,
}: SimulationParameterStateProps) {
  const warningList = resolution.warnings.slice(0, 3);

  if (resolution.status === "unknown-machine-type") {
    return (
      <Empty className="border border-dashed border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WarningCircleIcon />
          </EmptyMedia>
          <EmptyTitle>No simulation profile available</EmptyTitle>
          <EmptyDescription>
            This machine does not have a recognised simulation schema yet. Add a
            machine type profile or backend-provided schema to enable
            configuration.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (resolution.status === "no-parameters") {
    return (
      <Empty className="border border-dashed border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InfoIcon />
          </EmptyMedia>
          <EmptyTitle>No configurable parameters</EmptyTitle>
          <EmptyDescription>
            The selected machine is available, but it currently exposes no
            configurable simulation parameters.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (warningList.length === 0) {
    return null;
  }

  return (
    <Alert>
      <WarningCircleIcon />
      <AlertTitle>Schema metadata was partially sanitised</AlertTitle>
      <AlertDescription>
        {warningList.join(" ")}
      </AlertDescription>
    </Alert>
  );
}
