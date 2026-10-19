import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MqttSubscriptionsPanel } from "@/components/admin/mqtt-subscribe-dialog";
import type {
  MqttSubscription,
  MqttSubscriptionInput,
} from "@/lib/domain/types";

const subscription: MqttSubscription = {
  id: "subscription-1",
  name: "Machine C production feed",
  brokerHost: "mqtt.example.internal",
  port: 8883,
  topic: "plant/machine-c/telemetry",
  qos: 1,
  enabled: true,
  targetMachineId: "machine-c",
  createdAt: "2026-08-21T10:00:00Z",
  updatedAt: "2026-08-21T10:00:00Z",
};

describe("MqttSubscriptionsPanel", () => {
  it("shows saved subscription definitions without claiming broker connectivity", () => {
    render(
      <MqttSubscriptionsPanel
        subscriptions={[subscription]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Subscription definitions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Machine C production feed")).toBeInTheDocument();
    expect(screen.getByText("mqtt.example.internal:8883")).toBeInTheDocument();
    expect(screen.getByText("plant/machine-c/telemetry")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(
      screen.getByText(/does not mean the broker is connected/i),
    ).toBeInTheDocument();
  });

  it("creates a validated subscription definition", async () => {
    const user = userEvent.setup();
    const onCreate = vi
      .fn<(input: MqttSubscriptionInput) => Promise<void>>()
      .mockResolvedValue();
    render(
      <MqttSubscriptionsPanel
        subscriptions={[]}
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add subscription" }));
    await user.type(screen.getByLabelText("Name"), "Machine C lab feed");
    await user.type(screen.getByLabelText("Broker host"), "mqtt.lab.internal");
    await user.clear(screen.getByLabelText("Port"));
    await user.type(screen.getByLabelText("Port"), "1883");
    await user.type(screen.getByLabelText("Topic"), "lab/machine-c/telemetry");
    await user.click(screen.getByRole("button", { name: "Save subscription" }));

    expect(onCreate).toHaveBeenCalledWith({
      name: "Machine C lab feed",
      brokerHost: "mqtt.lab.internal",
      port: 1883,
      topic: "lab/machine-c/telemetry",
      qos: 1,
      enabled: false,
    });
  });

  it("edits and deletes an existing definition", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <MqttSubscriptionsPanel
        subscriptions={[subscription]}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /edit machine c production/i }),
    );
    const topic = screen.getByLabelText("Topic");
    await user.clear(topic);
    await user.type(topic, "plant/machine-c/v2");
    await user.click(screen.getByRole("button", { name: "Save subscription" }));
    expect(onUpdate).toHaveBeenCalledWith(
      "subscription-1",
      expect.objectContaining({ topic: "plant/machine-c/v2", enabled: true }),
    );

    await user.click(
      screen.getByRole("button", { name: /delete machine c production/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Delete subscription" }),
    );
    expect(onDelete).toHaveBeenCalledWith("subscription-1");
  });
});
