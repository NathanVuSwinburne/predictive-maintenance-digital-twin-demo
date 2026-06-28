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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await login({ email, password });
      if (result.requiresMfa) {
        router.push(`/login/mfa?next=${encodeURIComponent(nextPath)}`);
      } else {
        router.push(nextPath);
        router.refresh();
      }
    } catch (submitError: unknown) {
      setError(getValidErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_2%_4%,color-mix(in_oklch,var(--secondary)_45%,transparent)_0,transparent_38%),radial-gradient(circle_at_98%_96%,color-mix(in_oklch,var(--primary)_42%,transparent)_0,transparent_42%),repeating-linear-gradient(120deg,color-mix(in_oklch,var(--border)_45%,transparent)_0,color-mix(in_oklch,var(--border)_45%,transparent)_1px,transparent_1px,transparent_14px),linear-gradient(var(--background),var(--background))] p-6">
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
  );
}
