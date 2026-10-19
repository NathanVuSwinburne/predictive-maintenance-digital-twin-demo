import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { chartRowsForFeature, LiveMachinePanelContent } from "@/components/live/live-machine-panel";
import type { EntityLiveStatus } from "@/lib/domain/types";
import { liveStatusFixture } from "./fixtures/live-status";

const lastCheckedAt = new Date("2026-10-06T10:00:10.500Z");

function renderPanel(
  status: EntityLiveStatus | null,
  overrides: Partial<Parameters<typeof LiveMachinePanelContent>[0]> = {},
) {
  return render(
    <LiveMachinePanelContent
      status={status}
      connectionState="connected"
      error={null}
      lastCheckedAt={lastCheckedAt}
      {...overrides}
    />,
  );
}

describe("LiveMachinePanelContent", () => {
  it("renders nothing before the first status or when the machine has no live source", () => {
    const { container, rerender } = renderPanel(null);
    expect(container).toBeEmptyDOMElement();

    rerender(
      <LiveMachinePanelContent
        status={{ ...liveStatusFixture, state: "no-source", source: null }}
        connectionState="connected"
        error={null}
        lastCheckedAt={lastCheckedAt}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows live readings, the MQTT source, the prediction, and the reported label", () => {
    renderPanel(liveStatusFixture, { machineName: "Vibration Sensor Machine" });

    expect(screen.getByText("Live")).toHaveAttribute("data-variant", "success");
    expect(screen.getByText("CMTK live (MQTT)")).toBeInTheDocument();
    expect(screen.getByText("Live Machine Data")).toBeInTheDocument();
    expect(screen.getByText(/Vibration Sensor Machine · readings arrive directly from Balluff vibration sensor/)).toBeInTheDocument();
    expect(screen.getByText("Readings are arriving from the machine.")).toBeInTheDocument();
    expect(screen.queryByText("Showing last-known values")).not.toBeInTheDocument();

    // Latest values with the machine's declared units, vibration first.
    const featureLabels = screen.getAllByText(/^(VibrationX|VibrationY|VibrationZ|Temperature)( \(.*\))?$/).map((node) => node.textContent);
    expect(featureLabels).toEqual([
      "VibrationX (g)",
      "VibrationY (g)",
      "VibrationZ (g)",
      "Temperature (°C)",
    ]);
    expect(screen.getByText("1.62")).toBeInTheDocument();
    expect(screen.getByText("41.5")).toBeInTheDocument();
    // Next-step forecast per feature.
    expect(screen.getAllByText("Next forecast")).toHaveLength(4);
    expect(screen.getByText("1.75")).toBeInTheDocument();

    // Freshness against the server clock, not the browser clock.
    expect(screen.getByText(/Last reading: .*received 2 s ago/)).toBeInTheDocument();

    const predicted = screen.getByTestId("predicted-label");
    expect(predicted).toHaveTextContent("high");
    expect(predicted).toHaveAttribute("data-variant", "warning");
    expect(screen.getByText("82% confidence")).toBeInTheDocument();
    // The CMTK layout runs the Machine C model: labels are vibration intensity, not risk.
    expect(screen.getByRole("heading", { name: "Predicted vibration level" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Vibration level reported by the machine" })).toBeInTheDocument();
    expect(screen.getByText(/how strongly the machine is vibrating\. This is not a failure risk\./)).toBeInTheDocument();
    const probabilities = screen.getByRole("list", { name: "Vibration level probabilities" });
    expect(within(probabilities).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "low8%",
      "medium10%",
      "high82%",
    ]);
    expect(screen.getByText(/cmtk-predict v3 · .* · 30 readings/)).toBeInTheDocument();
    expect(screen.getByText("Matches the vibration level the machine is reporting.")).toBeInTheDocument();

    const reported = screen.getByTestId("reported-label");
    expect(reported).toHaveTextContent("high");
    expect(reported).toHaveAttribute("data-variant", "warning");

    // Recent activity merges predictions and label changes, newest first.
    const activity = screen.getByRole("heading", { name: "Recent activity" }).nextElementSibling;
    expect(activity?.textContent).toContain("Predicted vibration level: high · 82% confidence");
    expect(activity?.textContent).toContain("Predicted vibration level: medium · 60% confidence");
    expect(activity?.textContent).toContain("Machine reported vibration level: medium");
  });

  it("keeps neutral status wording for a machine outside the CMTK sensor layout", () => {
    renderPanel({
      ...liveStatusFixture,
      entityId: "entity-press",
      features: ["Pressure", "Temperature"],
      featureUnits: { Pressure: "bar", Temperature: "C" },
      observations: liveStatusFixture.observations.map((observation) => ({
        ...observation,
        values: { Pressure: 4.2, Temperature: 40 },
      })),
    });

    expect(screen.getByRole("heading", { name: "Current prediction" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Status reported by the machine" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Class probabilities" })).toBeInTheDocument();
    expect(screen.getByText("Matches the status the machine is reporting.")).toBeInTheDocument();
    const activity = screen.getByRole("heading", { name: "Recent activity" }).nextElementSibling;
    expect(activity?.textContent).toContain("Predicted high · 82% confidence");
    expect(activity?.textContent).toContain("Machine reported medium");
    expect(screen.queryByText(/vibration level/i)).not.toBeInTheDocument();
  });

  it("labels stale data as last-known without calling it live", () => {
    renderPanel({ ...liveStatusFixture, state: "stale" });

    expect(screen.getByText("Stale")).toHaveAttribute("data-variant", "warning");
    expect(screen.getByText("Showing last-known values")).toBeInTheDocument();
    expect(
      screen.getByText("No new readings have arrived recently. Showing last-known values."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(screen.getByText("1.62")).toBeInTheDocument();
  });

  it("overrides a live payload with Disconnected when polling the server keeps failing", () => {
    renderPanel(liveStatusFixture, {
      connectionState: "disconnected",
      error: { title: "Couldn’t refresh information", message: "We’ll try again automatically." },
    });

    expect(screen.getByText("Disconnected")).toHaveAttribute("data-variant", "destructive");
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "The connection to the server was lost. Showing last-known values. Retrying automatically.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Couldn’t refresh information")).toBeInTheDocument();
    expect(screen.getByText("1.62")).toBeInTheDocument();
  });

  it("shows the broker's own reconnecting and disconnected states", () => {
    const { rerender } = renderPanel({ ...liveStatusFixture, state: "reconnecting" });
    expect(screen.getByText("Reconnecting")).toHaveAttribute("data-variant", "warning");

    rerender(
      <LiveMachinePanelContent
        status={{ ...liveStatusFixture, state: "disconnected" }}
        connectionState="connected"
        error={null}
        lastCheckedAt={lastCheckedAt}
      />,
    );
    expect(screen.getByText("Disconnected")).toHaveAttribute("data-variant", "destructive");
    expect(
      screen.getByText("The machine's data connection is down. Showing last-known values."),
    ).toBeInTheDocument();
  });

  it("explains the waiting state without inventing readings", () => {
    renderPanel({
      ...liveStatusFixture,
      state: "waiting",
      observations: [],
      latestLabel: null,
      labelHistory: [],
      inference: {
        enabled: true,
        status: "waiting",
        message: null,
        lastAttemptAt: null,
        latest: null,
        recent: [],
      },
      forecast: { ...liveStatusFixture.forecast, status: "waiting", latest: null, recent: [] },
    });

    expect(screen.getByText("Waiting for first message")).toHaveAttribute("data-variant", "outline");
    expect(screen.getByText(/Last reading: Not available/)).toBeInTheDocument();
    expect(screen.getByText("Waiting for enough readings")).toBeInTheDocument();
    expect(
      screen.getByText("The machine sends readings only; it does not report a vibration level of its own."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Showing last-known values")).not.toBeInTheDocument();
    expect(screen.queryByText("Next forecast")).not.toBeInTheDocument();
    // Declared features still appear so the operator knows what will arrive.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  it("explains an unavailable prediction and forecast using the backend's reason", () => {
    renderPanel({
      ...liveStatusFixture,
      inference: {
        enabled: true,
        status: "unavailable",
        message: "No active prediction model has been promoted for this machine.",
        lastAttemptAt: null,
        latest: null,
        recent: [],
      },
      forecast: {
        enabled: true,
        status: "unavailable",
        message: "No active forecast model has been promoted for this machine.",
        lastAttemptAt: null,
        latest: null,
        recent: [],
      },
    });

    expect(screen.getByText("Prediction isn't available yet")).toBeInTheDocument();
    expect(
      screen.getByText("No active prediction model has been promoted for this machine."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No active forecast model has been promoted for this machine\./),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("predicted-label")).not.toBeInTheDocument();
  });

  it("hides raw runtime errors and warns when the subscriber is disabled", () => {
    renderPanel({
      ...liveStatusFixture,
      subscriberEnabled: false,
      source: { ...liveStatusFixture.source!, lastError: "Payload missing field 'ts'" },
      inference: {
        ...liveStatusFixture.inference,
        status: "error",
        message: "Traceback: KeyError 'VibrationX'",
        latest: null,
      },
    });

    expect(screen.getByText("Live data collection is turned off on the server")).toBeInTheDocument();
    expect(screen.getByText("The last prediction could not run")).toBeInTheDocument();
    expect(screen.queryByText(/Traceback/)).not.toBeInTheDocument();
    expect(screen.getByText(/Most recent source issue: Payload missing field 'ts'/)).toBeInTheDocument();
  });
  it("drops forecasts older than the plotted readings so the chart is not stretched", () => {
    const observations = [
      { timestamp: "2026-10-06T10:00:10.000Z", sessionId: "s", values: { VibrationX: 1 }, receivedAt: "2026-10-06T10:00:10.000Z" },
      { timestamp: "2026-10-06T10:00:11.000Z", sessionId: "s", values: { VibrationX: 2 }, receivedAt: "2026-10-06T10:00:11.000Z" },
    ];
    const forecast = (based: string, value: number) => ({
      id: based, generatedAt: based, sessionId: "s", forecast: { VibrationX: value },
      basedOnTimestamp: based, modelName: "m", modelVersion: "1", inputRows: 1,
    });
    const rows = chartRowsForFeature(
      "VibrationX", observations,
      [forecast("2026-10-06T10:00:00.000Z", 9), forecast("2026-10-06T10:00:11.000Z", 3)],
      1_000,
    );
    expect(rows.map((row) => row.forecast).filter((value) => value !== undefined)).toEqual([3]);
    expect(rows[0].t).toBe(Date.parse("2026-10-06T10:00:10.000Z"));
  });
});
