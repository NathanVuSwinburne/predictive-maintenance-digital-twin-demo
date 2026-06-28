"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChartLineUpIcon,
  PulseIcon,
  ShieldCheckIcon,
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
    <div className="flex min-h-screen flex-col">
      {isDemoMode && <DemoDisclaimer />}
      <div className="grid flex-1 place-items-center p-4 md:p-8">
      <Card className="panel-enter w-full max-w-6xl border-white/70 bg-card/90 dark:border-border/80">
        <div className="grid min-h-[620px] gap-0 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative flex flex-col justify-between overflow-hidden border-b border-border/70 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--primary)_10%,var(--card)),var(--card)_58%)] p-7 lg:border-r lg:border-b-0 lg:p-12">
            <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full border border-primary/10 bg-primary/[0.04]" />
            <div className="relative">
              <div className="mb-10 flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/15">
                  <PulseIcon className="size-6" weight="duotone" />
                </div>
                <div>
                  <p className="display-mark text-base font-semibold">Predictive Twin</p>
                  <p className="font-mono text-[9px] font-semibold tracking-[0.18em] text-[var(--status-healthy)]">OPERATIONS INTELLIGENCE</p>
                </div>
              </div>
              <p className="instrument-label mb-3">Operations intelligence</p>
              <CardTitle className="max-w-xl text-3xl leading-[1.08] font-semibold tracking-[-0.045em] md:text-4xl">
                See machine risk clearly. Act before downtime.
              </CardTitle>
              <CardDescription className="mt-5 max-w-lg text-sm leading-6 md:text-base">
                A calm monitoring workspace for fleet health, predictive signals,
                simulation, and maintenance decisions.
              </CardDescription>
            </div>
            <div className="relative mt-10 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {[
                [ChartLineUpIcon, "10 assets", "Fleet telemetry"],
                [PulseIcon, "Live", "Risk monitoring"],
                [ShieldCheckIcon, "Traceable", "AI decisions"],
              ].map(([Icon, value, label]) => {
                const MetricIcon = Icon as typeof PulseIcon;
                return <div key={String(label)} className="rounded-xl border border-border/70 bg-card/60 p-3.5 backdrop-blur-sm">
                  <MetricIcon className="mb-3 size-4 text-primary" weight="duotone" />
                  <p className="data-value text-sm font-semibold">{String(value)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{String(label)}</p>
                </div>;
              })}
            </div>
          </section>

          <CardContent className="flex flex-col justify-center p-7 md:p-10 lg:p-12">
            <div className="mb-7">
              <p className="instrument-label mb-2">Secure access</p>
              <h1 className="text-2xl font-semibold tracking-[-0.035em]">Enter monitoring workspace</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Use the instant portfolio demo or sign in with an authorised account.</p>
            </div>
            {isDemoMode && (
              <div className="mb-7 rounded-xl border border-primary/20 bg-primary/[0.055] p-5">
                <div className="mb-4 flex items-start gap-3">
                  <span className="mt-0.5 status-dot text-[var(--status-healthy)]" />
                  <div><p className="text-sm font-semibold">Demo environment ready</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Ten fictional machines, forecasts, simulations, and scripted agent traces. No setup or API key.</p></div>
                </div>
                <Button className="w-full" size="lg" type="button" onClick={enterDemo} disabled={isSubmitting}>
                  <SignInIcon data-icon="inline-start" />
                  {isSubmitting ? "Opening workspace..." : "Explore live demo"}
                </Button>
              </div>
            )}
            <div className="mb-5 flex items-center gap-3 text-[10px] font-medium tracking-wider text-muted-foreground"><span className="h-px flex-1 bg-border" />AUTHORISED ACCOUNT<span className="h-px flex-1 bg-border" /></div>
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
