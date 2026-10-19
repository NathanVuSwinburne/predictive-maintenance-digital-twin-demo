"use client";

import { useCallback } from "react";

import { useDataProvider } from "@/hooks/use-data-provider";
import { usePollingResource } from "@/hooks/use-polling-resource";
import type { ModelReadiness } from "@/lib/domain/types";
import type { UserFacingError } from "@/lib/errors/user-facing-error";

const POLL_INTERVAL_MS = 5_000;
const MAX_RETRY_DELAY_MS = 30_000;

export type LiveModelReadiness = {
  readiness: ModelReadiness | null;
  isLoading: boolean;
  error: UserFacingError | null;
  lastCheckedAt: Date | null;
};

export function useModelReadiness(
  machineId: string | undefined,
): LiveModelReadiness {
  const provider = useDataProvider();
  const loadReadiness = useCallback(
    (activeMachineId: string, signal: AbortSignal) =>
      provider.getModelReadiness(activeMachineId, { signal }),
    [provider],
  );
  const result = usePollingResource({
    key: machineId,
    load: loadReadiness,
    intervalMs: POLL_INTERVAL_MS,
    maxRetryDelayMs: MAX_RETRY_DELAY_MS,
    fallbackError: "The last readiness result is still shown. We’ll try again automatically.",
  });

  return {
    readiness: result.data,
    isLoading: result.isLoading,
    error: result.error,
    lastCheckedAt: result.lastCheckedAt,
  };
}
