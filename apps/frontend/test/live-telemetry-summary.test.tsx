import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LiveTelemetrySummary } from "@/components/telemetry/live-telemetry-summary";

describe("LiveTelemetrySummary", () => {
  it("shows current readings, connection, freshness, and safe sample metadata", () => {
    render(
      <LiveTelemetrySummary
        latestPoint={{
          timestamp: "row-9999",
          temperature: 64,
          vibration: 0.42,
          pressure: 31,
          power: 12,
        }}
        connectionState="disconnected"
        isStale
        lastCheckedAt={new Date("2026-08-12T10:00:00.000Z")}
      />,
    );

    expect(screen.getByText("Disconnected")).toHaveAttribute(
      "data-variant",
      "destructive",
    );
    expect(screen.getByText("Stale data")).toHaveAttribute(
      "data-variant",
      "warning",
    );
    expect(screen.getByText("Showing last-known values.")).toBeInTheDocument();
    expect(
      screen.getByText(/Last data sample: Sample row-9999/),
    ).toBeInTheDocument();
    expect(screen.getByText("64")).toBeInTheDocument();
    expect(screen.getByText("0.42")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("shows a successful empty state without inventing readings", () => {
    render(
      <LiveTelemetrySummary
        latestPoint={null}
        connectionState="connected"
        isStale
        lastCheckedAt={new Date("2026-08-12T10:00:00.000Z")}
      />,
    );

    expect(screen.getByText("No Data")).toHaveAttribute(
      "data-variant",
      "outline",
    );
    expect(
      screen.getByText("No sensor data is available for this machine yet."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Showing last-known values."),
    ).not.toBeInTheDocument();
  });

  it("explains stale connected data without calling it up to date", () => {
    render(
      <LiveTelemetrySummary
        latestPoint={{
          timestamp: "2026-08-12T10:00:00.000Z",
          temperature: 64,
          vibration: 0.42,
          pressure: 31,
          power: 12,
        }}
        connectionState="connected"
        isStale
        lastCheckedAt={new Date("2026-08-12T10:00:15.000Z")}
      />,
    );

    expect(
      screen.getByText("No new data samples received."),
    ).toBeInTheDocument();
    expect(screen.getByText("Connected")).toHaveAttribute(
      "data-variant",
      "success",
    );
    expect(
      screen.queryByText("Telemetry is up to date."),
    ).not.toBeInTheDocument();
  });

  it("explains automatic retry before any readings arrive", () => {
    render(
      <LiveTelemetrySummary
        latestPoint={null}
        connectionState="reconnecting"
        isStale={false}
        lastCheckedAt={null}
      />,
    );

    expect(
      screen.getByText("Connection interrupted. Trying again automatically."),
    ).toBeInTheDocument();
  });
});
