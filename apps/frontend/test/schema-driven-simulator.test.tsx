import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { SchemaDrivenSimulator } from "@/components/simulator/schema-driven-simulator";

const provider = vi.hoisted(() => ({
  listEntityTelemetry: vi.fn(),
  runGenericSimulation: vi.fn(),
}));

vi.mock("@/hooks/use-data-provider", () => ({
  useDataProvider: () => provider,
}));

const entity = {
  entityId: "entity-pump",
  machineName: "Cooling pump",
  imageUrl: null,
  schemaVersion: 1,
  eligible: true,
  reasonCodes: [],
  readiness: {
    availableContextRows: 200,
    requiredContextRows: 12,
    availableSessions: 1,
  },
  inputFeatures: [
    { name: "temperature", unit: "C", dtype: "float" as const, required: true },
    { name: "vibration", unit: "mm/s", dtype: "float" as const, required: true },
  ],
  outputFeatures: ["temperature", "vibration"],
  sessionIds: ["run-3"],
  productionModel: {
    modelName: "cooling-pump-simulate",
    modelVersion: "4",
    runId: "mlflow-run-4",
    promotedAt: "2026-08-25T00:00:00Z",
    inputContract: { sequenceLength: 12 },
    outputContract: {
      kind: "forecast",
      features: ["temperature", "vibration"],
      forecastCadenceSeconds: 600,
    },
  },
  horizonMin: 1,
  horizonMax: 100,
  uncertaintySupported: false,
};

describe("SchemaDrivenSimulator", () => {
  beforeEach(() => {
    provider.listEntityTelemetry.mockResolvedValue([
      {
        id: "reading-1",
        timestamp: "2025-01-05T03:40:00Z",
        sessionId: "run-3",
        schemaVersion: 1,
        payload: { temperature: 39.57, vibration: 1.26 },
      },
      {
        id: "reading-2",
        timestamp: "2025-01-05T03:50:00Z",
        sessionId: "run-3",
        schemaVersion: 1,
        payload: { temperature: 66.73, vibration: 9.44 },
      },
    ]);
    provider.runGenericSimulation.mockResolvedValue({
      id: "simulation-1",
      entityId: "entity-pump",
      sessionId: "run-3",
      sourceTimeRange: {
        start: "2025-01-05T03:40:00Z",
        end: "2025-01-05T03:50:00Z",
      },
      schemaVersion: 1,
      createdAt: "2026-08-25T00:00:00Z",
      modelName: "cooling-pump-simulate",
      modelVersion: "4",
      mlflowRunId: "mlflow-run-4",
      durationMinutes: 30,
      horizonSteps: 1,
      forecastCadenceSeconds: 600,
      forecastTimestamps: ["2025-01-05T04:00:00Z"],
      inputFeatures: ["temperature", "vibration"],
      forecasts: [{ temperature: 67.5, vibration: 9.6 }],
      uncertainty: {},
      warnings: [
        "Forecast cadence was inferred from recent persisted telemetry because the production model contract does not declare it.",
      ],
    });
  });

  test("uses persisted current telemetry instead of editable sensor inputs", async () => {
    const user = userEvent.setup();

    render(
      <SchemaDrivenSimulator
        entities={[entity]}
        entityId={entity.entityId}
        showEntitySelector={false}
      />,
    );

    expect(await screen.findByText("Current sensor context")).toBeVisible();
    expect(screen.getByText("66.73")).toBeVisible();
    expect(screen.getByText("9.44")).toBeVisible();
    expect(screen.queryByText(/optional override/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/temperature.*optional override/i)).not.toBeInTheDocument();
    expect(provider.listEntityTelemetry).toHaveBeenCalledWith("entity-pump", {
      sessionId: "run-3",
      limit: 60,
    });

    await user.click(screen.getByRole("button", { name: "Run simulation" }));

    await waitFor(() => {
      // The request asks for a duration preset, not a step count: the number of steps
      // depends on the model's own cadence, which the caller does not know.
      expect(provider.runGenericSimulation).toHaveBeenCalledWith("entity-pump", {
        sessionId: "run-3",
        durationMinutes: 30,
      });
    });
    expect(await screen.findByText("Simulation results")).toBeVisible();
    expect(screen.getByText("Actual context")).toBeVisible();
    expect(screen.getByText("Simulated future")).toBeVisible();
    expect(screen.getByText("Simulation notice")).toBeVisible();
    expect(screen.getByText(/forecast cadence was inferred/i)).toBeVisible();
  });
});
