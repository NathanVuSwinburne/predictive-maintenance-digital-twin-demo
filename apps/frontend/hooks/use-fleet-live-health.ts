"use client";

import { useCallback } from "react";

import { useDataProvider } from "@/hooks/use-data-provider";
import { usePollingResource } from "@/hooks/use-polling-resource";
import type { FleetLiveHealth } from "@/lib/domain/types";
import type { UserFacingError } from "@/lib/errors/user-facing-error";

export const FLEET_LIVE_HEALTH_POLL_INTERVAL_MS = 5_000;

export type LiveFleetHealth = {
  fleet: FleetLiveHealth | null;
  isLoading: boolean;
  /** Set when the last refresh failed; `fleet` then holds the last-known summary. */
  error: UserFacingError | null;
  lastCheckedAt: Date | null;
};

/**
 * Polls the fleet live summary for the dashboard. Freshness is judged by the
 * server; pass `undefined` as `scope` (for example before sign-in) to stop polling.
 */
export function useFleetLiveHealth(scope: string | undefined): LiveFleetHealth {
  const provider = useDataProvider();
  const loadFleet = useCallback(
    (_key: string, signal: AbortSignal) => provider.getFleetLiveHealth({ signal }),
    [provider],
  );
  const result = usePollingResource({
    key: scope,
    load: loadFleet,
    intervalMs: FLEET_LIVE_HEALTH_POLL_INTERVAL_MS,
    maxRetryDelayMs: 30_000,
    fallbackError: "The last live status is still shown. We’ll try again automatically.",
  });

  return {
    fleet: result.data,
    isLoading: result.isLoading,
    error: result.error,
    lastCheckedAt: result.lastCheckedAt,
  };
}
