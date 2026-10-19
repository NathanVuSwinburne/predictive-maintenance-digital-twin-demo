"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { ErrorNotice } from "@/components/feedback/error-notice";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDataProvider } from "@/hooks/use-data-provider";
import type {
  MachineSummary,
  UserInvitationResult,
  UserRole,
} from "@/lib/domain/types";
import {
  toUserFacingError,
  type UserFacingError,
} from "@/lib/errors/user-facing-error";
import { formatAppNumericDateTime } from "@/lib/time";

function UserInviteDialogEditor({
  open,
  onOpenChange,
  machines,
  onCreated,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  machines: MachineSummary[];
  onCreated(): void;
}) {
  const provider = useDataProvider();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [operationalRole, setOperationalRole] = useState("Operator");
  const [shift, setShift] = useState("Day");
  const [plant, setPlant] = useState("Main Plant");
  const [machineIds, setMachineIds] = useState<string[]>([]);
  const [stepUpCode, setStepUpCode] = useState("");
  const [result, setResult] = useState<UserInvitationResult | null>(null);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await provider.createUserInvitation({
        email,
        name,
        role,
        operationalRole,
        shift,
        plant,
        machineIds,
        stepUpCode: role === "admin" ? stepUpCode : undefined,
      });
      setResult(created);
      onCreated();
      toast.success("User activation link generated");
    } catch (submitError) {
      setError(
        toUserFacingError(submitError, "data.save", {
          title: "User could not be created",
          message: "Review the account details and try again.",
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  const activationUrl =
    result && typeof window !== "undefined"
      ? new URL(result.activationUrl, window.location.origin).toString()
      : result?.activationUrl;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        onOpenChange(next);
        if (!next) setResult(null);
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl" showCloseButton={!saving}>
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            Generate a one-time activation link and give it to the user to
            activate their account.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="min-h-0 overflow-y-auto border border-border bg-muted p-4" role="region" aria-label="Generated activation link" tabIndex={0}>
              <p className="font-medium">Activation link</p>
              <p className="mt-2 break-all text-sm">{activationUrl}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                This link expires at{" "}
                {formatAppNumericDateTime(result.expiresAt)} and can be used
                once.
              </p>
              {error ? <ErrorNotice error={error} /> : null}
            </div>
            <DialogFooter className="shrink-0 border-t border-border pt-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                onClick={async () => {
                  setError(null);
                  try {
                    await navigator.clipboard.writeText(activationUrl ?? "");
                    toast.success("Activation link copied");
                  } catch {
                    setError({ title: "Link could not be copied", message: "Select the activation link and copy it manually." });
                  }
                }}
              >
                Copy link
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={submit}>
            <div className="min-h-0 flex-1 overflow-y-auto px-1" role="region" aria-label="New user details" tabIndex={0}>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="invite-username">Username</FieldLabel>
                  <Input
                    id="invite-username"
                    type="text"
                    autoComplete="off"
                    placeholder="person@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <FieldDescription>No email will be sent.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-name">Name</FieldLabel>
                  <Input
                    id="invite-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-account-role">
                    Account role
                  </FieldLabel>
                  <Select
                    value={role}
                    onValueChange={(value) => setRole(value as UserRole)}
                  >
                    <SelectTrigger id="invite-account-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Standard user</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-operational-role">
                    Operational role
                  </FieldLabel>
                  <Input
                    id="invite-operational-role"
                    required
                    value={operationalRole}
                    onChange={(e) => setOperationalRole(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-shift">Shift</FieldLabel>
                  <Input
                    id="invite-shift"
                    required
                    value={shift}
                    onChange={(e) => setShift(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-plant">Plant</FieldLabel>
                  <Input
                    id="invite-plant"
                    required
                    value={plant}
                    onChange={(e) => setPlant(e.target.value)}
                  />
                </Field>
              </div>
              {role === "admin" ? (
                <Field>
                  <FieldLabel htmlFor="invite-step-up">
                    Your authenticator code
                  </FieldLabel>
                  <Input
                    id="invite-step-up"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={stepUpCode}
                    onChange={(e) => setStepUpCode(e.target.value)}
                  />
                  <FieldDescription>
                    Administrator accounts must configure their own MFA when
                    activating.
                  </FieldDescription>
                </Field>
              ) : null}
              <Field>
                <FieldLabel>Machine access</FieldLabel>
                <div className="grid max-h-48 gap-2 overflow-y-auto border border-border p-3 sm:grid-cols-2">
                  {machines.map((machine) => (
                    <label
                      key={machine.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={machineIds.includes(machine.id)}
                        onCheckedChange={(checked) =>
                          setMachineIds((current) =>
                            checked
                              ? [...current, machine.id]
                              : current.filter((id) => id !== machine.id),
                          )
                        }
                      />
                      {machine.name}
                    </label>
                  ))}
                </div>
              </Field>
            </FieldGroup>
            {error ? <ErrorNotice error={error} /> : null}
            </div>
            <DialogFooter className="shrink-0 border-t border-border pt-3">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Generating…" : "Generate activation link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function UserInviteDialog(props: Parameters<typeof UserInviteDialogEditor>[0]) {
  // Closing unmounts the credential-bearing draft, including its one-time link.
  return props.open ? <UserInviteDialogEditor {...props} /> : null;
}
