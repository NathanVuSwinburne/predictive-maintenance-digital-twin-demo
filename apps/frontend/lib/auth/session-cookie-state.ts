import { SESSION_META_COOKIE_NAME } from "@/lib/auth/session"
import type { Session } from "@/lib/domain/types"

type CookieReader = {
  get(name: string): { value: string } | undefined
}

export function serializeSessionMeta(session: Session) {
  return encodeURIComponent(
    JSON.stringify({
      userId: session.userId,
      activePersonaId: session.activePersonaId,
      authenticatedAt: session.authenticatedAt,
    })
  )
}

export function parseSessionMeta(rawValue?: string | null): Session | null {
  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue)) as Omit<Session, "token">

    if (!parsed.userId || !parsed.activePersonaId || !parsed.authenticatedAt) {
      return null
    }

    return {
      token: "",
      userId: parsed.userId,
      activePersonaId: parsed.activePersonaId,
      authenticatedAt: parsed.authenticatedAt,
    }
  } catch {
    return null
  }
}

export function readSessionMetaFromCookies(cookieStore: CookieReader) {
  return parseSessionMeta(cookieStore.get(SESSION_META_COOKIE_NAME)?.value)
}

export function writeSessionMetaToDocument(session: Session) {
  if (typeof document === "undefined") {
    return
  }

  document.cookie = `${SESSION_META_COOKIE_NAME}=${serializeSessionMeta(session)}; path=/; max-age=86400; samesite=lax`
}

export function clearSessionMetaCookie() {
  if (typeof document === "undefined") {
    return
  }

  document.cookie = `${SESSION_META_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`
}
