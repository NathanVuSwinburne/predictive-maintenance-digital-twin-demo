import { AccessDeniedState } from "@/components/auth/access-denied-state"
import { MachineMonitor } from "@/components/monitor/machine-monitor"
import {
  currentUserCanMonitorEntity,
  requireServerAuth,
} from "@/lib/auth/server-auth"

export default async function MachineMonitorRoute({
  params,
}: {
  params: Promise<{ entityId: string }>
}) {
  const { entityId } = await params

  await requireServerAuth(`/monitor/${entityId}`)

  const hasAccess = await currentUserCanMonitorEntity(entityId)

  if (!hasAccess) {
    return (
      <AccessDeniedState
        title="Machine access denied"
        description="You do not have permission to monitor this machine. Please contact an administrator if you need access."
        actionHref="/monitor"
        actionLabel="Back to Live Monitor"
      />
    )
  }

  return <MachineMonitor entityId={entityId} />
}
