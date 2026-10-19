"use client";

import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { ErrorNotice } from "@/components/feedback/error-notice";
import { CMTK_NOT_REACHABLE_MESSAGE } from "@/components/monitor/connect-machine-form";
import { ConnectionDetailsSection } from "@/components/monitor/connection-details-section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDataProvider } from "@/hooks/use-data-provider";
import { brokerPayload, connectionDraftErrors, draftFromConnection } from "@/lib/domain/cmtk-connection";
import type { CmtkSetup } from "@/lib/domain/types";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  initialName: string;
  initialDescription: string;
  /** Connection prefill and presets; the section is hidden until it is known. */
  setup: CmtkSetup | null;
  onSaved: () => void;
};

/** Renames/describes a connected machine by re-running the idempotent CMTK connect. */
export function EditMachineDetailsDialog({
  open,
  onOpenChange,
  entityId,
  initialName,
  initialDescription,
  setup,
  onSaved,
}: Props) {
  const provider = useDataProvider();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const initialConnection = draftFromConnection(setup?.connection);
  const [connection, setConnection] = useState(initialConnection);
  const [showConnectionErrors, setShowConnectionErrors] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription(initialDescription);
      setConnection(draftFromConnection(setup?.connection));
      setShowConnectionErrors(false);
      setError(null);
    }
  }, [initialDescription, initialName, open, setup?.connection]);

  const nameError = name.trim() ? undefined : "Enter a machine name.";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nameError) return;
    const broker = brokerPayload(connection, initialConnection);
    if (broker && Object.keys(connectionDraftErrors(connection)).length > 0) {
      setShowConnectionErrors(true);
      setError({ title: "Check the connection details", message: "Fill in the broker address, port, and topic, then try again." });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await provider.connectCmtkMachine({
        entityId,
        machineName: name.trim(),
        description: description.trim() || undefined,
        ...(broker ? { broker } : {}),
      });
      toast.success(
        result.connection.success ? "Machine details saved" : `Machine details saved. ${CMTK_NOT_REACHABLE_MESSAGE}`,
      );
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(
        toUserFacingError(caught, "data.save", {
          title: "Machine details not saved",
          message: "Check the name and try again.",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>Edit machine details</DialogTitle>
            <DialogDescription>Change the name or description shown on the monitor.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={nameError ? true : undefined}>
              <FieldLabel htmlFor="edit-machine-name">Machine name</FieldLabel>
              <Input
                id="edit-machine-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={nameError ? true : undefined}
                required
              />
              <FieldError>{nameError}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-machine-description">Description or location (optional)</FieldLabel>
              <Textarea
                id="edit-machine-description"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </FieldGroup>
          {setup ? (
            <ConnectionDetailsSection
              idPrefix="cmtk-edit"
              connection={setup.connection}
              presets={setup.presets}
              draft={connection}
              initial={initialConnection}
              onChange={setConnection}
              entityId={entityId}
              defaultOpen={setup.connection.source === "none"}
              showErrors={showConnectionErrors}
            />
          ) : null}
          {error ? <ErrorNotice error={error} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy || Boolean(nameError)}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
