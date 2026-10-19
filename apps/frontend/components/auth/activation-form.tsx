"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import QRCode from "qrcode";

import { AuthPageBackground } from "@/components/auth/auth-page-background";
import { useAuth } from "@/components/auth/auth-context";
import { ErrorNotice } from "@/components/feedback/error-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataProvider } from "@/hooks/use-data-provider";
import type { ActivationDetails } from "@/lib/domain/types";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";

export function ActivationForm({ token }: { token: string }) {
  const provider = useDataProvider();
  const { activateInvitation } = useAuth();
  const router = useRouter();
  const [details, setDetails] = useState<ActivationDetails | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!token) {
        setError({ title: "Activation link is missing", message: "Ask an administrator for a new activation link." });
        setLoading(false);
        return;
      }
      try {
        const next = await provider.getActivationDetails(token);
        if (!active) return;
        setDetails(next);
        if (next.otpauthUri) setQrCode(await QRCode.toDataURL(next.otpauthUri, { width: 192, margin: 1 }));
      } catch (loadError) {
        if (active) setError(toUserFacingError(loadError, "data.load", { title: "Activation link is not valid", message: "The link may have expired or already been used. Ask an administrator for a new one." }));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [provider, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setError({ title: "Passwords do not match", message: "Enter the same password in both fields." });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await activateInvitation({ token, password, totpCode: details?.requiresMfa ? totpCode : undefined });
      if (result.backupCodes.length) setBackupCodes(result.backupCodes);
      else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (submitError) {
      setError(toUserFacingError(submitError, "data.save", { title: "Account could not be activated", message: "Check the password and authenticator code, then try again." }));
    } finally {
      setSubmitting(false);
    }
  }

  if (backupCodes) {
    return <AuthPageBackground><Card className="w-full max-w-xl"><CardHeader><CardTitle>Save your recovery codes</CardTitle><CardDescription>These codes are shown once. Store them securely before continuing.</CardDescription></CardHeader><CardContent className="space-y-4"><pre className="grid grid-cols-2 gap-2 border border-border bg-muted p-4 text-sm">{backupCodes.join("\n")}</pre><Button className="w-full" onClick={() => { router.push("/dashboard"); router.refresh(); }}>I have saved these codes</Button></CardContent></Card></AuthPageBackground>;
  }

  return <AuthPageBackground><Card className="w-full max-w-2xl"><CardHeader><CardTitle>Activate your account</CardTitle><CardDescription>Set your password using the one-time link supplied by an administrator.</CardDescription></CardHeader><CardContent>{loading ? <div className="space-y-3"><Skeleton className="h-5 w-48" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : details ? <form className="space-y-5" onSubmit={submit}><div className="flex items-center justify-between border border-border p-4"><div><p className="font-medium">{details.name}</p><p className="text-sm text-muted-foreground">{details.email}</p></div><Badge>{details.role === "admin" ? "Administrator" : "Standard user"}</Badge></div>{details.requiresMfa ? <div className="grid gap-4 border border-border p-4 sm:grid-cols-[192px_1fr]">{qrCode ? <Image unoptimized src={qrCode} alt="Authenticator setup QR code" width={192} height={192} /> : <Skeleton className="size-48" />}<div className="space-y-2"><p className="font-medium">Set up an authenticator</p><p className="text-sm text-muted-foreground">Scan the QR code, or enter this secret manually:</p><code className="block break-all bg-muted p-2 text-sm">{details.totpSecret}</code></div></div> : null}<FieldGroup><Field><FieldLabel htmlFor="password">Password</FieldLabel><Input id="password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} /><FieldDescription>Use at least 12 characters.</FieldDescription></Field><Field><FieldLabel htmlFor="confirmation">Confirm password</FieldLabel><Input id="confirmation" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></Field>{details.requiresMfa ? <Field><FieldLabel htmlFor="totp">Authenticator code</FieldLabel><Input id="totp" inputMode="numeric" autoComplete="one-time-code" required value={totpCode} onChange={(e) => setTotpCode(e.target.value)} /></Field> : null}</FieldGroup>{error ? <ErrorNotice error={error} /> : null}<Button className="w-full" type="submit" disabled={submitting}>{submitting ? "Activating…" : "Activate account"}</Button></form> : error ? <ErrorNotice error={error} /> : null}</CardContent></Card></AuthPageBackground>;
}
