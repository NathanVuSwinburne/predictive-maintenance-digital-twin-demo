import { ACCESS_CONTROL_COOKIE_NAME } from "@/lib/auth/session"
import type { UserPersona, UserRole } from "@/lib/domain/types"

export type AccessControlState = {
  rolesByUserId: Record<string, UserRole>
  machineIdsByUserId: Record<string, string[]>
}

type CookieReader = {
  get(name: string): { value: string } | undefined
}

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

function sanitizeMachineIds(machineIds: string[] | undefined) {
  return [...new Set((machineIds ?? []).filter(Boolean))].sort()
}

export function normalizeAccessControlState(
  state?: Partial<AccessControlState> | null
): AccessControlState {
  return {
    rolesByUserId: Object.fromEntries(
      Object.entries(state?.rolesByUserId ?? {}).filter(([, role]) =>
        role === "admin" || role === "user"
      )
    ) as Record<string, UserRole>,
    machineIdsByUserId: Object.fromEntries(
      Object.entries(state?.machineIdsByUserId ?? {}).map(([userId, machineIds]) => [
        userId,
        sanitizeMachineIds(machineIds),
      ])
    ),
  }
}

export function mergeAccessControlState(
  baseState: AccessControlState,
  overrideState?: Partial<AccessControlState> | null
) {
  const normalizedOverride = normalizeAccessControlState(overrideState)

  return {
    rolesByUserId: {
      ...baseState.rolesByUserId,
      ...normalizedOverride.rolesByUserId,
    },
    machineIdsByUserId: {
      ...baseState.machineIdsByUserId,
      ...normalizedOverride.machineIdsByUserId,
    },
  } satisfies AccessControlState
}

export function serializeAccessControlState(state: AccessControlState) {
  return encodeURIComponent(JSON.stringify(normalizeAccessControlState(state)))
}

export function parseAccessControlState(rawValue?: string | null) {
  if (!rawValue) {
    return null
  }

  try {
    return normalizeAccessControlState(
      JSON.parse(decodeURIComponent(rawValue)) as AccessControlState
    )
  } catch {
    return null
  }
}

export function readAccessControlStateFromCookieString(cookieString: string) {
  const target = cookieString
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${ACCESS_CONTROL_COOKIE_NAME}=`))

  if (!target) {
    return null
  }

  const [, value = ""] = target.split("=")
  return parseAccessControlState(value)
}

export function readAccessControlStateFromCookies(cookieStore: CookieReader) {
  return parseAccessControlState(cookieStore.get(ACCESS_CONTROL_COOKIE_NAME)?.value)
}

export function readAccessControlStateFromDocument() {
  if (typeof document === "undefined") {
    return null
  }

  return readAccessControlStateFromCookieString(document.cookie)
}

export function writeAccessControlStateToDocument(state: AccessControlState) {
  if (typeof document === "undefined") {
    return
  }

  document.cookie = `${ACCESS_CONTROL_COOKIE_NAME}=${serializeAccessControlState(state)}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`
}

export function applyAccessControlStateToUsers(
  users: UserPersona[],
  state: AccessControlState
) {
  return users.map((user) => ({
    ...user,
    role: state.rolesByUserId[user.id] ?? user.role,
  }))
}

export function getExplicitMachineIdsForUser(
  state: AccessControlState,
  userId: string
) {
  return sanitizeMachineIds(state.machineIdsByUserId[userId])
}

export function getUsersAssignedToMachine(
  users: UserPersona[],
  state: AccessControlState,
  machineId: string
) {
  return users.filter((user) =>
    getExplicitMachineIdsForUser(state, user.id).includes(machineId)
  )
}

export function userCanAccessMachine(
  user: UserPersona,
  state: AccessControlState,
  machineId: string
) {
  if (user.role === "admin") {
    return true
  }

  return getExplicitMachineIdsForUser(state, user.id).includes(machineId)
}
