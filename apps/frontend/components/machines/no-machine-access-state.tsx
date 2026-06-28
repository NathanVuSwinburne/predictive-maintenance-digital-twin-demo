import { LockKeyOpenIcon } from "@phosphor-icons/react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

type NoMachineAccessStateProps = {
  title?: string
  description?: string
}

export function NoMachineAccessState({
  title = "No machine access yet",
  description = "You do not currently have access to any machines. Please contact an administrator.",
}: NoMachineAccessStateProps) {
  return (
    <Empty className="border border-dashed border-border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LockKeyOpenIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
