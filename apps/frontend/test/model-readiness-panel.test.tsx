import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ModelReadinessPanel } from "@/components/machines/model-readiness-panel";
import type { ModelReadiness, ModelReadinessState } from "@/lib/domain/types";

const collecting: ModelReadiness = {
  machineId: "machine-c",
  profileId: "machine-c-forecast-v1",
  state: "collecting-data",
  canInfer: false,
  summary: "Collecting data",
  reason: "Prediction will start when the input window is complete and valid.",
  nextAction: "Collect 720 more observations.",
  evaluatedAt: "2026-08-12T10:00:00Z",
  latestSampleAt: "2026-08-12T09:59:59Z",
  progress: {
    observedRows: 1680,
    requiredRows: 2400,
    percent: 70,
    observedDurationSeconds: 840,
    requiredDurationSeconds: 1200,
    estimatedRemainingSeconds: 360,
  },
  sensors: [
    ["VibrationX", "Vibration X", "g"],
    ["VibrationY", "Vibration Y", "g"],
    ["VibrationZ", "Vibration Z", "g"],
    ["Temperature", "Temperature", "°C"],
  ].map(([name, label, unit]) => ({
    name,
    label,
    unit,
    status: "receiving" as const,
    validRows: 1680,
    requiredRows: 2400,
    detail: `Receiving valid ${label} values.`,
  })),
  checks: {
    windowLength: {
      status: "in-progress",
      label: "Window length",
      detail: "1,680 of 2,400 observations collected.",
    },
    cadence: {
      status: "pass",
      label: "Sample cadence",
      detail: "Valid at the expected 500 ms cadence.",
    },
    freshness: {
      status: "pass",
      label: "Latest sample",
      detail: "Fresh within the 15-second limit.",
    },
  },
};

describe("ModelReadinessPanel", () => {
  it("explains collection progress, sensor requirements, and validation checks", () => {
    render(<ModelReadinessPanel readiness={collecting} />);

    expect(
      screen.getByRole("heading", { name: "Model readiness" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Collecting data")).toBeInTheDocument();
    expect(screen.getByText("1,680 of 2,400 observations")).toBeInTheDocument();
    expect(screen.getByText("14:00 of 20:00 minutes")).toBeInTheDocument();
    expect(
      screen.getByText("6:00 remaining at the expected 500 ms cadence"),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "70",
    );
    expect(screen.getByText("Vibration X")).toBeInTheDocument();
    expect(screen.getAllByText("Receiving")).toHaveLength(4);
    expect(
      screen.getByText("Valid at the expected 500 ms cadence."),
    ).toBeInTheDocument();
    expect(screen.getByText("What's needed next")).toBeInTheDocument();
    expect(
      screen.getByText("Collect 720 more observations."),
    ).toBeInTheDocument();
  });

  it.each([
    ["ready", "Ready for inference"],
    ["collecting-data", "Collecting data"],
    ["stale", "Input data is stale"],
    ["missing-sensor", "Required sensor data is missing"],
    ["invalid-window", "Input window is invalid"],
    ["prediction-unavailable", "Automatic prediction unavailable"],
  ] satisfies Array<[ModelReadinessState, string]>)(
    "renders the %s state with operator-facing text",
    (state, summary) => {
      render(
        <ModelReadinessPanel
          compact
          readiness={{ ...collecting, state, summary }}
        />,
      );

      expect(screen.getByText(summary)).toBeInTheDocument();
      expect(screen.getByText(collecting.reason)).toBeInTheDocument();
      expect(screen.getByText(collecting.nextAction)).toBeInTheDocument();
    },
  );

  it("announces loading and request failures without presenting a prediction", () => {
    const { rerender } = render(
      <ModelReadinessPanel readiness={null} isLoading />,
    );
    expect(
      screen.getByText("Checking model requirements…"),
    ).toBeInTheDocument();

    rerender(
      <ModelReadinessPanel
        readiness={null}
        error={{
          title: "Readiness could not be checked",
          message: "Model readiness is temporarily unavailable. We’ll try again automatically.",
        }}
      />,
    );
    expect(screen.getByText("Readiness could not be checked")).toBeInTheDocument();
    expect(screen.queryByText("Readiness service unavailable")).not.toBeInTheDocument();
  });
});
