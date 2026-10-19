import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { PredictionResult } from "@/components/simulator/prediction-result";
import type { ManualPredictionResult } from "@/lib/domain/types";

const result: ManualPredictionResult = {
  machineId: "machine-a", machineType: "ai4i", predictedLabel: "Low Risk",
  failureProbability: 0.001, confidence: 0.695, severity: "low", failureType: null,
  thresholdTriggered: false, warnings: [], breachedFields: [], generatedAt: "2026-10-01T09:00:00Z",
};

describe("prediction interpretation", () => {
  test("leads with risk, keeps the unrelated type score in an optional disclosure", async () => {
    render(<PredictionResult result={result} />);
    expect(screen.getByRole("heading", { name: "Low predicted risk" })).toBeVisible();
    expect(screen.getByText("0.1%")).toBeVisible();
    expect(screen.getByText("69.5%")).not.toBeVisible();
    expect(screen.getByText(/continue routine monitoring/i)).toBeVisible();
    await userEvent.click(screen.getByText("Model details"));
    expect(screen.getByText("69.5%")).toBeVisible();
    expect(screen.getByText("Failure-type confidence")).toBeVisible();
    expect(screen.getByText(/does not measure confidence in the overall risk/i)).toBeVisible();
  });
  test("the threshold decision takes precedence over a low severity label", () => {
    render(<PredictionResult result={{ ...result, thresholdTriggered: true, failureType: "Tool Wear Failure" }} />);
    expect(screen.getByRole("heading", { name: "Possible failure detected" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Low predicted risk" })).not.toBeInTheDocument();
    expect(screen.getByText("Tool Wear Failure")).toBeVisible();
  });
  test("historical rows never imply an absent decision was below threshold or inputs validated", async () => {
    render(<PredictionResult result={{ ...result, thresholdTriggered: null }} historical />);
    expect(screen.getByText("Historical result · not current")).toBeVisible();
    expect(screen.queryByText(/did not trigger/)).not.toBeInTheDocument();
    expect(screen.queryByText(/inputs stayed within/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Model details"));
    expect(screen.getByText("Not recorded for this result.")).toBeVisible();
  });
  test("Machine C reads as a vibration level, with high-vibration probability distinct from label confidence", async () => {
    render(<PredictionResult result={{ ...result, machineType: "real-sensor", predictedLabel: "medium", severity: "medium", thresholdTriggered: null }} />);
    expect(screen.getByRole("heading", { name: "Medium vibration level" })).toBeVisible();
    expect(screen.queryByText(/predicted risk/i)).not.toBeInTheDocument();
    expect(screen.getByText("Probability of high vibration")).toBeVisible();
    await userEvent.click(screen.getByText("Model details"));
    expect(screen.getByText("Vibration-level confidence")).toBeVisible();
    expect(screen.queryByText("Failure alert")).not.toBeInTheDocument();
  });
  test("the empty state names the vibration level for Machine C", () => {
    render(<PredictionResult result={null} vibrationLevel />);
    expect(screen.getByText(/see the predicted vibration level here/)).toBeVisible();
  });
  test("input warnings stay prominent and change the next step", () => {
    render(<PredictionResult result={{ ...result, warnings: ["Temperature is outside the observed range."] }} />);
    expect(screen.getByText("Temperature is outside the observed range.")).toBeVisible();
    expect(screen.getByText(/Review the flagged inputs/)).toBeVisible();
  });
});
