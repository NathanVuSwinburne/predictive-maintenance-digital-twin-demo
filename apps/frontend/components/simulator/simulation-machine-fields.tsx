"use client";

import { GaugeIcon } from "@phosphor-icons/react";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MachineSummary } from "@/lib/domain/types";

type SimulationMachineFieldsProps = {
  machines: MachineSummary[];
  machineId: string;
  scenarioName: string;
  machineDescription: string;
  scenarioNameError?: string;
  onMachineIdChange: (value: string) => void;
  onScenarioNameChange: (value: string) => void;
};

export function SimulationMachineFields({
  machines,
  machineId,
  scenarioName,
  machineDescription,
  scenarioNameError,
  onMachineIdChange,
  onScenarioNameChange,
}: SimulationMachineFieldsProps) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="machine">Machine</FieldLabel>
        <Select value={machineId} onValueChange={onMachineIdChange}>
          <SelectTrigger id="machine" className="w-full text-sm">
            <GaugeIcon />
            <SelectValue placeholder="Select machine" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {machines.map((machine) => (
                <SelectItem key={machine.id} value={machine.id}>
                  {machine.name} · {machine.line}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>{machineDescription}</FieldDescription>
      </Field>

      <Field data-invalid={scenarioNameError ? true : undefined}>
        <FieldLabel htmlFor="scenario-name">Scenario name</FieldLabel>
        <Input
          id="scenario-name"
          className="text-sm"
          value={scenarioName}
          aria-invalid={scenarioNameError ? true : undefined}
          onChange={(event) => onScenarioNameChange(event.target.value)}
        />
        <FieldDescription>
          Use a short label to help recognise the scenario in the run history.
        </FieldDescription>
        <FieldError>{scenarioNameError}</FieldError>
      </Field>
    </FieldGroup>
  );
}
