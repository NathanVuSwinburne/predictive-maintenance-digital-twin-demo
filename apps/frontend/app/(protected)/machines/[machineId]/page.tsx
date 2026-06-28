import { AccessDeniedState } from "@/components/auth/access-denied-state"
import { MachineDetailPage } from "@/components/machines/machine-detail-page"
import {
  currentUserCanAccessMachine,
  requireServerAuth,
} from "@/lib/auth/server-auth"

export default async function MachineDetailRoute({
  params,
}: {
  params: Promise<{ machineId: string }>
}) {
  const { machineId } = await params

  await requireServerAuth(`/machines/${machineId}`)

  const hasAccess = await currentUserCanAccessMachine(machineId)

  if (!hasAccess) {
    return (
      <AccessDeniedState
        title="Machine access denied"
        description="You do not have permission to view this machine. Please contact an administrator if you need access."
        actionHref="/machines"
        actionLabel="Back to machines"
      />
    )
  }

  return <MachineDetailPage machineId={machineId} />
}
