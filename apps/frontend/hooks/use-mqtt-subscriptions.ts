"use client";

import { useCallback, useEffect, useState } from "react";

import { useDataProvider } from "@/hooks/use-data-provider";
import type {
  MqttSubscription,
  MqttSubscriptionInput,
} from "@/lib/domain/types";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";

export function useMqttSubscriptions() {
  const provider = useDataProvider();
  const [subscriptions, setSubscriptions] = useState<MqttSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UserFacingError | null>(null);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await provider.listMqttSubscriptions({ signal });
        setSubscriptions(next);
        setError(null);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(toUserFacingError(caught, "data.load", {
          title: "MQTT subscriptions could not be loaded",
          message: "Saved broker subscription settings are unavailable.",
        }));
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [provider],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  async function create(input: MqttSubscriptionInput) {
    await provider.createMqttSubscription(input);
    await refresh();
  }

  async function update(id: string, input: MqttSubscriptionInput) {
    await provider.updateMqttSubscription(id, input);
    await refresh();
  }

  async function remove(id: string) {
    await provider.deleteMqttSubscription(id);
    await refresh();
  }

  return { subscriptions, isLoading, error, create, update, remove };
}
