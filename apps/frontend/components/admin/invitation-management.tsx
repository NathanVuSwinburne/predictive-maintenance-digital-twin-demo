"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useDataProvider } from "@/hooks/use-data-provider";
import { ErrorNotice } from "@/components/feedback/error-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/domain/presentation";
import type {
  UserInvitationResult,
  UserInvitationSummary,
} from "@/lib/domain/types";
import {
  toUserFacingError,
  type UserFacingError,
} from "@/lib/errors/user-facing-error";

type LinkAction = {
  kind: "revoke" | "replace";
  invitation: UserInvitationSummary;
};
const statusLabels = {
  pending: "Pending",
  expired: "Expired",
  accepted: "Activated",
  revoked: "Revoked",
};

export function InvitationManagement({ refreshKey }: { refreshKey: number }) {
  const provider = useDataProvider();
  const [invitations, setInvitations] = useState<UserInvitationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<UserFacingError | null>(null);
  const [action, setAction] = useState<LinkAction | null>(null);
  const [stepUpCode, setStepUpCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<UserFacingError | null>(null);
  const [result, setResult] = useState<UserInvitationResult | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setInvitations(await provider.listUserInvitations());
    } catch (error) {
      setLoadError(
        toUserFacingError(error, "data.load", {
          title: "Couldn’t load activation links",
          message: "Try again to see the latest link statuses.",
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  function close() {
    if (saving) return;
    setAction(null);
    setResult(null);
    setStepUpCode("");
    setActionError(null);
  }

  async function apply() {
    if (!action) return;
    setSaving(true);
    setActionError(null);
    try {
      if (action.kind === "revoke") {
        const updated = await provider.revokeUserInvitation(
          action.invitation.id,
        );
        setInvitations((rows) =>
          rows.map((row) => (row.id === updated.id ? updated : row)),
        );
        setAction(null);
        toast.success("Activation link revoked");
      } else {
        const created = await provider.replaceUserInvitation(
          action.invitation.id,
          action.invitation.role === "admin" ? stepUpCode : undefined,
        );
        setResult(created);
        setStepUpCode("");
        setInvitations((rows) =>
          rows.map((row) =>
            row.id === action.invitation.id
              ? { ...row, status: "revoked" }
              : row,
          ),
        );
        void load();
      }
    } catch (error) {
      setActionError(
        toUserFacingError(error, "data.save", {
          title: "Activation link could not be updated",
          message: "Refresh the activation links before trying again.",
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  const activationUrl = result
    ? new URL(result.activationUrl, window.location.origin).toString()
    : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activation links</CardTitle>
        <CardDescription>
          Review and manage generated links. Saved links cannot be retrieved and
          can only be replaced.
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || saving}
            onClick={() => void load()}
          >
            Refresh links
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadError ? (
          <ErrorNotice
            error={loadError}
            actionLabel="Try Again"
            onAction={() => void load()}
          />
        ) : null}
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading activation links…
          </p>
        ) : null}
        {!loading && !loadError && !invitations.length ? (
          <p className="text-sm text-muted-foreground">
            No activation links yet. Use Create user to generate one.
          </p>
        ) : null}
        {invitations.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => {
                const status =
                  invitation.status === "pending" &&
                  new Date(invitation.expiresAt).getTime() <= now
                    ? "expired"
                    : invitation.status;
                const editable = status === "pending" || status === "expired";
                return (
                  <TableRow key={invitation.id}>
                    <TableCell>
                      <p className="font-medium">{invitation.name}</p>
                      <p className="text-muted-foreground">
                        {invitation.email}
                      </p>
                    </TableCell>
                    <TableCell>
                      {invitation.role === "admin" ? "Admin" : "Standard user"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{statusLabels[status]}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <time dateTime={invitation.expiresAt}>
                        {formatDateTime(invitation.expiresAt)}
                      </time>
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => {
                              setAction({ kind: "replace", invitation });
                              setActionError(null);
                            }}
                          >
                            Replace link
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={saving}
                            onClick={() => {
                              setAction({ kind: "revoke", invitation });
                              setActionError(null);
                            }}
                          >
                            Revoke
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          No actions
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
      <Dialog
        open={Boolean(action)}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden"
          showCloseButton={!saving}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {result
                ? "Replacement activation link"
                : action?.kind === "revoke"
                  ? "Revoke activation link?"
                  : "Replace activation link?"}
            </DialogTitle>
            <DialogDescription>
              {result
                ? "Copy this link now and give it to the user securely. No email will be sent."
                : action?.kind === "revoke"
                  ? `${action.invitation.name} cannot use this link after it is revoked. Existing accounts are not affected.`
                  : "The old link will stop working. A new link with a fresh expiry will be shown once."}
            </DialogDescription>
          </DialogHeader>
          <div
            className="min-h-0 space-y-3 overflow-y-auto"
            role="region"
            aria-label="Activation link settings"
            tabIndex={0}
          >
            {actionError ? <ErrorNotice error={actionError} /> : null}
            {result ? (
              <>
                <p className="select-all break-all border bg-muted p-3 text-sm">
                  {activationUrl}
                </p>
                <p className="text-sm">
                  Expires {formatDateTime(result.expiresAt)}
                </p>
              </>
            ) : action?.kind === "replace" &&
              action.invitation.role === "admin" ? (
              <div className="space-y-2">
                <Label htmlFor="replacement-code">
                  Your authenticator code
                </Label>
                <Input
                  id="replacement-code"
                  value={stepUpCode}
                  onChange={(event) => setStepUpCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <p className="text-sm text-muted-foreground">
                  Use the current code from your own authenticator app.
                </p>
              </div>
            ) : null}
          </div>
          <DialogFooter className="shrink-0">
            {result ? (
              <>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(activationUrl!);
                      toast.success("Activation link copied");
                    } catch (error) {
                      setActionError(
                        toUserFacingError(error, "clipboard.copy"),
                      );
                    }
                  }}
                >
                  Copy link
                </Button>
                <Button onClick={close}>Done</Button>
              </>
            ) : (
              <>
                <Button variant="outline" disabled={saving} onClick={close}>
                  Cancel
                </Button>
                <Button
                  variant={
                    action?.kind === "revoke" ? "destructive" : "default"
                  }
                  disabled={
                    saving ||
                    (action?.kind === "replace" &&
                      action.invitation.role === "admin" &&
                      stepUpCode.trim().length < 6)
                  }
                  onClick={() => void apply()}
                >
                  {saving
                    ? "Saving…"
                    : action?.kind === "revoke"
                      ? "Revoke link"
                      : "Generate replacement"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
