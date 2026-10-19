"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { SignInIcon } from "@phosphor-icons/react";

import { AuthPageBackground } from "@/components/auth/auth-page-background";
import { DemoDisclaimer } from "@/components/demo/demo-disclaimer";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/components/auth/auth-context";
import { ErrorNotice } from "@/components/feedback/error-notice";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/data/fastapi-provider";
import {
  toUserFacingError,
  type UserFacingError,
} from "@/lib/errors/user-facing-error";

type LoginFormProps = {
  nextPath: string;
  setupRequired?: boolean;
};

export function LoginForm({ nextPath, setupRequired = false }: LoginFormProps) {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<UserFacingError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  async function completeLogin(username: string, secret: string) {
    const result = await login({ email: username, password: secret });
    if (result.requiresMfa) {
      router.push(`/login/mfa?next=${encodeURIComponent(nextPath)}`);
    } else {
      router.push(nextPath);
      router.refresh();
    }
  }

  async function enterDemo() {
    setError(null);
    setIsSubmitting(true);
    try {
      await completeLogin("demo@portfolio.local", "demo");
    } catch (submitError: unknown) {
      setError(toUserFacingError(submitError, "auth.sign-in"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await completeLogin(email, password);
    } catch (submitError: unknown) {
      const detail = submitError instanceof ApiError && submitError.status === 403 ? submitError.detail : null;
      const code = detail && typeof detail === "object" && "code" in detail ? detail.code : null;
      if (code === "account_suspended" || code === "account_deactivated") {
        setError({ title: code === "account_suspended" ? "Account suspended" : "Account deactivated", message: "Contact an administrator to restore access." });
      } else {
        setError(toUserFacingError(submitError, "auth.sign-in"));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    {isDemoMode && <div className="fixed inset-x-0 top-0 z-10"><DemoDisclaimer /></div>}
    <AuthPageBackground>
      <Card className="relative w-full max-w-5xl">
        <div className="absolute top-3 right-3 z-10"><ThemeToggle /></div>
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
            {isDemoMode ? (
              <div className="mb-6 border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium">Portfolio demo ready</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ten fictional machines, live replayed sensor feeds, forecasts,
                  and a scripted AI Assistant. No account, backend or API key.
                </p>
                <Button className="mt-3 w-full" size="lg" type="button" onClick={enterDemo} disabled={isSubmitting}>
                  <SignInIcon data-icon="inline-start" />
                  {isSubmitting ? "Opening workspace…" : "Explore live demo"}
                </Button>
              </div>
            ) : null}
            {setupRequired ? (
              <div className="mb-5 border border-border bg-muted p-4 text-sm">
                <p className="font-medium">Administrator setup required</p>
                <p className="mt-1 text-muted-foreground">
                  Run the server bootstrap command to generate the one-time
                  administrator activation link.
                </p>
              </div>
            ) : null}
            <form className="flex flex-col gap-5" onSubmit={onSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Username</FieldLabel>
                  <Input
                    id="email"
                    type="text"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
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

              {error ? <ErrorNotice error={error} /> : null}

              <Button type="submit" size="lg" disabled={isSubmitting}>
                <SignInIcon data-icon="inline-start" />
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </div>
      </Card>
    </AuthPageBackground>
    </>
  );
}
