"use client"

import { UsersThreeIcon } from "@phosphor-icons/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import type { MachineSummary, UserPersona } from "@/lib/domain/types"

type MachineAssignmentsDialogProps = {
  isOpen: boolean
  machine: MachineSummary | null
  users: UserPersona[]
  onOpenChange(open: boolean): void
}

export function MachineAssignmentsDialog({
  isOpen,
  machine,
  users,
  onOpenChange,
}: MachineAssignmentsDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {machine ? `Assigned users for ${machine.name}` : "Assigned users"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {machine && (
            <div className="flex flex-wrap items-center gap-2 border border-border p-3 text-sm">
              <Badge variant="outline">{machine.id}</Badge>
              <Badge variant="secondary">{machine.line}</Badge>
              <span className="text-muted-foreground">{machine.model}</span>
            </div>
          )}

          {users.length === 0 ? (
            <Empty className="border border-dashed border-border bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersThreeIcon />
                </EmptyMedia>
                <EmptyTitle>No assigned users</EmptyTitle>
                <EmptyDescription>
                  This machine is not currently assigned to any standard users.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-3 border border-border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-muted-foreground">{user.email}</p>
                  </div>
                  <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                    {user.role}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
