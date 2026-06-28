"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CopyIcon,
  KeyIcon,
  LockKeyIcon,
  QrCodeIcon,
  ShieldCheckIcon,
  ShieldSlashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth/auth-context";
import { useDataProvider } from "@/hooks/use-data-provider";
import type {
  TotpBackupCodesResult,
  TotpSetupResult,
  TotpStatus,
} from "@/lib/domain/types";

type PasswordAction = "enable" | "disable" | "regenerate";

const passwordActionCopy: Record<
  PasswordAction,
  { title: string; description: string; submitLabel: string }
> = {
  enable: {
    title: "Confirm your password",
    description:
      "Re-enter your password before creating a new authenticator setup.",
    submitLabel: "Start setup",
  },
  disable: {
    title: "Disable authenticator app",
    description:
      "Re-enter your password to turn off TOTP. Existing backup codes will stop working.",
    submitLabel: "Disable TOTP",
  },
  regenerate: {
    title: "Regenerate backup codes",
    description:
      "Re-enter your password to replace all existing backup codes.",
    submitLabel: "Generate new codes",
  },
};

function statusFromBackupResult(result: TotpBackupCodesResult): TotpStatus {
  return {
    enabled: true,
    backupCodeCount: result.backupCodeCount,
    unusedBackupCodeCount: result.unusedBackupCodeCount,
  };
}

export function TotpSecurityPanel() {
  const provider = useDataProvider();
  const { activePersona } = useAuth();

  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [setup, setSetup] = useState<TotpSetupResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [passwordAction, setPasswordAction] = useState<PasswordAction | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const backupCodesVisible = backupCodes.length > 0;
  const activeActionCopy = passwordAction
    ? passwordActionCopy[passwordAction]
    : null;

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      setStatus(await provider.getTotpStatus());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load TOTP status";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    let active = true;

    async function renderQrCode() {
      if (!setup) {
        setQrDataUrl(null);
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(setup.otpauthUri, {
          errorCorrectionLevel: "M",
          margin: 2,
          scale: 7,
        });
        if (active) {
          setQrDataUrl(dataUrl);
        }
      } catch {
        if (active) {
          setQrDataUrl(null);
        }
      }
    }

    void renderQrCode();

    return () => {
      active = false;
    };
  }, [setup]);

  const isProtectedActionDisabled = useMemo(
    () => backupCodesVisible || isLoading,
    [backupCodesVisible, isLoading],
  );

  function openPasswordDialog(action: PasswordAction) {
    setPasswordAction(action);
    setPassword("");
    setPasswordError(null);
  }

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch {
      toast.error("Unable to copy to clipboard");
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!passwordAction) {
      return;
    }

    setPasswordError(null);
    setIsSubmittingPassword(true);

    try {
      if (passwordAction === "enable") {
        const nextSetup = await provider.setupTotp({ password });
        setSetup(nextSetup);
        setBackupCodes([]);
        setConfirmCode("");
        toast.success("Authenticator setup started");
      } else if (passwordAction === "disable") {
        const nextStatus = await provider.disableTotp({ password });
        setStatus(nextStatus);
        setSetup(null);
        setBackupCodes([]);
        setConfirmCode("");
        toast.success("TOTP disabled");
      } else {
        const result = await provider.regenerateTotpBackupCodes({ password });
        setStatus(statusFromBackupResult(result));
        setBackupCodes(result.backupCodes);
        toast.success("Backup codes regenerated");
      }

      setPasswordAction(null);
      setPassword("");
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : "Unable to confirm password",
      );
    } finally {
      setIsSubmittingPassword(false);
    }
  }

  async function confirmSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!setup) {
      return;
    }

    setConfirmError(null);
    setIsConfirming(true);

    try {
      const result = await provider.confirmTotp({
        setupToken: setup.setupToken,
        code: confirmCode,
      });
      setStatus(statusFromBackupResult(result));
      setBackupCodes(result.backupCodes);
      setSetup(null);
      setConfirmCode("");
      toast.success("TOTP enabled");
    } catch (error) {
      setConfirmError(
        error instanceof Error ? error.message : "Unable to verify TOTP code",
      );
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_1fr]">
          <CardHeader className="border-b border-border bg-card/80 lg:border-r lg:border-b-0">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="size-5 text-primary" />
              <CardTitle className="text-base">Account security</CardTitle>
            </div>
            <CardDescription>
              Manage the authenticator app and recovery codes for{" "}
              {activePersona?.email ?? "your account"}.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 p-5">
            {isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-9 w-36" />
              </div>
            ) : loadError ? (
              <Alert variant="destructive">
                <WarningCircleIcon />
                <AlertTitle>Unable to load security settings</AlertTitle>
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        Authenticator app
                      </span>
                      <Badge variant={status?.enabled ? "default" : "secondary"}>
                        {status?.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {status?.enabled
                        ? `${status.unusedBackupCodeCount} of ${status.backupCodeCount} backup codes remain unused.`
                        : "Add TOTP to require a time-based code after password sign-in."}
                    </p>
                  </div>

                  {status?.enabled ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={isProtectedActionDisabled}
                        onClick={() => openPasswordDialog("regenerate")}
                      >
                        <ArrowClockwiseIcon data-icon="inline-start" />
                        Regenerate codes
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={isProtectedActionDisabled}
                        onClick={() => openPasswordDialog("disable")}
                      >
                        <ShieldSlashIcon data-icon="inline-start" />
                        Disable
                      </Button>
                    </div>
                  ) : (
                    <Button
                      disabled={isProtectedActionDisabled}
                      onClick={() => openPasswordDialog("enable")}
                    >
                      <LockKeyIcon data-icon="inline-start" />
                      Enable TOTP
                    </Button>
                  )}
                </div>

                {backupCodesVisible && (
                  <Alert>
                    <CheckCircleIcon />
                    <AlertTitle>Save these backup codes now</AlertTitle>
                    <AlertDescription>
                      Each code works once. Store them somewhere safe before
                      leaving this page.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </div>
      </Card>

      {setup && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <QrCodeIcon className="size-5 text-primary" />
              <CardTitle className="text-sm">Connect an authenticator app</CardTitle>
            </div>
            <CardDescription>
              Scan the QR code, or copy the setup key into your authenticator
              app, then enter the current 6-digit code.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[260px_1fr]">
            <div className="grid place-items-center border border-border bg-white p-4">
              {qrDataUrl ? (
                <Image
                  src={qrDataUrl}
                  alt="TOTP setup QR code"
                  width={220}
                  height={220}
                  unoptimized
                />
              ) : (
                <Skeleton className="size-[220px]" />
              )}
            </div>

            <form className="flex flex-col gap-4" onSubmit={confirmSetup}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="totp-secret">Setup key</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="totp-secret"
                      value={setup.secret}
                      readOnly
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void copyText(setup.secret, "Setup key copied")
                      }
                    >
                      <CopyIcon data-icon="inline-start" />
                      Copy
                    </Button>
                  </div>
                  <FieldDescription>
                    Use this key only if you cannot scan the QR code.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="confirm-totp-code">
                    Current authenticator code
                  </FieldLabel>
                  <InputOTP
                    id="confirm-totp-code"
                    maxLength={6}
                    value={confirmCode}
                    onChange={setConfirmCode}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </Field>
              </FieldGroup>

              {confirmError && (
                <Alert variant="destructive">
                  <WarningCircleIcon />
                  <AlertTitle>Unable to enable TOTP</AlertTitle>
                  <AlertDescription>{confirmError}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={isConfirming || confirmCode.length !== 6}
                >
                  <ShieldCheckIcon data-icon="inline-start" />
                  {isConfirming ? "Verifying..." : "Verify and enable"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isConfirming}
                  onClick={() => {
                    setSetup(null);
                    setConfirmCode("");
                    setConfirmError(null);
                  }}
                >
                  Cancel setup
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {backupCodesVisible && (
        <Card className="border-primary/40">
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyIcon className="size-5 text-primary" />
              <CardTitle className="text-sm">Backup codes</CardTitle>
            </div>
            <CardDescription>
              These codes are shown once. Copy or store them before continuing.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {backupCodes.map((code) => (
                <div
                  key={code}
                  className="border border-border bg-muted/40 p-2 text-center font-mono text-xs"
                >
                  {code}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  void copyText(backupCodes.join("\n"), "Backup codes copied")
                }
              >
                <CopyIcon data-icon="inline-start" />
                Copy all
              </Button>
              <Button onClick={() => setBackupCodes([])}>
                <CheckCircleIcon data-icon="inline-start" />
                I have saved these codes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={Boolean(passwordAction)}
        onOpenChange={(open) => {
          if (!open && !isSubmittingPassword) {
            setPasswordAction(null);
            setPassword("");
            setPasswordError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeActionCopy?.title}</DialogTitle>
            <DialogDescription>{activeActionCopy?.description}</DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-4" onSubmit={submitPassword}>
            <Field>
              <FieldLabel htmlFor="security-password">Password</FieldLabel>
              <Input
                id="security-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoFocus
                required
              />
            </Field>

            {passwordError && (
              <Alert variant="destructive">
                <WarningCircleIcon />
                <AlertTitle>Confirmation failed</AlertTitle>
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmittingPassword}
                onClick={() => {
                  setPasswordAction(null);
                  setPassword("");
                  setPasswordError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingPassword}>
                {isSubmittingPassword
                  ? "Confirming..."
                  : activeActionCopy?.submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
