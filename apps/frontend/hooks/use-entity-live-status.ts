"use client";

import { useEffect, useRef, useState } from "react";

import { useDataProvider } from "@/hooks/use-data-provider";
import type { TelemetryConnectionState } from "@/hooks/use-live-telemetry";
import type { EntityLiveStatus } from "@/lib/domain/types";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";

export type EntityLiveStatusResult = {
  status: EntityLiveStatus | null;
  isLoading: boolean;
  error: UserFacingError | null;
  lastCheckedAt: Date | null;
  consecutiveFailures: number;
  /** Browser-to-server transport state; independent of the machine's own MQTT state. */
  connectionState: TelemetryConnectionState;
  /** True only when the server reports `live` AND the most recent poll succeeded. */
  isLive: boolean;
};

export const LIVE_STATUS_POLL_INTERVAL_MS = 2_000;
/** A poll slower than this counts as a failure, so a hung backend can never keep "Live" on screen. */
export const LIVE_STATUS_REQUEST_TIMEOUT_MS = 8_000;
/** Machines without an MQTT source are re-checked slowly in case one is added. */
export const NO_SOURCE_POLL_INTERVAL_MS = 15_000;
export const LIVE_STATUS_OBSERVATION_LIMIT = 60;
const DISCONNECT_AFTER_FAILURES = 3;
const MAX_RETRY_DELAY_MS = 10_000;

/**
 * Polls the backend-owned live status for one entity. Freshness itself is judged
 * by the server; this hook only adds transport health so a dead backend can never
 * leave the UI looking live.
 */
export type EntityLiveStatusOptions = {
  /** Observations to request per poll (server caps at 300); defaults to `LIVE_STATUS_OBSERVATION_LIMIT`. */
  limit?: number;
};

export function useEntityLiveStatus(
  entityId: string | undefined,
  options?: EntityLiveStatusOptions,
): EntityLiveStatusResult {
  const provider = useDataProvider();
  const observationLimit = options?.limit ?? LIVE_STATUS_OBSERVATION_LIMIT;
  const [status, setStatus] = useState<EntityLiveStatus | null>(null);
  const [loadedEntityId, setLoadedEntityId] = useState<string | null>(null);
  const [statusEntityId, setStatusEntityId] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<TelemetryConnectionState>("connecting");
  const [error, setError] = useState<UserFacingError | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const failuresRef = useRef(0);

  useEffect(() => {
    if (!entityId) return;
    const activeEntityId = entityId;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const controller = new AbortController();

    failuresRef.current = 0;

    function clearPollTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    }

    function schedulePoll(delay: number) {
      clearPollTimer();
      if (
        active &&
        document.visibilityState !== "hidden" &&
        navigator.onLine !== false
      ) {
        timer = setTimeout(() => void poll(), delay);
      }
    }

    async function poll() {
      if (
        inFlight ||
        document.visibilityState === "hidden" ||
        navigator.onLine === false
      ) {
        return;
      }
      inFlight = true;
      const request = new AbortController();
      const forwardAbort = () => request.abort();
      controller.signal.addEventListener("abort", forwardAbort);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      // Raced rather than trusting the signal alone, so a request that ignores
      // abort still cannot hold the panel on its last "Live" payload.
      const timedOut = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const reason = new DOMException("The live status request timed out.", "TimeoutError");
          request.abort(reason);
          reject(reason);
        }, LIVE_STATUS_REQUEST_TIMEOUT_MS);
      });
      try {
        const next = await Promise.race([
          provider.getEntityLiveStatus(activeEntityId, {
            limit: observationLimit,
            signal: request.signal,
          }),
          timedOut,
        ]);
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", forwardAbort);
        if (!active) return;
        setStatus(next);
        setLoadedEntityId(activeEntityId);
        setStatusEntityId(activeEntityId);
        setLastCheckedAt(new Date());
        setConnectionState("connected");
        setError(null);
        failuresRef.current = 0;
        setConsecutiveFailures(0);
        inFlight = false;
        schedulePoll(next.state === "no-source" ? NO_SOURCE_POLL_INTERVAL_MS : LIVE_STATUS_POLL_INTERVAL_MS);
      } catch (caught) {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", forwardAbort);
        inFlight = false;
        // Only an unmount/entity change is silent; a timeout is a real failure.
        if (!active || controller.signal.aborted) {
          return;
        }
        failuresRef.current += 1;
        const failures = failuresRef.current;
        setStatusEntityId(activeEntityId);
        setConsecutiveFailures(failures);
        setConnectionState(
          failures >= DISCONNECT_AFTER_FAILURES ? "disconnected" : "reconnecting",
        );
        setError(
          toUserFacingError(caught, "data.refresh", {
            message: "The last-known live values are still shown. We’ll try again automatically.",
          }),
        );
        schedulePoll(
          Math.min(
            LIVE_STATUS_POLL_INTERVAL_MS * 2 ** Math.max(0, failures - 1),
            MAX_RETRY_DELAY_MS,
          ),
        );
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        clearPollTimer();
      } else if (navigator.onLine !== false) {
        void poll();
      }
    }

    function handleOffline() {
      clearPollTimer();
      setStatusEntityId(activeEntityId);
      setConnectionState("disconnected");
    }

    function handleOnline() {
      if (document.visibilityState === "hidden") return;
      setConnectionState("reconnecting");
      void poll();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    if (navigator.onLine === false) {
      timer = setTimeout(handleOffline, 0);
    } else void poll();

    return () => {
      active = false;
      clearPollTimer();
      controller.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [entityId, observationLimit, provider]);

  const hasCurrentData = loadedEntityId === entityId;
  const hasCurrentStatus = statusEntityId === entityId;
  const currentStatus = hasCurrentData ? status : null;
  const currentConnection: TelemetryConnectionState = hasCurrentStatus
    ? connectionState
    : "connecting";

  return {
    status: currentStatus,
    isLoading: !hasCurrentStatus,
    error: hasCurrentStatus ? error : null,
    lastCheckedAt: hasCurrentData ? lastCheckedAt : null,
    consecutiveFailures: hasCurrentStatus ? consecutiveFailures : 0,
    connectionState: currentConnection,
    isLive: currentStatus?.state === "live" && currentConnection === "connected",
  };
}
