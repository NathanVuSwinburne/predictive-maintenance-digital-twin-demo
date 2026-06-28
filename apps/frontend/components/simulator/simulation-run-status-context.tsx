"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { useDataProvider } from "@/hooks/use-data-provider";
import type {
  SimulationRun,
  SimulationScenarioInput,
} from "@/lib/domain/types";

type SimulationRunStatus = "idle" | "running" | "completed" | "failed";

type StartSimulationArgs = {
  input: SimulationScenarioInput;
  userId: string;
  machineName?: string;
};

type StartSimulationResult = {
  run: SimulationRun;
  runs: SimulationRun[];
};

type SimulationRunStatusContextValue = {
  status: SimulationRunStatus;
  activeScenarioName: string | null;
  activeMachineName: string | null;
  completedRun: SimulationRun | null;
  error: string | null;
  hasUnviewedCompletedRun: boolean;
  startSimulation(args: StartSimulationArgs): Promise<StartSimulationResult>;
  markCompletedRunViewed(runId?: string): void;
  resetSimulationStatus(): void;
};

const SimulationRunStatusContext =
  createContext<SimulationRunStatusContextValue | null>(null);

export function SimulationRunStatusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const provider = useDataProvider();
  const [status, setStatus] = useState<SimulationRunStatus>("idle");
  const [activeScenarioName, setActiveScenarioName] = useState<string | null>(
    null,
  );
  const [activeMachineName, setActiveMachineName] = useState<string | null>(
    null,
  );
  const [completedRun, setCompletedRun] = useState<SimulationRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasUnviewedCompletedRun, setHasUnviewedCompletedRun] = useState(false);

  const startSimulation = useCallback(
    async ({
      input,
      userId,
      machineName,
    }: StartSimulationArgs): Promise<StartSimulationResult> => {
      setStatus("running");
      setActiveScenarioName(input.scenarioName);
      setActiveMachineName(machineName ?? null);
      setCompletedRun(null);
      setError(null);
      setHasUnviewedCompletedRun(false);

      try {
        const run = await provider.runSimulation(input, userId);
        const runs = await provider.listSimulationRuns(userId);

        setCompletedRun(run);
        setStatus("completed");
        setHasUnviewedCompletedRun(true);
        return { run, runs };
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "Simulation run failed";
        setError(message);
        setStatus("failed");
        setHasUnviewedCompletedRun(false);
        throw caught;
      }
    },
    [provider],
  );

  const markCompletedRunViewed = useCallback(
    (runId?: string) => {
      if (!completedRun || (runId && completedRun.id !== runId)) {
        return;
      }

      setHasUnviewedCompletedRun(false);
    },
    [completedRun],
  );

  const resetSimulationStatus = useCallback(() => {
    setStatus("idle");
    setActiveScenarioName(null);
    setActiveMachineName(null);
    setCompletedRun(null);
    setError(null);
    setHasUnviewedCompletedRun(false);
  }, []);

  const value = useMemo<SimulationRunStatusContextValue>(
    () => ({
      status,
      activeScenarioName,
      activeMachineName,
      completedRun,
      error,
      hasUnviewedCompletedRun,
      startSimulation,
      markCompletedRunViewed,
      resetSimulationStatus,
    }),
    [
      activeMachineName,
      activeScenarioName,
      completedRun,
      error,
      hasUnviewedCompletedRun,
      markCompletedRunViewed,
      resetSimulationStatus,
      startSimulation,
      status,
    ],
  );

  return (
    <SimulationRunStatusContext.Provider value={value}>
      {children}
    </SimulationRunStatusContext.Provider>
  );
}

export function useSimulationRunStatus() {
  const context = useContext(SimulationRunStatusContext);

  if (!context) {
    throw new Error(
      "useSimulationRunStatus must be used inside SimulationRunStatusProvider",
    );
  }

  return context;
}
