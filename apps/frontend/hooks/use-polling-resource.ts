"use client";

import { useEffect, useState } from "react";
import { toUserFacingError, type ErrorOperation, type UserFacingError } from "@/lib/errors/user-facing-error";

type PollingResourceOptions<Key extends string, Value> = {
  key: Key | undefined;
  load: (key: Key, signal: AbortSignal) => Promise<Value>;
  intervalMs: number;
  maxRetryDelayMs?: number;
  fallbackError: string;
  errorOperation?: ErrorOperation;
};

type KeyedValue<Key, Value> = {
  key: Key;
  value: Value;
};

export type PollingResource<Value> = {
  data: Value | null;
  isLoading: boolean;
  error: UserFacingError | null;
  lastCheckedAt: Date | null;
};

export function usePollingResource<Key extends string, Value>({
  key,
  load,
  intervalMs,
  maxRetryDelayMs,
  fallbackError,
  errorOperation = "data.refresh",
}: PollingResourceOptions<Key, Value>): PollingResource<Value> {
  const [result, setResult] = useState<KeyedValue<Key, Value> | null>(null);
  const [settledKey, setSettledKey] = useState<Key | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<KeyedValue<Key, UserFacingError> | null>(null);
  const [lastChecked, setLastChecked] = useState<KeyedValue<Key, Date> | null>(
    null,
  );

  useEffect(() => {
    if (key === undefined) return;
    const activeKey = key;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let failures = 0;
    const controller = new AbortController();

    function clearTimer() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    }

    function schedule(delay: number) {
      clearTimer();
      if (active && document.visibilityState !== "hidden") {
        timer = setTimeout(() => void poll(), delay);
      }
    }

    async function poll(ignoreVisibility = false) {
      if (
        inFlight ||
        (!ignoreVisibility && document.visibilityState === "hidden")
      ) {
        return;
      }
      inFlight = true;
      try {
        const value = await load(activeKey, controller.signal);
        if (!active) return;
        failures = 0;
        setResult({ key: activeKey, value });
        setSettledKey(activeKey);
        setError(null);
        setLastChecked({ key: activeKey, value: new Date() });
        setIsLoading(false);
        inFlight = false;
        schedule(intervalMs);
      } catch (caught) {
        inFlight = false;
        if (
          !active ||
          (caught instanceof DOMException && caught.name === "AbortError")
        ) {
          return;
        }
        failures += 1;
        setError({
          key: activeKey,
          value: toUserFacingError(caught, errorOperation, { message: fallbackError }),
        });
        setSettledKey(activeKey);
        setIsLoading(false);
        const retryDelay = maxRetryDelayMs
          ? Math.min(
              intervalMs * 2 ** Math.max(0, failures - 1),
              maxRetryDelayMs,
            )
          : intervalMs;
        schedule(retryDelay);
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") clearTimer();
      else void poll();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void poll(true);

    return () => {
      active = false;
      clearTimer();
      controller.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [errorOperation, fallbackError, intervalMs, key, load, maxRetryDelayMs]);

  if (key === undefined) {
    return { data: null, isLoading: false, error: null, lastCheckedAt: null };
  }

  return {
    data: result?.key === key ? result.value : null,
    isLoading: settledKey !== key || isLoading,
    error: error?.key === key ? error.value : null,
    lastCheckedAt: lastChecked?.key === key ? lastChecked.value : null,
  };
}
