import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MqttBrokerStatusCard } from "@/components/admin/mqtt-broker-status-card";
import { MqttHealthPanel } from "@/components/admin/mqtt-health-panel";
import { healthyMqttHealth } from "@/test/fixtures/mqtt-health";

describe("MqttHealthPanel", () => {
  it.each([
    ["not-configured", "Not configured"],
    ["starting", "Starting"],
    ["healthy", "Healthy"],
    ["degraded", "Degraded"],
    ["unhealthy", "Unhealthy"],
  ] as const)("renders the %s pipeline state", (status, label) => {
    render(<MqttHealthPanel health={{ ...healthyMqttHealth, status }} />);

    expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
  });

  it("shows connection, throughput, message problems, and reconnect evidence", () => {
    render(<MqttHealthPanel health={healthyMqttHealth} />);

    expect(
      screen.getByRole("heading", { name: "MQTT pipeline health" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Subscribed")).toBeInTheDocument();
    expect(screen.getByText("120 / min received")).toBeInTheDocument();
    expect(screen.getByText("120 / min accepted")).toBeInTheDocument();
    expect(screen.getByText("120 / min expected")).toBeInTheDocument();
    expect(screen.getByText("7,200 received")).toBeInTheDocument();
    expect(screen.getByText("7 invalid")).toBeInTheDocument();
    expect(screen.getByText("3 rejected")).toBeInTheDocument();
    expect(screen.getByText("2 total reconnect attempts")).toBeInTheDocument();
    expect(
      screen.getByText(/separate from model readiness/i),
    ).toBeInTheDocument();
  });

  it("renders an honest not-configured state without claiming a connection", () => {
    render(
      <MqttHealthPanel
        health={{
          ...healthyMqttHealth,
          status: "not-configured",
          summary: "No MQTT ingestion adapter is reporting operational events.",
          broker: { state: "not-configured" },
          subscription: { state: "not-configured" },
          messages: {
            ...healthyMqttHealth.messages,
            flowState: "not-configured",
            receivedTotal: 0,
            acceptedTotal: 0,
            invalidTotal: 0,
            rejectedTotal: 0,
            receivedPerMinute: 0,
            acceptedPerMinute: 0,
            expectedPerMinute: null,
          },
        }}
      />,
    );

    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(
      screen.getByText("No MQTT ingestion adapter is reporting operational events."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });

  it("keeps the last snapshot visible when refresh fails", () => {
    render(
      <MqttHealthPanel
        health={healthyMqttHealth}
        error={{
          title: "MQTT health could not be refreshed",
          message: "The last available health snapshot remains visible. We’ll try again automatically.",
        }}
      />,
    );

    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("MQTT health could not be refreshed")).toBeInTheDocument();
  });
});

describe("MqttBrokerStatusCard", () => {
  it.each([
    ["connected", "Running"],
    ["connecting", "Starting"],
    ["disconnected", "Not running"],
    ["not-configured", "Not configured"],
  ] as const)("renders %s as %s", (state, label) => {
    render(
      <MqttBrokerStatusCard
        health={{ ...healthyMqttHealth, broker: { ...healthyMqttHealth.broker, state } }}
      />,
    );

    expect(screen.getByRole("heading", { name: "MQTT broker status" })).toBeInTheDocument();
    // The label shows in the badge and in the headline.
    expect(screen.getAllByText(label, { exact: true })).toHaveLength(2);
  });

  it("does not claim the broker is running before a health snapshot is available", () => {
    render(<MqttBrokerStatusCard health={null} isLoading />);

    expect(screen.getByRole("heading", { name: "MQTT broker status" })).toBeInTheDocument();
    expect(screen.queryByText("Running", { exact: true })).not.toBeInTheDocument();
  });
});
