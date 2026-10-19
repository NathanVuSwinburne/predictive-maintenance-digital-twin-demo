"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useDataProvider } from "@/hooks/use-data-provider";
import type { InformationProvenance, TelemetryPoint } from "@/lib/domain/types";

export type TelemetryConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type LiveTelemetry = {
  telemetry: TelemetryPoint[];
  latestPoint: TelemetryPoint | null;
  connectionState: TelemetryConnectionState;
  isStale: boolean;
  lastCheckedAt: Date | null;
  consecutiveFailures: number;
  provenance: InformationProvenance | null;
};

const POLL_INTERVAL_MS = 5_000;
const STALE_AFTER_UNCHANGED_POLLS = 3;
const DISCONNECT_AFTER_FAILURES = 3;
const MAX_RETRY_DELAY_MS = 30_000;

function telemetryFingerprint(point: TelemetryPoint | undefined) {
  if (!point) return null;
  return [
    point.timestamp,
    point.temperature,
    point.vibration,
    point.pressure,
    point.power,
  ].join("|");
}

export function useLiveTelemetry(machineId: string | undefined): LiveTelemetry {
  const provider = useDataProvider();
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const [loadedMachineId, setLoadedMachineId] = useState<string | null>(null);
  const [statusMachineId, setStatusMachineId] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<TelemetryConnectionState>("connecting");
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [provenance, setProvenance] = useState<InformationProvenance | null>(null);
  const fingerprintRef = useRef<string | null>(null);
  const unchangedPollsRef = useRef(0);
  const failuresRef = useRef(0);

  useEffect(() => {
    if (!machineId) {
      return;
    }
    const activeMachineId = machineId;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const controller = new AbortController();

    fingerprintRef.current = null;
    unchangedPollsRef.current = 0;
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
      try {
        const series = await provider.getMachineTelemetry(activeMachineId, {
          limit: 50,
          signal: controller.signal,
        });
        const points = series.points;
        if (!active) return;
        const fingerprint = telemetryFingerprint(points.at(-1));
        if (fingerprint && fingerprint === fingerprintRef.current) {
          unchangedPollsRef.current += 1;
        } else {
          fingerprintRef.current = fingerprint;
          unchangedPollsRef.current = 0;
        }
        setTelemetry(points);
        setProvenance(series.provenance ?? null);
        setLoadedMachineId(activeMachineId);
        setStatusMachineId(activeMachineId);
        setLastCheckedAt(new Date());
        setConnectionState("connected");
        failuresRef.current = 0;
        setConsecutiveFailures(0);
        setIsStale(
          points.length === 0 ||
            unchangedPollsRef.current >= STALE_AFTER_UNCHANGED_POLLS,
        );
        inFlight = false;
        schedulePoll(POLL_INTERVAL_MS);
      } catch (error) {
        inFlight = false;
        if (
          !active ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        failuresRef.current += 1;
        const failures = failuresRef.current;
        setStatusMachineId(activeMachineId);
        setConsecutiveFailures(failures);
        setConnectionState(
          failures >= DISCONNECT_AFTER_FAILURES
            ? "disconnected"
            : "reconnecting",
        );
        if (failures >= DISCONNECT_AFTER_FAILURES) setIsStale(true);
        const retryDelay = Math.min(
          POLL_INTERVAL_MS * 2 ** Math.max(0, failures - 1),
          MAX_RETRY_DELAY_MS,
        );
        schedulePoll(retryDelay);
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
      setStatusMachineId(activeMachineId);
      setConnectionState("disconnected");
      setIsStale(true);
    }

    function handleOnline() {
      if (document.visibilityState === "hidden") return;
      setConnectionState(
        fingerprintRef.current ? "reconnecting" : "connecting",
      );
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
  }, [machineId, provider]);

  const visibleTelemetry = useMemo(
    () => (loadedMachineId === machineId ? telemetry : []),
    [loadedMachineId, machineId, telemetry],
  );
  const hasCurrentStatus = statusMachineId === machineId;
  const latestPoint = visibleTelemetry.at(-1) ?? null;

  return {
    telemetry: visibleTelemetry,
    latestPoint,
    connectionState: hasCurrentStatus ? connectionState : "connecting",
    isStale: hasCurrentStatus ? isStale : false,
    lastCheckedAt: loadedMachineId === machineId ? lastCheckedAt : null,
    consecutiveFailures: hasCurrentStatus ? consecutiveFailures : 0,
    provenance: loadedMachineId === machineId ? provenance : null,
  };
}
