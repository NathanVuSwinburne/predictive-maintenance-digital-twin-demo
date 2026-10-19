import type { EntityLiveHorizon, EntityLiveObservation } from "@/lib/domain/types"

/**
 * Chart geometry for the one-hour outlook. A few minutes of measured history and
 * sixty minutes of forecast cannot share one linear time axis and stay readable,
 * so the chart uses two bands on a single numeric axis: measured history fills
 * x ∈ [-HISTORY_BAND, 0] (scaled to however long the history really is), and the
 * forecast fills x ∈ [0, FORECAST_BAND] (one unit per 60/FORECAST_BAND minutes).
 * Every row keeps its true timestamp and relative minutes for tooltips and ticks.
 */
export const HISTORY_BAND = 20
export const FORECAST_BAND = 80
export const HORIZON_MINUTES_DEFAULT = 60

export type HorizonRow = {
  /** Chart x position (see band geometry above). */
  x: number
  /** True minutes relative to the last measured reading (negative = past). */
  minutes: number
  timestamp: string
  actual?: number
  forecast?: number
}

export type HorizonSummary = {
  /** Last measured value the outlook continues from. */
  current: number
  /** Forecast at the end of the horizon. */
  end: number
  plus15: number | null
  plus30: number | null
  plus60: number | null
  direction: "rise" | "fall" | "steady"
}

export type HorizonSeries = {
  rows: HorizonRow[]
  /** Length of the measured history that the left band represents, in minutes. */
  historyMinutes: number
  horizonMinutes: number
  summary: HorizonSummary | null
}

function toMs(iso: string | null | undefined) {
  if (!iso) return null
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? null : ms
}

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Forecast x position for `minutes` ahead. */
export function forecastX(minutes: number, horizonMinutes: number) {
  return (minutes / horizonMinutes) * FORECAST_BAND
}

/** Minutes ahead represented by forecast x position. */
export function minutesForX(x: number, historyMinutes: number, horizonMinutes: number) {
  if (x >= 0) return (x / FORECAST_BAND) * horizonMinutes
  return (x / HISTORY_BAND) * historyMinutes
}

/** The forecast value closest to `minutesAhead` without going past it (null when none). */
function valueAtOrBefore(points: HorizonRow[], minutesAhead: number) {
  let best: HorizonRow | null = null
  for (const point of points) {
    if (point.minutes <= minutesAhead + 1e-6 && typeof point.forecast === "number") best = point
  }
  return best?.forecast ?? null
}

export function outlookDirection(current: number, end: number): HorizonSummary["direction"] {
  const change = end - current
  const scale = Math.max(Math.abs(current), Math.abs(end), 1e-9)
  // Under 2% of the signal's own level is "about the same" for an operator.
  if (Math.abs(change) / scale < 0.02) return "steady"
  return change > 0 ? "rise" : "fall"
}

/**
 * Builds one feature's rows: measured readings (solid) joined at the last reading
 * to the next-hour forecast (dashed). Returns no summary when the outlook is absent.
 */
export function buildHorizonSeries(
  feature: string,
  observations: EntityLiveObservation[],
  horizon: EntityLiveHorizon | null | undefined,
): HorizonSeries {
  const horizonMinutes = horizon?.horizonMinutes ?? HORIZON_MINUTES_DEFAULT
  const measured = observations.flatMap((observation) => {
    const value = observation.values[feature]
    const t = toMs(observation.timestamp)
    return typeof value === "number" && t !== null ? [{ t, timestamp: observation.timestamp, value }] : []
  })
  if (measured.length === 0) {
    return { rows: [], historyMinutes: 0, horizonMinutes, summary: null }
  }

  const last = measured[measured.length - 1]
  const anchorMs = toMs(horizon?.basedOnTimestamp) ?? last.t
  const firstMs = measured[0].t
  const historyMinutes = Math.max((last.t - firstMs) / 60_000, 1 / 60)

  const historyRows: HorizonRow[] = measured.map((point) => {
    const minutes = (point.t - last.t) / 60_000
    const x = historyMinutes > 0 ? (minutes / historyMinutes) * HISTORY_BAND : 0
    return { x: round(x, 4), minutes: round(minutes, 4), timestamp: point.timestamp, actual: point.value }
  })
  // The last measured reading is the shared "Now" point so both lines meet.
  historyRows[historyRows.length - 1] = { ...historyRows[historyRows.length - 1], x: 0, minutes: 0 }

  const forecastPoints: HorizonRow[] =
    horizon?.status === "ok"
      ? horizon.points.flatMap((point) => {
          const value = point.values[feature]
          const t = toMs(point.timestamp)
          if (typeof value !== "number" || t === null) return []
          const minutes = (t - anchorMs) / 60_000
          if (minutes <= 0) return []
          return [{
            x: round(forecastX(minutes, horizonMinutes), 4),
            minutes: round(minutes, 4),
            timestamp: point.timestamp,
            forecast: value,
          }]
        })
      : []

  const rows: HorizonRow[] = [...historyRows]
  if (forecastPoints.length > 0) {
    rows[rows.length - 1] = { ...rows[rows.length - 1], forecast: last.value }
    rows.push(...forecastPoints)
  }

  const end = forecastPoints.length > 0 ? forecastPoints[forecastPoints.length - 1].forecast : undefined
  const summary: HorizonSummary | null =
    typeof end === "number"
      ? {
          current: last.value,
          end,
          plus15: valueAtOrBefore(forecastPoints, 15),
          plus30: valueAtOrBefore(forecastPoints, 30),
          plus60: valueAtOrBefore(forecastPoints, 60),
          direction: outlookDirection(last.value, end),
        }
      : null

  return { rows, historyMinutes: round(historyMinutes, 3), horizonMinutes, summary }
}

export function formatHorizonValue(value: number) {
  return value.toLocaleString("en-AU", { maximumFractionDigits: 2 })
}

/** Plain-language outlook line, e.g. "Expected to rise from 24.1 °C to 35.8 °C over the next hour". */
export function outlookSentence(summary: HorizonSummary, unit: string, horizonMinutes = HORIZON_MINUTES_DEFAULT) {
  const span = horizonMinutes === 60 ? "the next hour" : `the next ${horizonMinutes} minutes`
  const withUnit = (value: number) => `${formatHorizonValue(value)}${unit ? ` ${unit}` : ""}`
  if (summary.direction === "steady") {
    return `Expected to stay around ${withUnit(summary.current)} over ${span}`
  }
  return `Expected to ${summary.direction} from ${withUnit(summary.current)} to ${withUnit(summary.end)} over ${span}`
}

/** Operator-safe copy for an outlook that cannot be drawn. Never echoes raw error text. */
export function horizonUnavailableCopy(horizon: EntityLiveHorizon | null | undefined) {
  if (!horizon) {
    return {
      title: "One-hour outlook isn't available yet",
      message: "The outlook starts automatically once the machine's forecast model has enough readings.",
    }
  }
  switch (horizon.status) {
    case "ok":
      return null
    case "waiting":
      return {
        title: "Waiting for enough readings",
        message: horizon.message ?? "The one-hour outlook starts automatically once enough readings have arrived.",
      }
    case "error":
      return {
        title: "The outlook could not be updated",
        message: "The forecast model could not process the latest readings. The system will retry automatically.",
      }
    default:
      return {
        title: "One-hour outlook isn't available",
        message: horizon.message ?? "This machine needs an active forecast model before the outlook can be shown.",
      }
  }
}
