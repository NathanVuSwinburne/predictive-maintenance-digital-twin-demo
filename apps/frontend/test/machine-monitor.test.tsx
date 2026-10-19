import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MachineMonitorContent, monitorFeatures } from "@/components/monitor/machine-monitor";
import type { CmtkMachine, EntityLiveHorizon, EntityLiveStatus } from "@/lib/domain/types";
import { liveStatusFixture } from "./fixtures/live-status";
import { configured, thresholds as vibrationThresholds } from "./fixtures/vibration-thresholds";

vi.mock("@/hooks/use-data-provider", () => ({ useDataProvider: () => ({}) }));

const lastCheckedAt = new Date("2026-10-06T10:00:10.500Z");

const horizon: EntityLiveHorizon = {
  status: "ok",
  message: null,
  attemptedAt: "2026-10-06T10:00:09.000Z",
  basedOnTimestamp: "2026-10-06T10:00:08.000Z",
  horizonMinutes: 60,
  cadenceSeconds: 1800,
  points: [30, 60].map((minutes) => ({
    timestamp: new Date(Date.parse("2026-10-06T10:00:08.000Z") + minutes * 60_000).toISOString(),
    values: { Temperature: 41.5 + minutes * 0.1, VibrationX: 1.62, VibrationY: 1.1, VibrationZ: 0.9 },
  })),
  modelName: "cmtk-simulate",
  modelVersion: "2",
};

const machine: CmtkMachine = {
  entityId: "entity-cmtk",
  name: "CMTK Demo Rig",
  description: "Lab 2 test rig",
  sourceId: "source-mqtt-1",
  state: "live",
  lastMessageAt: "2026-10-06T10:00:08.000Z",
  lastError: null,
};

function renderMonitor(
  status: EntityLiveStatus | null,
  overrides: Partial<Parameters<typeof MachineMonitorContent>[0]> = {},
) {
  return render(
    <MachineMonitorContent
      status={status}
      connectionState="connected"
      error={null}
      lastCheckedAt={lastCheckedAt}
      machine={machine}
      {...overrides}
    />,
  );
}

describe("MachineMonitorContent", () => {
  it("shows a connecting state before the first status", () => {
    renderMonitor(null);
    expect(screen.getByText("Connecting to the machine…")).toBeInTheDocument();
  });

  it("waits for the first reading, then switches to live readings when data arrives", () => {
    const waiting: EntityLiveStatus = {
      ...liveStatusFixture,
      state: "waiting",
      observations: [],
      latestLabel: null,
      labelHistory: [],
      inference: { ...liveStatusFixture.inference, status: "waiting", latest: null, recent: [] },
      horizon: { ...horizon, status: "waiting", points: [] },
    };
    const { rerender } = renderMonitor(waiting);

    expect(screen.getByText("CMTK Demo Rig")).toBeInTheDocument();
    expect(screen.getByText("Lab 2 test rig")).toBeInTheDocument();
    expect(screen.getByText("CMTK")).toBeInTheDocument();
    expect(screen.getByText("Waiting for first reading")).toBeInTheDocument();
    expect(screen.getByTestId("monitor-waiting")).toHaveTextContent(/Waiting for the first reading from the CMTK/);
    expect(screen.queryByText("Current readings")).not.toBeInTheDocument();

    rerender(
      <MachineMonitorContent
        status={{ ...liveStatusFixture, horizon }}
        connectionState="connected"
        error={null}
        lastCheckedAt={lastCheckedAt}
        machine={machine}
      />,
    );

    expect(screen.queryByTestId("monitor-waiting")).not.toBeInTheDocument();
    expect(screen.getByText("Live")).toHaveAttribute("data-variant", "success");
    expect(screen.getByText("Current readings")).toBeInTheDocument();
    expect(within(screen.getByTestId("reading-VibrationX")).getByText("1.62")).toBeInTheDocument();
    expect(within(screen.getByTestId("reading-Temperature")).getByText("Temperature (°C)")).toBeInTheDocument();
    expect(screen.getByTestId("reported-label")).toHaveTextContent("high");
    expect(screen.getByTestId("predicted-label")).toHaveTextContent("high");
    expect(screen.getByText("82% confidence")).toBeInTheDocument();
    // Machine C / CMTK labels are the vibration intensity level, never failure risk.
    expect(screen.getByRole("heading", { name: "Vibration level reported by the machine" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Predicted vibration level" })).toBeInTheDocument();
    expect(screen.getByText("Matches the vibration level the machine is reporting.")).toBeInTheDocument();
    expect(screen.getByText(/how strongly the machine is vibrating\. This is not a failure risk\./)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Our prediction" })).not.toBeInTheDocument();
    // Times are Melbourne wall-clock time, labelled once in the header.
    expect(screen.getByTestId("monitor-time-zone")).toHaveTextContent("Times in Melbourne (AEDT)");
    // One outlook per feature with a plain-language line and +15/+30/+60 values.
    const temperatureOutlook = screen.getByRole("article", { name: "Temperature (°C) outlook" });
    expect(temperatureOutlook).toHaveTextContent("Expected to rise from 41.5 °C to 47.5 °C over the next hour.");
    expect(temperatureOutlook).toHaveTextContent("+60 min");
    expect(screen.getAllByText("Measured (solid)")).toHaveLength(4);
    // Recent activity is collapsed by default.
    expect(screen.getByText("Recent activity").closest("details")).not.toHaveAttribute("open");
  });

  it("keeps neutral status wording for a machine outside the CMTK sensor layout", () => {
    const generic: EntityLiveStatus = {
      ...liveStatusFixture,
      entityId: "entity-press",
      features: ["Pressure", "Temperature"],
      featureUnits: { Pressure: "bar", Temperature: "C" },
      observations: liveStatusFixture.observations.map((observation) => ({
        ...observation,
        values: { Pressure: 4.2, Temperature: 40 },
      })),
      horizon,
    };
    renderMonitor(generic);
    expect(screen.getByRole("heading", { name: "Status reported by the machine" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Our prediction" })).toBeInTheDocument();
    expect(screen.getByText("Matches the status the machine is reporting.")).toBeInTheDocument();
    expect(screen.queryByText(/vibration level/i)).not.toBeInTheDocument();
  });

  it("orders vibration first and includes extra numeric values from observations", () => {
    expect(
      monitorFeatures({
        ...liveStatusFixture,
        features: ["Temperature"],
        observations: [
          { ...liveStatusFixture.observations[0], values: { Temperature: 1, VibrationX: 2, Humidity: 3, Mode: "low" } },
        ],
      }),
    ).toEqual(["VibrationX", "Humidity", "Temperature"]);
  });

  it("is honest when readings are stale or our own poll is failing", () => {
    const { rerender } = renderMonitor({ ...liveStatusFixture, state: "stale", horizon });
    expect(screen.getByText("Stale")).toHaveAttribute("data-variant", "warning");
    expect(screen.getAllByText("Showing last-known values").length).toBeGreaterThan(0);

    rerender(
      <MachineMonitorContent
        status={{ ...liveStatusFixture, horizon }}
        connectionState="disconnected"
        error={{ title: "Couldn’t refresh information", message: "The last-known live values are still shown." }}
        lastCheckedAt={lastCheckedAt}
        machine={machine}
      />,
    );
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(screen.getByText("Disconnected")).toHaveAttribute("data-variant", "destructive");
    expect(screen.getByText(/connection to the server was lost/)).toBeInTheDocument();
    expect(screen.getByText("Couldn’t refresh information")).toBeInTheDocument();
  });

  it("explains an outlook that cannot be drawn without raw error text", () => {
    renderMonitor({ ...liveStatusFixture, horizon: { ...horizon, status: "error", message: "Traceback …", points: [] } });
    expect(screen.getByText("The outlook could not be updated")).toBeInTheDocument();
    expect(screen.queryByText(/Traceback/)).not.toBeInTheDocument();
    expect(screen.queryByText(/over the next hour/)).not.toBeInTheDocument();
  });

  it("points an unconnected machine back to the connect flow", () => {
    renderMonitor({ ...liveStatusFixture, state: "no-source", source: null, observations: [] });
    expect(screen.getByText(/isn't connected to the CMTK/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect a machine" })).toHaveAttribute("href", "/monitor");
  });

  it("offers switching only when several machines are connected", () => {
    const { rerender } = renderMonitor({ ...liveStatusFixture, horizon }, { machineCount: 1 });
    expect(screen.queryByRole("link", { name: /Switch machine/ })).not.toBeInTheDocument();
    rerender(
      <MachineMonitorContent
        status={{ ...liveStatusFixture, horizon }}
        connectionState="connected"
        error={null}
        lastCheckedAt={lastCheckedAt}
        machine={machine}
        machineCount={2}
        onEditDetails={() => {}}
      />,
    );
    expect(screen.getByRole("link", { name: /Switch machine/ })).toHaveAttribute("href", "/monitor?choose=1");
    expect(screen.getByRole("button", { name: /Edit machine details/ })).toBeInTheDocument();
  });

  describe("vibration health checks", () => {
    const mmPerSecond = {
      ...liveStatusFixture,
      horizon,
      featureUnits: { Temperature: "C", VibrationX: "mm/s", VibrationY: "mm/s", VibrationZ: "mm/s" },
    };

    it("stays hidden for callers that do not pass thresholds", () => {
      renderMonitor(mmPerSecond);
      expect(screen.queryByTestId("health-checks")).not.toBeInTheDocument();
    });

    it("keeps the learned and engineering checks separate and does not invent an engineering limit", () => {
      renderMonitor(mmPerSecond, { thresholds: vibrationThresholds() });
      const card = screen.getByTestId("health-checks");
      // Predicted HIGH; X window RMS of 1.1, 1.4, 1.62 ≈ 1.39 > 0.9.
      expect(within(card).getByTestId("health-machine-X")).toHaveTextContent(/1\.39 mm\/s.*0\.90 mm\/s.*Above normal/);
      expect(within(card).getByTestId("health-machine-Y")).toHaveTextContent(/1\.00 mm\/s.*1\.20 mm\/s.*Normal/);
      expect(within(card).getByTestId("health-machine-status")).toHaveTextContent("Above normal");
      expect(within(card).getByTestId("health-engineering-status")).toHaveTextContent("Not configured");
      expect(within(card).getByTestId("health-engineering-unavailable")).toHaveTextContent(/Not configured.*Requires:/);
      expect(within(card).queryByText(/ISO 20816-3 · Group/)).not.toBeInTheDocument();
      expect(screen.getByTestId("health-interpretation")).toHaveTextContent(/No engineering limit is configured/);
      expect(card).toHaveTextContent(/do not predict failure/);

      const legend = screen.getByTestId("thresholds-VibrationX");
      expect(legend).toHaveTextContent(/Machine-specific 0\.90 mm\/s · 99th percentile of HIGH-X history/);
      expect(legend).toHaveTextContent(/Engineering · Not configured/);
      expect(screen.queryByTestId("thresholds-Temperature")).not.toBeInTheDocument();
    });

    it("switching the level changes the learned threshold per axis", () => {
      renderMonitor(mmPerSecond, { thresholds: vibrationThresholds() });
      fireEvent.click(screen.getByRole("radio", { name: "LOW" }));
      expect(screen.getByTestId("health-machine-X")).toHaveTextContent(/0\.50 mm\/s/);
      expect(screen.getByTestId("health-machine-Z")).toHaveTextContent(/0\.55 mm\/s/);
      expect(screen.getByTestId("thresholds-VibrationY")).toHaveTextContent(/0\.70 mm\/s · 99th percentile of LOW-Y history/);
      fireEvent.click(screen.getByRole("radio", { name: "MEDIUM" }));
      expect(screen.getByTestId("health-machine-Y")).toHaveTextContent(/Not enough history/);
      expect(screen.getByTestId("health-machine-X")).toHaveTextContent(/0\.60 mm\/s \*/);
    });

    it("shows a configured engineering reference and the disagreement between checks", () => {
      renderMonitor(mmPerSecond, { thresholds: configured("provisional") });
      expect(screen.getByTestId("health-engineering-X")).toHaveTextContent(/1\.39 mm\/s.*2\.80 mm\/s.*Within limit/);
      expect(screen.getByTestId("health-interpretation")).toHaveTextContent(
        /unusual for this machine, but still below the engineering severity limit/,
      );
      expect(screen.getByTestId("thresholds-VibrationX")).toHaveTextContent(/not confirmed for this machine/);
    });
  });
});
