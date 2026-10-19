import type { CmtkBrokerInput, CmtkConnection, CmtkPreset } from "@/lib/domain/types"

/** Editable copy of the broker connection. All fields are strings so the inputs stay controlled. */
export type ConnectionDraft = {
  host: string
  port: string
  tls: boolean
  username: string
  /** Blank means "keep the stored password"; it is sent only when typed. */
  password: string
  topic: string
  preset: CmtkPreset
}

export const CMTK_PRESETS: CmtkPreset[] = ["compact", "verbose", "velocity", "pd"]

export const CMTK_PRESET_LABELS: Record<CmtkPreset, string> = {
  compact: "Compact CMTK JSON",
  verbose: "Verbose CMTK JSON",
  velocity: "CMTK device data (velocity, mm/s)",
  pd: "Balluff process data",
}

export function draftFromConnection(connection: CmtkConnection | null | undefined): ConnectionDraft {
  return {
    host: connection?.host ?? "",
    port: String(connection?.port ?? 1883),
    tls: connection?.tls ?? false,
    username: connection?.username ?? "",
    password: "",
    topic: connection?.topic ?? "",
    preset: connection?.preset ?? "compact",
  }
}

/** True when the operator changed anything in the section (a typed password counts). */
export function isConnectionDraftDirty(draft: ConnectionDraft, initial: ConnectionDraft) {
  return (
    draft.host.trim() !== initial.host.trim() ||
    draft.port.trim() !== initial.port.trim() ||
    draft.tls !== initial.tls ||
    draft.username.trim() !== initial.username.trim() ||
    draft.password !== "" ||
    draft.topic.trim() !== initial.topic.trim() ||
    draft.preset !== initial.preset
  )
}

export function connectionDraftErrors(draft: ConnectionDraft) {
  const errors: Partial<Record<"host" | "port" | "topic", string>> = {}
  if (!draft.host.trim()) errors.host = "Enter the broker address."
  const port = Number(draft.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.port = "Enter a port between 1 and 65535."
  if (!draft.topic.trim()) errors.topic = "Enter the topic to listen to."
  return errors
}

/**
 * The `broker` body for connect/probe. Returns undefined when nothing changed so the
 * server keeps using its saved/server connection. The password is included only when typed.
 */
export function brokerPayload(draft: ConnectionDraft, initial: ConnectionDraft): CmtkBrokerInput | undefined {
  if (!isConnectionDraftDirty(draft, initial)) return undefined
  const payload: CmtkBrokerInput = {
    host: draft.host.trim(),
    port: Number(draft.port),
    tls: draft.tls,
    username: draft.username.trim() || null,
    topic: draft.topic.trim(),
    preset: draft.preset,
  }
  if (draft.password !== "") payload.password = draft.password
  return payload
}

/** Compact preview of the first message for the probe result. */
export function formatSample(sample: unknown, maxLength = 600) {
  const text = typeof sample === "string" ? sample : JSON.stringify(sample, null, 2)
  if (!text) return ""
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}
