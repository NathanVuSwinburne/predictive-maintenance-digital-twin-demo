/**
 * One place for every wall-clock time the UI shows.
 *
 * The app is operated from Melbourne, so times render in Australia/Melbourne no
 * matter where the code runs: the operator's browser, or the UTC Docker server
 * during server rendering (which also keeps SSR and hydration identical).
 * `NEXT_PUBLIC_APP_TIME_ZONE` (an IANA zone such as "Australia/Sydney") overrides
 * the zone at build time. Elapsed-time maths ("12 s ago") does not use this
 * module; it compares instants and is zone-independent.
 */

export const APP_LOCALE = "en-AU"

const DEFAULT_TIME_ZONE = "Australia/Melbourne"

function resolveTimeZone(candidate: string | undefined) {
  const zone = candidate?.trim()
  if (!zone) return DEFAULT_TIME_ZONE
  try {
    new Intl.DateTimeFormat(APP_LOCALE, { timeZone: zone })
    return zone
  } catch {
    // An unknown zone would make every formatter throw; fall back instead.
    return DEFAULT_TIME_ZONE
  }
}

export const APP_TIME_ZONE = resolveTimeZone(process.env.NEXT_PUBLIC_APP_TIME_ZONE)

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatterFor(options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(options)
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(APP_LOCALE, { ...options, timeZone: APP_TIME_ZONE })
    formatterCache.set(key, formatter)
  }
  return formatter
}

export type DateInput = Date | string | number

function toDate(value: DateInput) {
  return value instanceof Date ? value : new Date(value)
}

/** Formats an instant in the app time zone with the given fields. Invalid input returns the raw value. */
export function formatInAppTimeZone(value: DateInput, options: Intl.DateTimeFormatOptions) {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return formatterFor(options).format(date)
}

/** "6 Oct 2026, 6:00 pm" */
export function formatAppDateTime(value: DateInput) {
  return formatInAppTimeZone(value, { dateStyle: "medium", timeStyle: "short" })
}

/** "06:00:12 pm" — for readings that arrive several times a minute. */
export function formatAppTimeWithSeconds(value: DateInput) {
  return formatInAppTimeZone(value, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

/** "6 Oct 2026" */
export function formatAppDate(value: DateInput) {
  return formatInAppTimeZone(value, { dateStyle: "medium" })
}

/** "06:00 pm" — compact chart axis tick. */
export function formatAppAxisTime(value: DateInput) {
  return formatInAppTimeZone(value, { hour: "2-digit", minute: "2-digit" })
}

/** "06/10/2026, 6:00:12 pm" — the numeric layout `Date#toLocaleString()` used to produce. */
export function formatAppNumericDateTime(value: DateInput) {
  return formatInAppTimeZone(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

/** Short zone name at the given instant, e.g. "AEDT" in summer and "AEST" in winter. */
export function appTimeZoneLabel(at: DateInput = new Date()) {
  const date = toDate(at)
  const safe = Number.isNaN(date.getTime()) ? new Date() : date
  const part = formatterFor({ timeZoneName: "short" })
    .formatToParts(safe)
    .find((item) => item.type === "timeZoneName")
  return part?.value ?? APP_TIME_ZONE
}

/** City part of the zone id: "Australia/Melbourne" → "Melbourne". */
export function appTimeZoneCity() {
  const city = APP_TIME_ZONE.split("/").at(-1) ?? APP_TIME_ZONE
  return city.replace(/_/g, " ")
}

/** "Times in Melbourne (AEDT)" */
export function appTimeZoneCaption(at: DateInput = new Date()) {
  return `Times in ${appTimeZoneCity()} (${appTimeZoneLabel(at)})`
}
