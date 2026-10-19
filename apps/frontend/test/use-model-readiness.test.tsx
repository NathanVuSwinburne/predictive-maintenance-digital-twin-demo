import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useModelReadiness } from "@/hooks/use-model-readiness";
import type { DigitalTwinDataProvider } from "@/lib/data/provider";
import type { ModelReadiness } from "@/lib/domain/types";

const providerState = vi.hoisted(() => ({
  current: null as DigitalTwinDataProvider | null,
}));

vi.mock("@/hooks/use-data-provider", () => ({
  useDataProvider: () => providerState.current,
}));

const collectingReadiness: ModelReadiness = {
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
  sensors: [],
  checks: null,
};

function providerWithReadiness(
  getModelReadiness: DigitalTwinDataProvider["getModelReadiness"],
) {
  return { getModelReadiness } as DigitalTwinDataProvider;
}

describe("useModelReadiness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    vi.useRealTimers();
  });

  it("loads immediately and refreshes readiness every five seconds", async () => {
    const ready = {
      ...collectingReadiness,
      state: "ready" as const,
      canInfer: true,
      summary: "Ready for inference",
    };
    const getModelReadiness = vi
      .fn<DigitalTwinDataProvider["getModelReadiness"]>()
      .mockResolvedValueOnce(collectingReadiness)
      .mockResolvedValueOnce(ready);
    providerState.current = providerWithReadiness(getModelReadiness);

    const { result } = renderHook(() => useModelReadiness("machine-c"));
    await act(async () => Promise.resolve());
    expect(result.current.readiness).toEqual(collectingReadiness);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.readiness).toEqual(ready);
    expect(getModelReadiness).toHaveBeenCalledTimes(2);
  });

  it("performs the initial evaluation when mounted hidden but pauses refreshes", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    const getModelReadiness = vi
      .fn<DigitalTwinDataProvider["getModelReadiness"]>()
      .mockResolvedValue(collectingReadiness);
    providerState.current = providerWithReadiness(getModelReadiness);

    const { result } = renderHook(() => useModelReadiness("machine-c"));
    await act(async () => Promise.resolve());
    expect(result.current.readiness).toEqual(collectingReadiness);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getModelReadiness).toHaveBeenCalledTimes(1);
  });

  it("keeps the last result during retries and clears the error after recovery", async () => {
    const getModelReadiness = vi
      .fn<DigitalTwinDataProvider["getModelReadiness"]>()
      .mockResolvedValueOnce(collectingReadiness)
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(collectingReadiness);
    providerState.current = providerWithReadiness(getModelReadiness);

    const { result } = renderHook(() => useModelReadiness("machine-c"));
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.readiness).toEqual(collectingReadiness);
    expect(result.current.error).toMatchObject({
      title: "Couldn’t refresh information",
      message: "The last readiness result is still shown. We’ll try again automatically.",
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.error).toBeNull();
  });

  it("ignores an obsolete response after the selected machine changes", async () => {
    let resolveOld: ((value: ModelReadiness) => void) | undefined;
    const machineA = {
      ...collectingReadiness,
      machineId: "machine-a",
      profileId: null,
      state: "prediction-unavailable" as const,
      summary: "Automatic prediction unavailable",
    };
    const getModelReadiness = vi
      .fn<DigitalTwinDataProvider["getModelReadiness"]>()
      .mockImplementationOnce(
        () =>
          new Promise<ModelReadiness>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(machineA);
    providerState.current = providerWithReadiness(getModelReadiness);

    const { result, rerender } = renderHook(
      ({ machineId }) => useModelReadiness(machineId),
      { initialProps: { machineId: "machine-c" } },
    );
    rerender({ machineId: "machine-a" });
    await act(async () => Promise.resolve());
    expect(result.current.readiness?.machineId).toBe("machine-a");

    await act(async () => resolveOld?.(collectingReadiness));
    expect(result.current.readiness?.machineId).toBe("machine-a");
  });
});
