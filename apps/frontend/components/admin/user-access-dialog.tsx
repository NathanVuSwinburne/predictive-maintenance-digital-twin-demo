"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";

import { ErrorNotice } from "@/components/feedback/error-notice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MachineSummary, UserPersona, UserRole } from "@/lib/domain/types";
import type { UserFacingError } from "@/lib/errors/user-facing-error";

type UserWithAccess = UserPersona & {
  machineIds: string[];
};

type UserAccessDialogProps = {
  isOpen: boolean;
  isSaving: boolean;
  error: UserFacingError | null;
  machines: MachineSummary[];
  user: UserWithAccess | null;
  onOpenChange(open: boolean): void;
  onSave(input: {
    userId: string;
    role: UserRole;
    machineIds: string[];
    stepUpCode?: string;
  }): Promise<void>;
};

function UserAccessDialogEditor({
  isSaving,
  error,
  machines,
  user,
  onOpenChange,
  onSave,
}: Omit<UserAccessDialogProps, "isOpen"> & {
  user: UserWithAccess;
}) {
  const [search, setSearch] = useState("");
  const [selectedMachineIds, setSelectedMachineIds] = useState<string[]>(
    user.machineIds,
  );
  const [role, setRole] = useState<UserRole>(user.role);
  const [stepUpCode, setStepUpCode] = useState("");

  const filteredMachines = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return machines;
    }

    return machines.filter((machine) =>
      [machine.name, machine.id, machine.line, machine.model]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [machines, search]);

  const removedMachineCount = useMemo(() => {
    return user.machineIds.filter(
      (machineId) => !selectedMachineIds.includes(machineId),
    ).length;
  }, [selectedMachineIds, user]);

  const selectedMachines = useMemo(
    () => machines.filter((machine) => selectedMachineIds.includes(machine.id)),
    [machines, selectedMachineIds],
  );

  async function handleSave() {
    await onSave({
      userId: user.id,
      role,
      machineIds: selectedMachineIds,
      stepUpCode: role === "admin" && user.role !== "admin" ? stepUpCode : undefined,
    });
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1" aria-label="User access settings" role="region" tabIndex={0}>
        {error ? <ErrorNotice error={error} /> : null}
        <div className="grid gap-3 border border-border p-3 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium">{user.name}</p>
            <p className="break-all text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant={role === "admin" ? "default" : "secondary"}>
              {role}
            </Badge>
            <Badge variant="outline">
              {selectedMachineIds.length} assigned machine
              {selectedMachineIds.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="user-role">Role</FieldLabel>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as UserRole)}
            >
              <SelectTrigger id="user-role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">Standard user</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Admins can access the admin panel and all machines automatically.
            </FieldDescription>
          </Field>

          {role === "admin" && user.role !== "admin" ? <Field><FieldLabel htmlFor="role-step-up">Your authenticator code</FieldLabel><Input id="role-step-up" inputMode="numeric" autoComplete="one-time-code" value={stepUpCode} onChange={(event) => setStepUpCode(event.target.value)} required /><FieldDescription>Required to promote another user to administrator.</FieldDescription></Field> : null}

          <Field>
            <FieldLabel htmlFor="machine-search">Assigned machines</FieldLabel>
            <Input
              id="machine-search"
              placeholder="Search machines by name, ID, line, or model"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <FieldDescription>
              Search and toggle machines to adjust this user&apos;s authorised
              access.
            </FieldDescription>
          </Field>
        </FieldGroup>

        {role === "admin" && (
          <Alert>
            <MagnifyingGlassIcon />
            <AlertTitle>Admin access override</AlertTitle>
            <AlertDescription>
              Admins always retain full machine visibility even if no machines
              are explicitly assigned below.
            </AlertDescription>
          </Alert>
        )}

        {role !== "admin" && removedMachineCount > 0 && (
          <Alert variant="destructive">
            <MagnifyingGlassIcon />
            <AlertTitle>Machine assignments will be removed</AlertTitle>
            <AlertDescription>
              Saving removes explicit grants for unchecked machines. Users
              retain access to machines they own.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {selectedMachines.length > 0 ? (
              selectedMachines.map((machine) => (
                <Badge key={machine.id} variant="outline">
                  {machine.name}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">
                No machines explicitly assigned.
              </span>
            )}
          </div>

          <div className="border border-border p-3">
            <div className="flex flex-col gap-2">
              {filteredMachines.map((machine) => {
                const isChecked = selectedMachineIds.includes(machine.id);

                return (
                  <Field
                    key={machine.id}
                    orientation="horizontal"
                    className="border border-border p-3"
                  >
                    <Checkbox
                      aria-label={`Give access to ${machine.name}`}
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        setSelectedMachineIds((current) =>
                          checked
                            ? [...new Set([...current, machine.id])]
                            : current.filter(
                                (machineId) => machineId !== machine.id,
                              ),
                        );
                      }}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1 break-words">
                      <FieldLabel>{machine.name}</FieldLabel>
                      <FieldDescription>
                        {machine.id} · {machine.line} · {machine.model}
                      </FieldDescription>
                    </div>
                  </Field>
                );
              })}

              {filteredMachines.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No machines match the current search.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <DialogFooter className="shrink-0 border-t border-border pt-3">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={isSaving} onClick={() => void handleSave()}>
          {isSaving ? "Saving..." : "Save access"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function UserAccessDialog({
  isOpen,
  isSaving,
  error,
  machines,
  user,
  onOpenChange,
  onSave,
}: UserAccessDialogProps) {
  const editorKey = user
    ? `${user.id}:${user.role}:${user.machineIds.join(",")}`
    : "empty";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>
            {user ? `Manage access for ${user.name}` : "Manage access"}
          </DialogTitle>
          <DialogDescription>
            Update the user role and choose which machines they can access in
            the app.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <UserAccessDialogEditor
            key={editorKey}
            isSaving={isSaving}
            error={error}
            machines={machines}
            user={user}
            onOpenChange={onOpenChange}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
