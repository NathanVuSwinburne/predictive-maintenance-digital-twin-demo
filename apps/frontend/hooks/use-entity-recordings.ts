"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useDataProvider } from "@/hooks/use-data-provider";
import { serverClockOffsetMs } from "@/lib/domain/recordings";
import type { EntityRecording } from "@/lib/domain/types";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";

export const RECORDINGS_POLL_INTERVAL_MS = 5_000;

type State = {
  entityId: string;
  recordings: EntityRecording[];
  clockOffsetMs: number;
};

export type EntityRecordings = {
  recordings: EntityRecording[];
  /** Server minus browser clock, from the latest response. */
  clockOffsetMs: number;
  isLoading: boolean;
  error: UserFacingError | null;
  refresh: () => Promise<void>;
  /** Puts a recording returned by start/stop into the list without waiting for a poll. */
  upsert: (recording: EntityRecording) => void;
};

/**
 * The machine's recordings, polled every five seconds while `enabled` (the machine has
 * an MQTT source) and the tab is visible. A failed refresh keeps the last list.
 */
export function useEntityRecordings(entityId: string, enabled: boolean): EntityRecordings {
  const provider = useDataProvider();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const entityRef = useRef(entityId);
  entityRef.current = entityId;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const requested = entityId;
      try {
        const recordings = await provider.listEntityRecordings(requested, { signal });
        if (entityRef.current !== requested) return;
        const offset = recordings[0] ? serverClockOffsetMs(recordings[0].serverTime, Date.now()) : 0;
        setState({ entityId: requested, recordings, clockOffsetMs: offset });
        setError(null);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (entityRef.current !== requested) return;
        setError(toUserFacingError(caught, "data.refresh", {
          title: "Couldn’t refresh recordings",
          message: "The last known recordings are still shown. We’ll try again automatically.",
        }));
      } finally {
        if (entityRef.current === requested) setIsLoading(false);
      }
    },
    [entityId, provider],
  );

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    const controller = new AbortController();
    void load(controller.signal);
    if (!enabled) return () => controller.abort();
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void load(controller.signal);
    }, RECORDINGS_POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [enabled, load]);

  const upsert = useCallback((recording: EntityRecording) => {
    setState((current) => {
      if (!current || current.entityId !== recording.entityId) {
        return {
          entityId: recording.entityId,
          recordings: [recording],
          clockOffsetMs: serverClockOffsetMs(recording.serverTime, Date.now()),
        };
      }
      const exists = current.recordings.some((item) => item.id === recording.id);
      return {
        ...current,
        clockOffsetMs: serverClockOffsetMs(recording.serverTime, Date.now()),
        recordings: exists
          ? current.recordings.map((item) => (item.id === recording.id ? recording : item))
          : [recording, ...current.recordings],
      };
    });
  }, []);

  const current = state?.entityId === entityId ? state : null;
  return {
    recordings: current?.recordings ?? [],
    clockOffsetMs: current?.clockOffsetMs ?? 0,
    isLoading,
    error,
    refresh: () => load(),
    upsert,
  };
}
