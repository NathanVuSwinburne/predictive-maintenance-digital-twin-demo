"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SignInIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { useAuth } from "@/components/auth/auth-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getValidErrorMessage } from "@/lib/utils";
import { DemoDisclaimer } from "@/components/demo/demo-disclaimer";

type LoginFormProps = {
  nextPath: string;
};

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  async function completeLogin(email: string, password: string) {
    const result = await login({ email, password });
    if (result.requiresMfa) {
      router.push(`/login/mfa?next=${encodeURIComponent(nextPath)}`);
    } else {
      router.push(nextPath);
      router.refresh();
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await completeLogin(email, password);
    } catch (submitError: unknown) {
      setError(getValidErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function enterDemo() {
    setError(null);
    setIsSubmitting(true);
    try {
      await completeLogin("demo@portfolio.local", "demo");
    } catch (submitError: unknown) {
      setError(getValidErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_2%_4%,color-mix(in_oklch,var(--secondary)_45%,transparent)_0,transparent_38%),radial-gradient(circle_at_98%_96%,color-mix(in_oklch,var(--primary)_42%,transparent)_0,transparent_42%),repeating-linear-gradient(120deg,color-mix(in_oklch,var(--border)_45%,transparent)_0,color-mix(in_oklch,var(--border)_45%,transparent)_1px,transparent_1px,transparent_14px),linear-gradient(var(--background),var(--background))]">
      {isDemoMode && <DemoDisclaimer />}
      <div className="grid flex-1 place-items-center p-6">
      <Card className="w-full max-w-5xl">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col items-start justify-center gap-2 border-b border-border p-8 lg:border-r lg:border-b-0">
            <CardTitle className="text-lg">
              Predictive Maintenance Digital Twin
            </CardTitle>
            <CardDescription className="text-sm">
              Sign in to access your personalised dashboard, machines, history,
              AI assistant and simulator.
            </CardDescription>
          </div>

          <CardContent className="p-8">
            {isDemoMode && (
              <div className="mb-6 border border-primary/35 bg-primary/5 p-5">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">No setup required</p>
                <p className="mb-4 text-sm text-muted-foreground">Explore ten fictional machines, forecasts, simulations, and scripted agent traces.</p>
                <Button className="w-full" size="lg" type="button" onClick={enterDemo} disabled={isSubmitting}>
                  <SignInIcon data-icon="inline-start" />
                  {isSubmitting ? "Opening demo..." : "Explore live demo"}
                </Button>
              </div>
            )}
            <form className="flex flex-col gap-5" onSubmit={onSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                  <FieldDescription>
                    Use your authorised work account.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </Field>
              </FieldGroup>

              {error && (
                <Alert variant="destructive">
                  <WarningCircleIcon />
                  <AlertTitle>Sign-in failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" size="lg" disabled={isSubmitting}>
                <SignInIcon data-icon="inline-start" />
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </div>
      </Card>
      </div>
    </div>
  );
}
