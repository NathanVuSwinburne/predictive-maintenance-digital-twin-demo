"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { MagnifyingGlassIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { MachineAssignmentsDialog } from "@/components/admin/machine-assignments-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useDataProvider } from "@/hooks/use-data-provider"
import type { MachineSummary, UserPersona } from "@/lib/domain/types"

type AssignedUsersMap = Record<string, UserPersona[]>

export default function AdminMachinesPage() {
  const provider = useDataProvider()

  const [machines, setMachines] = useState<MachineSummary[]>([])
  const [assignedUsersByMachineId, setAssignedUsersByMachineId] =
    useState<AssignedUsersMap>({})
  const [search, setSearch] = useState("")
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      const loadedMachines = await provider.listMachines({
        sortBy: "name",
        sortDirection: "asc",
      })
      const assignmentEntries = await Promise.all(
        loadedMachines.map(async (machine) => [
          machine.id,
          await provider.getMachineAuthorizedUsers(machine.id),
        ] as const)
      )

      setMachines(loadedMachines)
      setAssignedUsersByMachineId(Object.fromEntries(assignmentEntries))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load machines"
      setLoadError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }, [provider])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredMachines = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) {
      return machines
    }

    return machines.filter((machine) =>
      [machine.name, machine.id, machine.line, machine.model]
        .join(" ")
        .toLowerCase()
        .includes(term)
    )
  }, [machines, search])

  const selectedMachine =
    machines.find((machine) => machine.id === selectedMachineId) ?? null

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Machine access view</CardTitle>
          <CardDescription className="text-sm">
            Review machine-level access coverage and inspect which users are assigned to each machine.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <MagnifyingGlassIcon />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search machines"
              placeholder="Search by machine name, ID, line, or model"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>

          {loadError && (
            <Alert variant="destructive">
              <MagnifyingGlassIcon />
              <AlertTitle>Unable to load machine assignments</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          )}

          <div className="overflow-x-auto border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Machine</TableHead>
                  <TableHead>Machine ID</TableHead>
                  <TableHead>Line</TableHead>
                  <TableHead>Assigned users</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 5 }, (_, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Skeleton className="h-4 w-32" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-16" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-10" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-7 w-16" />
                        </TableCell>
                      </TableRow>
                    ))
                  : filteredMachines.map((machine) => {
                      const assignedUsers = assignedUsersByMachineId[machine.id] ?? []

                      return (
                        <TableRow key={machine.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{machine.name}</span>
                              <span className="text-muted-foreground">{machine.model}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{machine.id}</Badge>
                          </TableCell>
                          <TableCell>{machine.line}</TableCell>
                          <TableCell>{assignedUsers.length}</TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedMachineId(machine.id)
                                setIsDialogOpen(true)
                              }}
                            >
                              View users
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
              </TableBody>
            </Table>
          </div>

          {!isLoading && filteredMachines.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No machines match the current search.
            </p>
          )}
        </CardContent>
      </Card>

      <MachineAssignmentsDialog
        isOpen={isDialogOpen}
        machine={selectedMachine}
        users={selectedMachine ? assignedUsersByMachineId[selectedMachine.id] ?? [] : []}
        onOpenChange={(open) => {
          setIsDialogOpen(open)

          if (!open) {
            setSelectedMachineId(null)
          }
        }}
      />
    </div>
  )
}
