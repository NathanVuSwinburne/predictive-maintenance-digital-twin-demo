import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMqttHealth } from "@/hooks/use-mqtt-health";
import type { DigitalTwinDataProvider } from "@/lib/data/provider";
import { healthyMqttHealth } from "@/test/fixtures/mqtt-health";

const providerState = vi.hoisted(() => ({
  current: null as DigitalTwinDataProvider | null,
}));

vi.mock("@/hooks/use-data-provider", () => ({
  useDataProvider: () => providerState.current,
}));

function providerWithHealth(
  getMqttHealth: DigitalTwinDataProvider["getMqttHealth"],
) {
  return { getMqttHealth } as DigitalTwinDataProvider;
}

describe("useMqttHealth", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    vi.useRealTimers();
  });

  it("loads immediately and refreshes every five seconds", async () => {
    const degraded = { ...healthyMqttHealth, status: "degraded" as const };
    const getMqttHealth = vi
      .fn<DigitalTwinDataProvider["getMqttHealth"]>()
      .mockResolvedValueOnce(healthyMqttHealth)
      .mockResolvedValueOnce(degraded);
    providerState.current = providerWithHealth(getMqttHealth);

    const { result } = renderHook(() => useMqttHealth());
    await act(async () => Promise.resolve());
    expect(result.current.health).toEqual(healthyMqttHealth);

    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(result.current.health).toEqual(degraded);
    expect(getMqttHealth).toHaveBeenCalledTimes(2);
  });

  it("preserves the last snapshot during a transient request failure", async () => {
    const getMqttHealth = vi
      .fn<DigitalTwinDataProvider["getMqttHealth"]>()
      .mockResolvedValueOnce(healthyMqttHealth)
      .mockRejectedValueOnce(new Error("health endpoint unavailable"));
    providerState.current = providerWithHealth(getMqttHealth);

    const { result } = renderHook(() => useMqttHealth());
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(5_000));

    expect(result.current.health).toEqual(healthyMqttHealth);
    expect(result.current.error).toMatchObject({
      title: "Couldn’t refresh information",
      message: "The last health snapshot is still shown. We’ll try again automatically.",
    });
  });

  it("continues retrying every five seconds after consecutive failures", async () => {
    const getMqttHealth = vi
      .fn<DigitalTwinDataProvider["getMqttHealth"]>()
      .mockRejectedValue(new Error("health endpoint unavailable"));
    providerState.current = providerWithHealth(getMqttHealth);

    renderHook(() => useMqttHealth());
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    expect(getMqttHealth).toHaveBeenCalledTimes(3);
  });

  it("pauses refreshes while the admin page is hidden", async () => {
    const getMqttHealth = vi
      .fn<DigitalTwinDataProvider["getMqttHealth"]>()
      .mockResolvedValue(healthyMqttHealth);
    providerState.current = providerWithHealth(getMqttHealth);

    renderHook(() => useMqttHealth());
    await act(async () => Promise.resolve());
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    expect(getMqttHealth).toHaveBeenCalledTimes(1);
  });
});
