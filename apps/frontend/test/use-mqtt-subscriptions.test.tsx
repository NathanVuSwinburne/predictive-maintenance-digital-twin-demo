import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useMqttSubscriptions } from "@/hooks/use-mqtt-subscriptions";
import type { DigitalTwinDataProvider } from "@/lib/data/provider";
import type { MqttSubscription } from "@/lib/domain/types";

const providerState = vi.hoisted(() => ({
  current: null as DigitalTwinDataProvider | null,
}));

vi.mock("@/hooks/use-data-provider", () => ({
  useDataProvider: () => providerState.current,
}));

const subscription: MqttSubscription = {
  id: "subscription-1",
  name: "Machine C feed",
  brokerHost: "mqtt.internal",
  port: 8883,
  topic: "machine-c/telemetry",
  qos: 1,
  enabled: true,
  targetMachineId: "machine-c",
  createdAt: "2026-08-21T10:00:00Z",
  updatedAt: "2026-08-21T10:00:00Z",
};

describe("useMqttSubscriptions", () => {
  it("loads definitions and refreshes after a create", async () => {
    const listMqttSubscriptions = vi
      .fn<DigitalTwinDataProvider["listMqttSubscriptions"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([subscription]);
    const createMqttSubscription = vi
      .fn<DigitalTwinDataProvider["createMqttSubscription"]>()
      .mockResolvedValue(subscription);
    providerState.current = {
      listMqttSubscriptions,
      createMqttSubscription,
    } as unknown as DigitalTwinDataProvider;

    const { result } = renderHook(() => useMqttSubscriptions());
    await act(async () => Promise.resolve());
    expect(result.current.subscriptions).toEqual([]);

    await act(async () => {
      await result.current.create({
        name: subscription.name,
        brokerHost: subscription.brokerHost,
        port: subscription.port,
        topic: subscription.topic,
        qos: subscription.qos,
        enabled: subscription.enabled,
      });
    });

    expect(createMqttSubscription).toHaveBeenCalledOnce();
    expect(listMqttSubscriptions).toHaveBeenCalledTimes(2);
    expect(result.current.subscriptions).toEqual([subscription]);
  });

  it("reports load failures without discarding the current list", async () => {
    providerState.current = {
      listMqttSubscriptions: vi
        .fn<DigitalTwinDataProvider["listMqttSubscriptions"]>()
        .mockRejectedValue(new Error("subscription endpoint unavailable")),
    } as unknown as DigitalTwinDataProvider;

    const { result } = renderHook(() => useMqttSubscriptions());
    await act(async () => Promise.resolve());

    expect(result.current.subscriptions).toEqual([]);
    expect(result.current.error).toMatchObject({
      title: "MQTT subscriptions could not be loaded",
    });
  });
});
