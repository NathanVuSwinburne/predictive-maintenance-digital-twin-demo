import type { EntityLiveObservation } from "@/lib/domain/types"

/**
 * Pure geometry for the 3D vibration view: picks the X/Y/Z readings, keeps a
 * stable axis scale, and projects points with a simple orthographic camera.
 * No rendering here, so it is testable without a canvas.
 */

export const VIBRATION_AXES = ["VibrationX", "VibrationY", "VibrationZ"] as const

export type VibrationPoint = {
  x: number
  y: number
  z: number
  timestamp: string
  /** 0 = oldest, 1 = newest. */
  recency: number
}

export type AxisScale = {
  /** Half-extent of every axis in data units; all three share it so the vector shape is honest. */
  limit: number
  /** True when any reading was negative: axes run [-limit, limit] instead of [0, limit]. */
  symmetric: boolean
  /** Data clock (ms) since which every reading has stayed below half the limit; null otherwise. */
  belowHalfSince?: number | null
}

/** Nice tick-friendly fractions of a decade, fine enough for the box to hug the data. */
const NICE_FRACTIONS = [1, 2, 2.5, 3, 4, 5, 6, 8, 10]
/** Headroom added above the largest reading before rounding up. */
export const SCALE_HEADROOM = 1.1
/** How long readings must stay below half the limit before the scale steps down one tier. */
export const SCALE_SHRINK_AFTER_MS = 10_000
/** The box fits this share of readings; rarer spikes are pinned to its edge. */
export const SCALE_QUANTILE = 0.98

export type Camera = {
  /** Degrees around the vertical axis. */
  yaw: number
  /** Degrees of tilt; positive looks down from above. */
  pitch: number
  zoom: number
}

export const DEFAULT_CAMERA: Camera = { yaw: -35, pitch: 24, zoom: 1 }
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 4

export function hasVibrationVector(features: Iterable<string>) {
  const names = new Set(features)
  return VIBRATION_AXES.every((axis) => names.has(axis))
}

/** Readings that carry all three vibration components, oldest first, with recency 0..1. */
export function vibrationPoints(observations: EntityLiveObservation[]): VibrationPoint[] {
  const raw = observations.flatMap((observation) => {
    const [x, y, z] = VIBRATION_AXES.map((axis) => observation.values[axis])
    return typeof x === "number" && typeof y === "number" && typeof z === "number"
      ? [{ x, y, z, timestamp: observation.timestamp }]
      : []
  })
  const last = Math.max(raw.length - 1, 1)
  return raw.map((point, index) => ({ ...point, recency: raw.length === 1 ? 1 : index / last }))
}

export function magnitude(point: Pick<VibrationPoint, "x" | "y" | "z">) {
  return Math.hypot(point.x, point.y, point.z)
}

function roundNice(value: number) {
  return Number(value.toPrecision(12))
}

/** Rounds up to a "nice" tick-friendly number ({1, 2, 2.5, 3, 4, 5, 6, 8} × 10^n). */
export function niceCeil(value: number) {
  if (!(value > 0)) return 1
  const exponent = Math.floor(Math.log10(value))
  const base = 10 ** exponent
  const fraction = value / base
  const nice = NICE_FRACTIONS.find((candidate) => fraction <= candidate + 1e-9) ?? 10
  return roundNice(nice * base)
}

/** The nice tier just below `value` (used when the scale steps down). */
export function niceStepDown(value: number) {
  if (!(value > 0)) return 1
  const exponent = Math.floor(Math.log10(value))
  const base = 10 ** exponent
  const fraction = value / base
  const lower = [...NICE_FRACTIONS].reverse().find((candidate) => candidate < fraction - 1e-9)
  return roundNice(lower ? lower * base : 8 * (base / 10))
}

function toMs(iso: string | undefined) {
  if (!iso) return null
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * Axis scale fitted to the `SCALE_QUANTILE` of recent readings (rarer spikes are
 * drawn pinned to the box edge), growing immediately when the typical level rises
 * and stepping down one tier after it has stayed below half the limit for
 * `SCALE_SHRINK_AFTER_MS` (data clock). A ~10% margin is added before rounding.
 */
export function nextAxisScale(
  previous: AxisScale | null,
  points: VibrationPoint[],
  nowMs: number | null = toMs(points.at(-1)?.timestamp),
): AxisScale {
  // Fit the typical readings, not the single largest spike: a CMTK sensor idling
  // at 0.1-0.3 mm/s with one 2 mm/s spike would otherwise shrink the cloud to a dot.
  let negative = previous?.symmetric ?? false
  const magnitudes: number[] = []
  for (const point of points) {
    for (const value of [point.x, point.y, point.z]) {
      magnitudes.push(Math.abs(value))
      if (value < 0) negative = true
    }
  }
  magnitudes.sort((a, b) => a - b)
  const maxAbs = magnitudes.length
    ? magnitudes[Math.min(magnitudes.length - 1, Math.floor(SCALE_QUANTILE * (magnitudes.length - 1)))]
    : 0
  const needed = niceCeil(maxAbs * SCALE_HEADROOM)
  if (!previous || previous.limit < needed) {
    return { limit: needed, symmetric: negative, belowHalfSince: null }
  }
  if (points.length === 0 || maxAbs >= previous.limit / 2) {
    return { limit: previous.limit, symmetric: negative, belowHalfSince: null }
  }
  const since = previous.belowHalfSince ?? nowMs
  if (nowMs !== null && since !== null && nowMs - since >= SCALE_SHRINK_AFTER_MS) {
    return { limit: Math.max(niceStepDown(previous.limit), needed), symmetric: negative, belowHalfSince: null }
  }
  return { limit: previous.limit, symmetric: negative, belowHalfSince: since }
}

export type Projected = {
  sx: number
  sy: number
  /** Larger is closer to the viewer. */
  depth: number
}

/**
 * Orthographic projection of a data point into a unit box [-1, 1] on screen
 * (callers scale to pixels). Data Z is drawn as the vertical screen axis.
 */
export function project(
  point: Pick<VibrationPoint, "x" | "y" | "z">,
  scale: AxisScale,
  camera: Camera,
): Projected {
  const normalise = (value: number) =>
    scale.symmetric ? value / scale.limit : (value / scale.limit) * 2 - 1
  const x = normalise(point.x)
  const y = normalise(point.y)
  const z = normalise(point.z)
  const yaw = (camera.yaw * Math.PI) / 180
  const pitch = (camera.pitch * Math.PI) / 180
  // Rotate around the vertical (data Z) axis, then tilt towards the viewer.
  const rx = x * Math.cos(yaw) - y * Math.sin(yaw)
  const ry = x * Math.sin(yaw) + y * Math.cos(yaw)
  const sy = z * Math.cos(pitch) - ry * Math.sin(pitch)
  const depth = z * Math.sin(pitch) + ry * Math.cos(pitch)
  return { sx: rx * camera.zoom, sy: sy * camera.zoom, depth }
}

export function clampCamera(camera: Camera): Camera {
  return {
    yaw: ((camera.yaw % 360) + 360) % 360,
    pitch: Math.max(-89, Math.min(89, camera.pitch)),
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom)),
  }
}

export function formatComponent(value: number) {
  return value.toLocaleString("en-AU", { maximumFractionDigits: 3 })
}

/** Screen-reader summary of the newest vector; also shown as visible text. */
export function describeVector(point: VibrationPoint | null, unit: string, count: number) {
  if (!point) return "No vibration readings yet."
  const u = unit ? ` ${unit}` : ""
  return (
    `Newest vibration vector: X ${formatComponent(point.x)}${u}, Y ${formatComponent(point.y)}${u}, ` +
    `Z ${formatComponent(point.z)}${u}; magnitude ${formatComponent(magnitude(point))}${u}. ` +
    `${count} recent reading${count === 1 ? "" : "s"} plotted, newest emphasised.`
  )
}

/** Pin a reading into the box; `clipped` marks spikes drawn at the edge. */
export function clampToScale(
  point: Pick<VibrationPoint, "x" | "y" | "z">,
  scale: AxisScale,
): { x: number; y: number; z: number; clipped: boolean } {
  const lo = scale.symmetric ? -scale.limit : 0
  const clamp = (value: number) => Math.min(scale.limit, Math.max(lo, value))
  const x = clamp(point.x)
  const y = clamp(point.y)
  const z = clamp(point.z)
  return { x, y, z, clipped: x !== point.x || y !== point.y || z !== point.z }
}

/** Box sizes offered by the manual "Axis range" slider (mm/s for CMTK velocity). */
export const AXIS_RANGE_STEPS = [0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.5, 2, 2.5, 3, 4, 5, 8, 10]

/** Slider position closest to a limit, so switching from Auto starts where Auto was. */
export function nearestRangeStep(limit: number) {
  let best = 0
  for (let index = 1; index < AXIS_RANGE_STEPS.length; index += 1) {
    if (Math.abs(AXIS_RANGE_STEPS[index] - limit) < Math.abs(AXIS_RANGE_STEPS[best] - limit)) best = index
  }
  return best
}
