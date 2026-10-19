import type { EntityRecording, EntityRecordingStopReason } from "@/lib/domain/types"

/** An active recording with no new row for this long shows a "no readings" warning. */
export const RECORDING_IDLE_WARNING_SECONDS = 30

/** Labels the operator is offered; any short text is accepted. */
export const SUGGESTED_RECORDING_LABELS = ["normal", "low", "medium", "high"] as const

export const recordingStopReasonLabel: Record<EntityRecordingStopReason, string> = {
  user: "Stopped",
  time_limit: "Stopped at time limit",
  row_limit: "Stopped at row limit",
  source_deleted: "Stopped: data source deleted",
}

export function recordingStatusLabel(recording: EntityRecording) {
  if (recording.status === "recording") return "Recording"
  return recording.stopReason ? recordingStopReasonLabel[recording.stopReason] : "Stopped"
}

/** "12 s", "4 min 05 s", "2 h 03 min". Durations, not clock times. */
export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ${String(seconds % 60).padStart(2, "0")} s`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`
}

/**
 * Server clock offset (server minus browser), taken when a response arrives, so elapsed
 * and idle times follow the server's clock rather than a possibly wrong local one.
 */
export function serverClockOffsetMs(serverTime: string, receivedAtMs: number) {
  const server = Date.parse(serverTime)
  return Number.isNaN(server) ? 0 : server - receivedAtMs
}

export type RecordingTimes = {
  elapsedSeconds: number
  /** Seconds since the last recorded row (or since the start, before the first row). */
  idleSeconds: number
  remainingSeconds: number
}

export function recordingTimes(recording: EntityRecording, serverNowMs: number): RecordingTimes {
  const started = Date.parse(recording.startedAt)
  const end = recording.stoppedAt ? Date.parse(recording.stoppedAt) : serverNowMs
  const lastRow = recording.lastReceivedAt ? Date.parse(recording.lastReceivedAt) : started
  return {
    elapsedSeconds: Math.max(0, (end - started) / 1000),
    idleSeconds: Math.max(0, (serverNowMs - lastRow) / 1000),
    remainingSeconds: Math.max(0, (Date.parse(recording.stopDeadlineAt) - serverNowMs) / 1000),
  }
}

export function isRecordingIdle(recording: EntityRecording, serverNowMs: number) {
  return (
    recording.status === "recording" &&
    recordingTimes(recording, serverNowMs).idleSeconds >= RECORDING_IDLE_WARNING_SECONDS
  )
}

/** Query value for `?recordings=` on the Prepare Training Data step. */
export function recordingsQueryValue(ids: string[]) {
  return [...new Set(ids)].sort().join(",")
}

export function parseRecordingsQuery(value: string | null | undefined) {
  if (!value) return []
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].sort()
}
