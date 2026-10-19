import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { ManualPredictionPanel } from "@/components/simulator/manual-prediction-panel";
import { testMachines, testPredictionConfig, testPredictions, testManualPredictionResult } from "@/test/fixtures/domain";

const provider = vi.hoisted(() => ({ getPredictionConfig: vi.fn(), getMachinePredictions: vi.fn(), predictMachine: vi.fn() }));
vi.mock("@/hooks/use-data-provider", () => ({ useDataProvider: () => provider }));
vi.mock("@/hooks/use-model-readiness", () => ({ useModelReadiness: () => ({ readiness: null, isLoading: false, error: null }) }));

beforeEach(() => {
  provider.getMachinePredictions.mockResolvedValue([{ ...testPredictions[0], machineId: "machine-a" }]);
  provider.predictMachine.mockResolvedValue(testManualPredictionResult);
});

test("a slower config response preserves the linked historical result; running again labels the new result correctly", async () => {
  let resolveConfig!: (value: typeof testPredictionConfig) => void;
  provider.getPredictionConfig.mockReturnValue(new Promise(resolve => { resolveConfig = resolve; }));
  render(<ManualPredictionPanel machines={[testMachines[0]]} requestedMachineId="machine-a" requestedPredictionId="prediction-c-1" />);
  expect(await screen.findByText("Historical result · not current")).toBeVisible();
  await act(async () => resolveConfig(testPredictionConfig));
  expect(screen.getByText("Historical result · not current")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Run prediction" }));
  expect(await screen.findByText("Based on entered values")).toBeVisible();
  expect(screen.queryByText("Historical result · not current")).not.toBeInTheDocument();
});
