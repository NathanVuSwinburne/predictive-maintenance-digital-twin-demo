"use client";

import { FormEvent, useMemo, useState } from "react";
import { PlayIcon, SpinnerIcon } from "@phosphor-icons/react";

import { ErrorNotice } from "@/components/feedback/error-notice";
import { ConnectionDetailsSection } from "@/components/monitor/connection-details-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDataProvider } from "@/hooks/use-data-provider";
import { brokerPayload, connectionDraftErrors, draftFromConnection } from "@/lib/domain/cmtk-connection";
import type { CmtkConnectResult, CmtkSetup } from "@/lib/domain/types";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";

type Props = {
  setup: CmtkSetup;
  /** Called after the server accepted the machine, even when the broker is not reachable yet. */
  onConnected: (result: CmtkConnectResult) => void;
};

/** Operator wording for a connection the server accepted but cannot reach yet; it keeps retrying. */
export const CMTK_NOT_REACHABLE_MESSAGE = "The CMTK isn't reachable yet — we'll keep trying.";

/**
 * Guided "Connect your CMTK machine" step: one short form, one primary action.
 * The model selector appears only when more than one compatible machine exists.
 */
export function ConnectMachineForm({ setup, onConnected }: Props) {
  const provider = useDataProvider();
  const compatible = useMemo(
    () => setup.candidates.filter((candidate) => candidate.compatible),
    [setup.candidates],
  );
  const defaultEntityId =
    (setup.defaultEntityId && compatible.some((candidate) => candidate.entityId === setup.defaultEntityId)
      ? setup.defaultEntityId
      : compatible[0]?.entityId) ?? "";
  const [chosenEntityId, setChosenEntityId] = useState(defaultEntityId);
  // Fall back to the default if the chosen candidate disappears from a refreshed setup.
  const entityId = compatible.some((candidate) => candidate.entityId === chosenEntityId)
    ? chosenEntityId
    : defaultEntityId;
  const selected = compatible.find((candidate) => candidate.entityId === entityId);
  const [name, setName] = useState(selected?.name ?? "");
  const [nameTouched, setNameTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [initialConnection] = useState(() => draftFromConnection(setup.connection));
  const [connection, setConnection] = useState(initialConnection);
  const [showConnectionErrors, setShowConnectionErrors] = useState(false);
  const connectionRequired = setup.connection.source === "none";

  function chooseModel(nextEntityId: string) {
    setChosenEntityId(nextEntityId);
    if (!nameTouched) {
      // Prefill the name from the chosen machine unless the operator already typed one.
      setName(compatible.find((candidate) => candidate.entityId === nextEntityId)?.name ?? "");
    }
  }

  const nameError = name.trim() ? undefined : "Enter a machine name.";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!entityId || nameError) return;
    // Only send broker details the operator changed; otherwise the saved/server connection is used.
    const broker = brokerPayload(connection, initialConnection);
    if ((broker || connectionRequired) && Object.keys(connectionDraftErrors(connection)).length > 0) {
      setShowConnectionErrors(true);
      setError({ title: "Check the connection details", message: "Fill in the broker address, port, and topic, then try again." });
      return;
    }
    setSubmitting(true);
    try {
      const result = await provider.connectCmtkMachine({
        entityId,
        machineName: name.trim(),
        description: description.trim() || undefined,
        ...(broker ? { broker } : {}),
      });
      onConnected(result);
    } catch (caught) {
      setError(
        toUserFacingError(caught, "data.save", {
          title: "The machine could not be connected",
          message: "Check that the server is set up for the CMTK and that this machine has the CMTK readings, then try again.",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (compatible.length === 0 || !setup.canConnect) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No machine is ready for the CMTK yet</CardTitle>
          <CardDescription className="text-sm">
            A machine needs the CMTK readings (vibration X/Y/Z and temperature) before it can be
            monitored. Set one up in Machine Registry, then come back here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connect your CMTK machine</CardTitle>
        <CardDescription className="text-sm">
          Give the machine a name you&apos;ll recognise, then start monitoring. Readings, the
          prediction, and the one-hour outlook appear as soon as the machine sends data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {compatible.length > 1 ? (
              <Field>
                <FieldLabel htmlFor="cmtk-model">Model to use</FieldLabel>
                <Select value={entityId} onValueChange={chooseModel}>
                  <SelectTrigger id="cmtk-model" className="w-full">
                    <SelectValue placeholder="Choose a machine model" />
                  </SelectTrigger>
                  <SelectContent>
                    {compatible.map((candidate) => (
                      <SelectItem key={candidate.entityId} value={candidate.entityId}>
                        {candidate.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>The prediction and forecast models trained for this machine type.</FieldDescription>
              </Field>
            ) : null}
            <Field data-invalid={nameError && name !== "" ? true : undefined}>
              <FieldLabel htmlFor="cmtk-machine-name">Machine name</FieldLabel>
              <Input
                id="cmtk-machine-name"
                value={name}
                onChange={(event) => {
                  setNameTouched(true);
                  setName(event.target.value);
                }}
                required
                aria-invalid={nameError && name !== "" ? true : undefined}
              />
              <FieldError>{name !== "" ? nameError : undefined}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="cmtk-machine-description">Description or location (optional)</FieldLabel>
              <Textarea
                id="cmtk-machine-description"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="e.g. Test rig, Lab 2"
              />
            </Field>
          </FieldGroup>

          <ConnectionDetailsSection
            idPrefix="cmtk-connect"
            connection={setup.connection}
            presets={setup.presets}
            draft={connection}
            initial={initialConnection}
            onChange={setConnection}
            entityId={entityId || undefined}
            defaultOpen={connectionRequired}
            showErrors={showConnectionErrors}
          />

          {error ? <ErrorNotice error={error} /> : null}

          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={submitting || !entityId || Boolean(nameError)}>
              {submitting ? (
                <SpinnerIcon data-icon="inline-start" className="animate-spin" aria-hidden="true" />
              ) : (
                <PlayIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {submitting ? "Starting…" : "Start monitoring"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
