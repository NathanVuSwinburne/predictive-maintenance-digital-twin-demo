"use client"

import { FormEvent, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  LockKeyOpenIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"

import { useAuth } from "@/components/auth/auth-context"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type MfaFormProps = {
  nextPath: string
}

export function MfaForm({ nextPath }: MfaFormProps) {
  const router = useRouter()
  const { isAuthenticated, isBootstrapping, pendingMfaMethods, pendingMfaToken, verifyMfa } =
    useAuth()

  const [method, setMethod] = useState<"totp" | "backup-code">("totp")
  const [totpCode, setTotpCode] = useState("")
  const [backupCode, setBackupCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isBootstrapping || isAuthenticated) {
      return
    }

    if (!pendingMfaToken) {
      router.replace("/login")
    }
  }, [isAuthenticated, isBootstrapping, pendingMfaToken, router])

  useEffect(() => {
    if (!pendingMfaMethods.includes(method) && pendingMfaMethods.length > 0) {
      setMethod(pendingMfaMethods[0])
    }
  }, [method, pendingMfaMethods])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await verifyMfa({
        method,
        code: method === "totp" ? totpCode : backupCode,
      })

      router.push(nextPath)
      router.refresh()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to verify MFA")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_8%_10%,_var(--accent)_0,_transparent_35%),radial-gradient(circle_at_90%_80%,_var(--secondary)_0,_transparent_40%),linear-gradient(var(--background),var(--background))] p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-lg">Multi-factor Verification</CardTitle>
          <CardDescription className="text-xs">
            Confirm your identity with authenticator or backup verification code.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form className="flex flex-col gap-5" onSubmit={onSubmit}>
            <FieldGroup>
              <Field orientation="horizontal">
                <FieldTitle id="verification-method">Verification Method</FieldTitle>
                <ToggleGroup
                  type="single"
                  value={method}
                  onValueChange={(value) => {
                    if (value === "totp" || value === "backup-code") {
                      setMethod(value)
                    }
                  }}
                  aria-labelledby="verification-method"
                  spacing={2}
                >
                  {pendingMfaMethods.includes("totp") && (
                    <ToggleGroupItem value="totp">Authenticator</ToggleGroupItem>
                  )}
                  {pendingMfaMethods.includes("backup-code") && (
                    <ToggleGroupItem value="backup-code">Backup Code</ToggleGroupItem>
                  )}
                </ToggleGroup>
              </Field>

              {method === "totp" ? (
                <Field>
                  <FieldLabel htmlFor="totp-code">6-digit code</FieldLabel>
                  <InputOTP
                    id="totp-code"
                    maxLength={6}
                    value={totpCode}
                    onChange={setTotpCode}
                    autoFocus
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
                  <FieldDescription>
                    Enter the current code from your authenticator app.
                  </FieldDescription>
                </Field>
              ) : (
                <Field>
                  <FieldLabel htmlFor="backup-code">Backup code</FieldLabel>
                  <Input
                    id="backup-code"
                    value={backupCode}
                    onChange={(event) => setBackupCode(event.target.value)}
                    placeholder="Enter backup code"
                    autoFocus
                  />
                  <FieldDescription>
                    Use a one-time backup code when authenticator is unavailable.
                  </FieldDescription>
                </Field>
              )}
            </FieldGroup>

            {error && (
              <Alert variant="destructive">
                <WarningCircleIcon />
                <AlertTitle>Verification failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" size="lg" disabled={isSubmitting}>
              <ShieldCheckIcon data-icon="inline-start" />
              {isSubmitting ? "Verifying..." : "Complete sign in"}
            </Button>

            <Button variant="ghost" asChild>
              <Link href="/login">
                <LockKeyOpenIcon data-icon="inline-start" />
                Back to login
              </Link>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
