import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLiveTelemetry } from "@/hooks/use-live-telemetry";
import type { DigitalTwinDataProvider } from "@/lib/data/provider";
import type { TelemetryPoint, TelemetrySeries } from "@/lib/domain/types";

const providerState = vi.hoisted(() => ({
  current: null as DigitalTwinDataProvider | null,
}));

vi.mock("@/hooks/use-data-provider", () => ({
  useDataProvider: () => providerState.current,
}));

const firstPoint: TelemetryPoint = {
  timestamp: "2026-08-12T10:00:00.000Z",
  temperature: 64,
  vibration: 0.42,
  pressure: 31,
  power: 12,
};

const series = (points: TelemetryPoint[]): TelemetrySeries => ({ points });

function providerWithTelemetry(
  getMachineTelemetry: DigitalTwinDataProvider["getMachineTelemetry"],
) {
  return { getMachineTelemetry } as DigitalTwinDataProvider;
}

describe("useLiveTelemetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    vi.useRealTimers();
  });

  it("loads immediately and performs the next non-overlapping poll after five seconds", async () => {
    let resolveSecond: ((value: TelemetrySeries) => void) | undefined;
    const getMachineTelemetry = vi
      .fn<DigitalTwinDataProvider["getMachineTelemetry"]>()
      .mockResolvedValueOnce(series([firstPoint]))
      .mockImplementationOnce(
        () =>
          new Promise<TelemetrySeries>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const provider = providerWithTelemetry(getMachineTelemetry);
    providerState.current = provider;

    const { result } = renderHook(() => useLiveTelemetry("machine-c"));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.connectionState).toBe("connected");
    expect(result.current.latestPoint).toEqual(firstPoint);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(getMachineTelemetry).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(getMachineTelemetry).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSecond?.(series([firstPoint]));
    });
  });

  it("marks unchanged telemetry stale after three polls and clears stale on a new sample", async () => {
    const nextPoint = {
      ...firstPoint,
      timestamp: "2026-08-12T10:00:05.000Z",
      temperature: 65,
    };
    const getMachineTelemetry = vi
      .fn<DigitalTwinDataProvider["getMachineTelemetry"]>()
      .mockResolvedValueOnce(series([firstPoint]))
      .mockResolvedValueOnce(series([firstPoint]))
      .mockResolvedValueOnce(series([firstPoint]))
      .mockResolvedValueOnce(series([firstPoint]))
      .mockResolvedValueOnce(series([firstPoint, nextPoint]));
    providerState.current = providerWithTelemetry(getMachineTelemetry);

    const { result } = renderHook(() => useLiveTelemetry("machine-c"));
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(result.current.isStale).toBe(true);
    expect(result.current.latestPoint).toEqual(firstPoint);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.isStale).toBe(false);
    expect(result.current.latestPoint).toEqual(nextPoint);
  });

  it("retains readings, backs off failures, disconnects after three, and recovers", async () => {
    const recoveredPoint = {
      ...firstPoint,
      timestamp: "2026-08-12T10:00:05.000Z",
    };
    const getMachineTelemetry = vi
      .fn<DigitalTwinDataProvider["getMachineTelemetry"]>()
      .mockResolvedValueOnce(series([firstPoint]))
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(series([firstPoint, recoveredPoint]));
    providerState.current = providerWithTelemetry(getMachineTelemetry);

    const { result } = renderHook(() => useLiveTelemetry("machine-c"));
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.connectionState).toBe("reconnecting");
    expect(result.current.consecutiveFailures).toBe(1);
    expect(result.current.latestPoint).toEqual(firstPoint);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(getMachineTelemetry).toHaveBeenCalledTimes(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.connectionState).toBe("disconnected");
    expect(result.current.consecutiveFailures).toBe(3);
    expect(result.current.isStale).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(result.current.connectionState).toBe("connected");
    expect(result.current.consecutiveFailures).toBe(0);
    expect(result.current.latestPoint).toEqual(recoveredPoint);
    expect(result.current.isStale).toBe(false);
  });

  it("pauses while hidden and polls immediately when the page becomes visible", async () => {
    const getMachineTelemetry = vi
      .fn<DigitalTwinDataProvider["getMachineTelemetry"]>()
      .mockResolvedValue(series([firstPoint]));
    providerState.current = providerWithTelemetry(getMachineTelemetry);

    renderHook(() => useLiveTelemetry("machine-c"));
    await act(async () => {
      await Promise.resolve();
    });

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(getMachineTelemetry).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(getMachineTelemetry).toHaveBeenCalledTimes(2);
  });

  it("shows disconnected offline and retries immediately when the browser reconnects", async () => {
    const recoveredPoint = {
      ...firstPoint,
      timestamp: "2026-08-12T10:00:05.000Z",
    };
    const getMachineTelemetry = vi
      .fn<DigitalTwinDataProvider["getMachineTelemetry"]>()
      .mockResolvedValueOnce(series([firstPoint]))
      .mockResolvedValueOnce(series([firstPoint, recoveredPoint]));
    providerState.current = providerWithTelemetry(getMachineTelemetry);

    const { result } = renderHook(() => useLiveTelemetry("machine-c"));
    await act(async () => {
      await Promise.resolve();
    });

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current.connectionState).toBe("disconnected");
    expect(result.current.isStale).toBe(true);

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    expect(result.current.connectionState).toBe("connected");
    expect(result.current.latestPoint).toEqual(recoveredPoint);
  });

  it("ignores an obsolete response after the selected machine changes", async () => {
    let resolveOld: ((value: TelemetrySeries) => void) | undefined;
    const machineBPoint = {
      ...firstPoint,
      timestamp: "2026-08-12T11:00:00.000Z",
      temperature: 72,
    };
    const getMachineTelemetry = vi
      .fn<DigitalTwinDataProvider["getMachineTelemetry"]>()
      .mockImplementationOnce(
        () =>
          new Promise<TelemetrySeries>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(series([machineBPoint]));
    providerState.current = providerWithTelemetry(getMachineTelemetry);

    const { result, rerender } = renderHook(
      ({ machineId }) => useLiveTelemetry(machineId),
      { initialProps: { machineId: "machine-c" } },
    );
    rerender({ machineId: "machine-b" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.latestPoint).toEqual(machineBPoint);

    await act(async () => {
      resolveOld?.(series([firstPoint]));
    });
    expect(result.current.latestPoint).toEqual(machineBPoint);
  });
});
