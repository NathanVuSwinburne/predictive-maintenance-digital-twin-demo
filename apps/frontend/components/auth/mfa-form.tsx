"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheckIcon } from "@phosphor-icons/react";

import { AuthPageBackground } from "@/components/auth/auth-page-background";
import { useAuth } from "@/components/auth/auth-context";
import { ErrorNotice } from "@/components/feedback/error-notice";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";

type MfaFormProps = {
  nextPath: string;
};

export function MfaForm({ nextPath }: MfaFormProps) {
  const router = useRouter();
  const {
    isAuthenticated,
    isBootstrapping,
    pendingMfaMethods,
    pendingMfaToken,
    verifyMfa,
  } = useAuth();

  const [selectedMethod, setSelectedMethod] = useState<"totp" | "backup-code">(
    "totp",
  );
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [error, setError] = useState<UserFacingError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isBootstrapping || isAuthenticated) {
      return;
    }

    if (!pendingMfaToken) {
      router.replace("/login");
    }
  }, [isAuthenticated, isBootstrapping, pendingMfaToken, router]);

  const method = pendingMfaMethods.includes(selectedMethod)
    ? selectedMethod
    : pendingMfaMethods.includes("totp")
      ? "totp"
      : pendingMfaMethods.includes("backup-code")
        ? "backup-code"
        : selectedMethod;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await verifyMfa({
        method,
        code: method === "totp" ? totpCode : backupCode,
      });

      router.push(nextPath);
      router.refresh();
    } catch (submitError) {
      setError(toUserFacingError(submitError, "auth.verify-mfa"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthPageBackground>
      <Card className="w-full max-w-lg p-6">
        <CardHeader className="text-center">
          <CardTitle className="text-lg">Verify your identity</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Enter the code from your authenticator app to continue.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-6 pb-2">
          <form className="flex flex-col gap-6" onSubmit={onSubmit}>
            <FieldGroup>
              {method === "totp" ? (
                <Field className="items-center text-center">
                  <FieldLabel className="sr-only" htmlFor="totp-code">
                    Authenticator code
                  </FieldLabel>
                  <InputOTP
                    id="totp-code"
                    maxLength={6}
                    value={totpCode}
                    onChange={setTotpCode}
                    autoFocus
                    containerClassName="justify-center"
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
              ) : (
                <Field className="items-center text-center">
                  <FieldLabel className="sr-only" htmlFor="backup-code">
                    Backup code
                  </FieldLabel>
                  <Input
                    id="backup-code"
                    className="max-w-xs"
                    value={backupCode}
                    onChange={(event) => setBackupCode(event.target.value)}
                    placeholder="Enter backup code"
                    autoFocus
                  />
                  <FieldDescription className="text-center text-xs text-muted-foreground/80">
                    Use a one-time backup code when authenticator is
                    unavailable.
                  </FieldDescription>
                </Field>
              )}
            </FieldGroup>

            {error ? <ErrorNotice error={error} /> : null}

            <Button
              type="submit"
              size="lg"
              className="mx-auto w-full max-w-sm"
              disabled={isSubmitting}
            >
              <ShieldCheckIcon data-icon="inline-start" />
              {isSubmitting ? "Verifying…" : "Complete sign in"}
            </Button>

            <div className="mx-auto grid w-full max-w-sm gap-2 border-t border-border pt-4">
              {pendingMfaMethods.includes("totp") &&
              pendingMfaMethods.includes("backup-code") ? (
                method === "totp" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={() => setSelectedMethod("backup-code")}
                  >
                    Use a backup code instead
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={() => setSelectedMethod("totp")}
                  >
                    Use authenticator app instead
                  </Button>
                )
              ) : null}

              <Button
                variant="outline"
                size="lg"
                className="w-full bg-muted/50 hover:bg-muted"
                asChild
              >
                <Link href="/login">Back to sign in</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </AuthPageBackground>
  );
}
