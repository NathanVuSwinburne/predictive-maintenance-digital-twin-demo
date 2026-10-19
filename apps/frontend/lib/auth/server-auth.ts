import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { SESSION_COOKIE_NAME } from "@/lib/auth/session"
import { getDataProvider } from "@/lib/data/provider-factory"
import type { Session, UserPersona } from "@/lib/domain/types"

type ServerAuthContext = {
  session: Session
  user: UserPersona
}

async function resolveServerUsers() {
  const provider = getDataProvider()
  return provider.listUsers()
}

export async function getServerAuthContext(): Promise<ServerAuthContext | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!token) {
    return null
  }

  const provider = getDataProvider()
  const session = await provider.getSession(token)

  if (!session) {
    return null
  }

  const users = await resolveServerUsers()
  const user =
    users.find((candidate) => candidate.id === session.activePersonaId) ??
    users.find((candidate) => candidate.id === session.userId)

  if (!user) {
    return null
  }

  return { session, user }
}

export async function requireServerAuth(nextPath: string) {
  const context = await getServerAuthContext()

  if (!context) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`)
  }

  return context
}

export async function currentUserCanAccessMachine(machineId: string) {
  const context = await getServerAuthContext()

  if (!context) {
    return false
  }

  const machines = await getDataProvider().listMachines()
  return context.user.role === "admin" || machines.some((machine) => machine.id === machineId)
}

/**
 * Live Monitor access: the legacy catalog check, or the backend's own authorisation of
 * the entity's live feed (machines registered only in Machine Registry are not in the
 * catalog, but the backend still scopes `/live` to the signed-in user).
 */
export async function currentUserCanMonitorEntity(entityId: string) {
  if (await currentUserCanAccessMachine(entityId)) {
    return true
  }

  try {
    await getDataProvider().getEntityLiveStatus(entityId, { limit: 1 })
    return true
  } catch {
    return false
  }
}
