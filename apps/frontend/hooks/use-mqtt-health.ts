"use client";

import { useCallback } from "react";

import { useDataProvider } from "@/hooks/use-data-provider";
import { usePollingResource } from "@/hooks/use-polling-resource";
import type { MqttHealth } from "@/lib/domain/types";
import type { UserFacingError } from "@/lib/errors/user-facing-error";

const POLL_INTERVAL_MS = 5_000;
const MQTT_HEALTH_KEY = "mqtt-health";

export type LiveMqttHealth = {
  health: MqttHealth | null;
  isLoading: boolean;
  error: UserFacingError | null;
  lastCheckedAt: Date | null;
};

export function useMqttHealth(): LiveMqttHealth {
  const provider = useDataProvider();
  const loadHealth = useCallback(
    (_key: string, signal: AbortSignal) =>
      provider.getMqttHealth({ signal }),
    [provider],
  );
  const result = usePollingResource({
    key: MQTT_HEALTH_KEY,
    load: loadHealth,
    intervalMs: POLL_INTERVAL_MS,
    fallbackError: "The last health snapshot is still shown. We’ll try again automatically.",
  });

  return {
    health: result.data,
    isLoading: result.isLoading,
    error: result.error,
    lastCheckedAt: result.lastCheckedAt,
  };
}
