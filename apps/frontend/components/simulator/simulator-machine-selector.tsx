"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SimulatorMachineOption = {
  id: string;
  name: string;
  /** The Predict tab has a prediction path (registered model or legacy adapter). */
  canPredict: boolean;
  /** The Simulate tab lists this machine (it declares the simulate capability). */
  canSimulate: boolean;
  /** Simulation is ready to run right now; false means setup is still required. */
  simulateReady: boolean;
};

type Props = {
  options: SimulatorMachineOption[];
  value: string;
  onChange: (machineId: string) => void;
  isLoading?: boolean;
};

function availabilitySummary(option: SimulatorMachineOption | undefined) {
  if (!option) return null;
  const parts: string[] = [];
  parts.push(option.canPredict ? "Prediction available" : "Prediction not set up");
  parts.push(
    option.canSimulate
      ? option.simulateReady
        ? "Simulation available"
        : "Simulation needs setup"
      : "Simulation not set up",
  );
  return parts.join(" · ");
}

/** The one machine selector shared by the Predict and Simulate tabs. */
export function SimulatorMachineSelector({ options, value, onChange, isLoading = false }: Props) {
  const selected = options.find((option) => option.id === value);
  const summary = availabilitySummary(selected);

  return (
    <Card>
      <CardContent className="grid gap-2 md:grid-cols-[minmax(240px,420px)_1fr] md:items-center">
        <div className="grid gap-2">
          <Label htmlFor="simulator-machine">Machine</Label>
          <Select value={value} onValueChange={onChange} disabled={options.length === 0}>
            <SelectTrigger id="simulator-machine" className="w-full">
              <SelectValue placeholder={isLoading ? "Loading machines…" : "Select a machine"} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        {summary ? (
          <p className="text-sm text-muted-foreground md:pt-6" aria-live="polite">
            {summary}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
