import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LIVE_STATUS_POLL_INTERVAL_MS,
  LIVE_STATUS_REQUEST_TIMEOUT_MS,
  NO_SOURCE_POLL_INTERVAL_MS,
  useEntityLiveStatus,
} from "@/hooks/use-entity-live-status";
import type { DigitalTwinDataProvider } from "@/lib/data/provider";
import type { EntityLiveStatus } from "@/lib/domain/types";
import { liveStatusFixture } from "./fixtures/live-status";

const providerState = vi.hoisted(() => ({
  current: null as DigitalTwinDataProvider | null,
}));

vi.mock("@/hooks/use-data-provider", () => ({
  useDataProvider: () => providerState.current,
}));

function providerWithLiveStatus(
  getEntityLiveStatus: DigitalTwinDataProvider["getEntityLiveStatus"],
) {
  return { getEntityLiveStatus } as DigitalTwinDataProvider;
}

describe("useEntityLiveStatus", () => {
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

  it("loads immediately, reports live, and polls every two seconds without overlap", async () => {
    let resolveSecond: ((value: EntityLiveStatus) => void) | undefined;
    const getEntityLiveStatus = vi
      .fn<DigitalTwinDataProvider["getEntityLiveStatus"]>()
      .mockResolvedValueOnce(liveStatusFixture)
      .mockImplementationOnce(
        () =>
          new Promise<EntityLiveStatus>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    providerState.current = providerWithLiveStatus(getEntityLiveStatus);

    const { result } = renderHook(() => useEntityLiveStatus("entity-cmtk"));
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.isLive).toBe(true);
    expect(result.current.connectionState).toBe("connected");
    expect(result.current.status?.entityId).toBe("entity-cmtk");
    expect(getEntityLiveStatus).toHaveBeenCalledWith(
      "entity-cmtk",
      expect.objectContaining({ limit: 60 }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_STATUS_POLL_INTERVAL_MS);
    });
    expect(getEntityLiveStatus).toHaveBeenCalledTimes(2);

    // While a request is in flight (and within its timeout) no second poll starts.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_STATUS_REQUEST_TIMEOUT_MS - 1_000);
    });
    expect(getEntityLiveStatus).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSecond?.(liveStatusFixture);
    });
  });

  it("is not live when the server reports a non-live state even though the poll succeeded", async () => {
    providerState.current = providerWithLiveStatus(
      vi.fn<DigitalTwinDataProvider["getEntityLiveStatus"]>().mockResolvedValue({
        ...liveStatusFixture,
        state: "stale",
      }),
    );

    const { result } = renderHook(() => useEntityLiveStatus("entity-cmtk"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.connectionState).toBe("connected");
    expect(result.current.isLive).toBe(false);
  });

  it("keeps last-known status, stops being live on the first failure, and disconnects after three", async () => {
    const getEntityLiveStatus = vi
      .fn<DigitalTwinDataProvider["getEntityLiveStatus"]>()
      .mockResolvedValueOnce(liveStatusFixture)
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(liveStatusFixture);
    providerState.current = providerWithLiveStatus(getEntityLiveStatus);

    const { result } = renderHook(() => useEntityLiveStatus("entity-cmtk"));
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(LIVE_STATUS_POLL_INTERVAL_MS);
    });
    expect(result.current.consecutiveFailures).toBe(1);
    expect(result.current.connectionState).toBe("reconnecting");
    expect(result.current.isLive).toBe(false);
    expect(result.current.status?.state).toBe("live");
    expect(result.current.error).not.toBeNull();

    // Exponential backoff: 2 s, then 4 s before the third failure.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(result.current.consecutiveFailures).toBe(3);
    expect(result.current.connectionState).toBe("disconnected");
    expect(result.current.isLive).toBe(false);
    expect(result.current.status).toEqual(liveStatusFixture);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    expect(result.current.connectionState).toBe("connected");
    expect(result.current.consecutiveFailures).toBe(0);
    expect(result.current.isLive).toBe(true);
  });

  it("pauses while hidden and polls immediately when visible again", async () => {
    const getEntityLiveStatus = vi
      .fn<DigitalTwinDataProvider["getEntityLiveStatus"]>()
      .mockResolvedValue(liveStatusFixture);
    providerState.current = providerWithLiveStatus(getEntityLiveStatus);

    renderHook(() => useEntityLiveStatus("entity-cmtk"));
    await act(async () => {
      await Promise.resolve();
    });

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getEntityLiveStatus).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(getEntityLiveStatus).toHaveBeenCalledTimes(2);
  });

  it("shows disconnected while the browser is offline", async () => {
    providerState.current = providerWithLiveStatus(
      vi.fn<DigitalTwinDataProvider["getEntityLiveStatus"]>().mockResolvedValue(liveStatusFixture),
    );

    const { result } = renderHook(() => useEntityLiveStatus("entity-cmtk"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.isLive).toBe(true);

    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current.connectionState).toBe("disconnected");
    expect(result.current.isLive).toBe(false);
    expect(result.current.status).toEqual(liveStatusFixture);
  });

  it("never shows a previous entity's status after the selection changes", async () => {
    let resolveOld: ((value: EntityLiveStatus) => void) | undefined;
    const otherStatus: EntityLiveStatus = {
      ...liveStatusFixture,
      entityId: "entity-other",
      entityName: "Other machine",
    };
    const getEntityLiveStatus = vi
      .fn<DigitalTwinDataProvider["getEntityLiveStatus"]>()
      .mockImplementationOnce(
        () =>
          new Promise<EntityLiveStatus>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(otherStatus);
    providerState.current = providerWithLiveStatus(getEntityLiveStatus);

    const { result, rerender } = renderHook(
      ({ entityId }) => useEntityLiveStatus(entityId),
      { initialProps: { entityId: "entity-cmtk" } },
    );
    rerender({ entityId: "entity-other" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status?.entityId).toBe("entity-other");

    await act(async () => {
      resolveOld?.(liveStatusFixture);
    });
    expect(result.current.status?.entityId).toBe("entity-other");
  });

  it("returns an idle result without polling when no entity is selected", () => {
    const getEntityLiveStatus = vi.fn<DigitalTwinDataProvider["getEntityLiveStatus"]>();
    providerState.current = providerWithLiveStatus(getEntityLiveStatus);

    const { result } = renderHook(() => useEntityLiveStatus(undefined));
    expect(result.current.status).toBeNull();
    expect(result.current.isLive).toBe(false);
    expect(getEntityLiveStatus).not.toHaveBeenCalled();
  });
  it("treats a hung request as a failure instead of staying live", async () => {
    const getEntityLiveStatus = vi
      .fn<DigitalTwinDataProvider["getEntityLiveStatus"]>()
      .mockResolvedValueOnce(liveStatusFixture)
      .mockImplementation(() => new Promise<EntityLiveStatus>(() => {}));
    providerState.current = providerWithLiveStatus(getEntityLiveStatus);

    const { result } = renderHook(() => useEntityLiveStatus("entity-cmtk"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.isLive).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_STATUS_POLL_INTERVAL_MS + LIVE_STATUS_REQUEST_TIMEOUT_MS);
    });
    expect(result.current.isLive).toBe(false);
    expect(result.current.connectionState).toBe("reconnecting");
    expect(result.current.status?.entityId).toBe("entity-cmtk");
  });

  it("polls machines without an MQTT source slowly", async () => {
    const getEntityLiveStatus = vi
      .fn<DigitalTwinDataProvider["getEntityLiveStatus"]>()
      .mockResolvedValue({ ...liveStatusFixture, state: "no-source", source: null });
    providerState.current = providerWithLiveStatus(getEntityLiveStatus);

    renderHook(() => useEntityLiveStatus("entity-plain"));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NO_SOURCE_POLL_INTERVAL_MS - 1_000);
    });
    expect(getEntityLiveStatus).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(getEntityLiveStatus).toHaveBeenCalledTimes(2);
  });
});
