import { describe, expect, it } from "vitest";

import {
  FORECAST_BAND,
  HISTORY_BAND,
  buildHorizonSeries,
  horizonUnavailableCopy,
  minutesForX,
  outlookDirection,
  outlookSentence,
} from "@/lib/domain/live-horizon";
import type { EntityLiveHorizon, EntityLiveObservation } from "@/lib/domain/types";

const base = Date.parse("2026-10-06T10:00:00.000Z");

function observation(secondsAgo: number, temperature: number): EntityLiveObservation {
  const iso = new Date(base - secondsAgo * 1000).toISOString();
  return { timestamp: iso, sessionId: "s", values: { Temperature: temperature, Mode: "low" }, receivedAt: iso };
}

const observations = [observation(120, 24.0), observation(60, 24.1), observation(0, 24.2)];

const horizon: EntityLiveHorizon = {
  status: "ok",
  message: null,
  attemptedAt: new Date(base).toISOString(),
  basedOnTimestamp: new Date(base).toISOString(),
  horizonMinutes: 60,
  cadenceSeconds: 900,
  points: [15, 30, 45, 60].map((minutes) => ({
    timestamp: new Date(base + minutes * 60_000).toISOString(),
    values: { Temperature: 24.2 + minutes * 0.2 },
  })),
  modelName: "sim",
  modelVersion: "1",
};

describe("buildHorizonSeries", () => {
  it("splits measured history from the forecast and joins them at the last reading", () => {
    const series = buildHorizonSeries("Temperature", observations, horizon);

    expect(series.historyMinutes).toBe(2);
    expect(series.horizonMinutes).toBe(60);
    const history = series.rows.filter((row) => typeof row.actual === "number");
    const forecast = series.rows.filter((row) => typeof row.forecast === "number");
    expect(history).toHaveLength(3);
    // The last measured reading is the shared "Now" point so both lines meet.
    expect(history.at(-1)).toMatchObject({ x: 0, minutes: 0, actual: 24.2, forecast: 24.2 });
    expect(forecast).toHaveLength(5);
    // History is scaled into its own band; forecast is proportional to minutes ahead.
    expect(history[0]).toMatchObject({ x: -HISTORY_BAND, minutes: -2 });
    expect(history[1]).toMatchObject({ x: -HISTORY_BAND / 2, minutes: -1 });
    expect(forecast.at(-1)).toMatchObject({ x: FORECAST_BAND, minutes: 60, forecast: 36.2 });
    expect(forecast[1]).toMatchObject({ x: FORECAST_BAND / 4, minutes: 15 });
    expect(minutesForX(FORECAST_BAND / 2, series.historyMinutes, 60)).toBe(30);
    expect(minutesForX(-HISTORY_BAND, series.historyMinutes, 60)).toBe(-2);
  });

  it("summarises the outlook with +15/+30/+60 values and a direction", () => {
    const { summary } = buildHorizonSeries("Temperature", observations, horizon);
    expect(summary).toEqual({
      current: 24.2,
      end: 36.2,
      plus15: 27.2,
      plus30: 30.2,
      plus60: 36.2,
      direction: "rise",
    });
    expect(outlookSentence(summary!, "°C")).toBe("Expected to rise from 24.2 °C to 36.2 °C over the next hour");
  });

  it("draws only measured history when the outlook is not ok", () => {
    const series = buildHorizonSeries("Temperature", observations, { ...horizon, status: "waiting", points: [] });
    expect(series.rows.every((row) => row.forecast === undefined)).toBe(true);
    expect(series.summary).toBeNull();
    expect(buildHorizonSeries("Temperature", observations, null).summary).toBeNull();
  });

  it("ignores non-numeric and unknown features", () => {
    expect(buildHorizonSeries("Mode", observations, horizon).rows).toEqual([]);
    expect(buildHorizonSeries("Pressure", observations, horizon).rows).toEqual([]);
  });

  it("treats small relative changes as steady", () => {
    expect(outlookDirection(24.0, 24.3)).toBe("steady");
    expect(outlookDirection(24.0, 20.0)).toBe("fall");
    expect(outlookSentence({ current: 24, end: 24.3, plus15: null, plus30: null, plus60: null, direction: "steady" }, "°C"))
      .toBe("Expected to stay around 24 °C over the next hour");
  });
});

describe("horizonUnavailableCopy", () => {
  it("never echoes raw error text and explains waiting states", () => {
    expect(horizonUnavailableCopy({ ...horizon, status: "ok" })).toBeNull();
    expect(horizonUnavailableCopy({ ...horizon, status: "error", message: "Traceback: KeyError" })?.message)
      .not.toMatch(/Traceback|KeyError/);
    expect(horizonUnavailableCopy({ ...horizon, status: "waiting", message: null })?.title).toBe("Waiting for enough readings");
    expect(horizonUnavailableCopy(null)?.title).toMatch(/isn't available yet/);
  });
});
