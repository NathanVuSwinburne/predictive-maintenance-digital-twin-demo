"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PlugsIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { ErrorNotice } from "@/components/feedback/error-notice";
import { LiveStateBadge } from "@/components/live/live-state-badge";
import { CMTK_NOT_REACHABLE_MESSAGE, ConnectMachineForm } from "@/components/monitor/connect-machine-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataProvider } from "@/hooks/use-data-provider";
import { formatDateTime } from "@/lib/domain/presentation";
import type { CmtkConnectResult, CmtkMachine, CmtkSetup } from "@/lib/domain/types";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";

export const CMTK_ENV_NAMES = [
  "CMTK_MQTT_HOST",
  "CMTK_MQTT_USERNAME",
  "CMTK_MQTT_PASSWORD",
  "CMTK_MQTT_TOPIC",
] as const;

export function monitorPathFor(entityId: string) {
  return `/monitor/${encodeURIComponent(entityId)}`;
}

/** Where /monitor should go for a given setup, or null when it should render a page itself. */
export function autoRedirectTarget(setup: CmtkSetup, chooseRequested: boolean) {
  if (!chooseRequested && setup.machines.length === 1) {
    return monitorPathFor(setup.machines[0].entityId);
  }
  return null;
}

/** Shown above the connect form when the server has no CMTK connection yet; the form itself stays usable. */
export function NotConfiguredCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PlugsIcon aria-hidden="true" />
          The server isn&apos;t set up to listen to the CMTK yet
        </CardTitle>
        <CardDescription className="text-sm">
          Enter where the CMTK publishes its readings in the connection details below and start
          monitoring. The details are saved with the machine.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <details className="text-sm">
          <summary className="cursor-pointer py-1 font-medium focus-visible:outline-2 focus-visible:outline-ring">
            For the operator: set the connection on the server instead
          </summary>
          <p className="mt-2 text-muted-foreground">
            Set these environment variables on the backend and restart it; they then prefill the form for every machine:
          </p>
          <ul className="mt-2 flex flex-col gap-1 font-mono text-xs">
            {CMTK_ENV_NAMES.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}

export function MachineChooser({ machines }: { machines: CmtkMachine[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">Choose a machine to monitor</h2>
        <p className="text-sm text-muted-foreground">
          {machines.length} machines are connected to the CMTK.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {machines.map((machine) => (
          <li key={machine.entityId}>
            <Link
              href={monitorPathFor(machine.entityId)}
              className="block h-full border border-border bg-card p-4 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
            >
              <p className="text-base font-semibold">{machine.name}</p>
              {machine.description ? (
                <p className="text-sm text-muted-foreground">{machine.description}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <LiveStateBadge state={machine.state} />
                <span>
                  Last reading: {machine.lastMessageAt ? formatDateTime(machine.lastMessageAt) : "none yet"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <div>
        <Button asChild variant="outline" size="sm">
          <Link href="/monitor?connect=1">Connect another machine</Link>
        </Button>
      </div>
    </div>
  );
}

/** Loads the CMTK setup and decides between not-configured, connect, chooser, or redirect. */
export function MonitorLanding() {
  const provider = useDataProvider();
  const router = useRouter();
  const searchParams = useSearchParams();
  const chooseRequested = searchParams.get("choose") === "1";
  const connectRequested = searchParams.get("connect") === "1";
  const [setup, setSetup] = useState<CmtkSetup | null>(null);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await provider.getCmtkSetup();
      setSetup(next);
      setError(null);
    } catch (caught) {
      setError(
        toUserFacingError(caught, "data.load", {
          title: "Live monitor could not be loaded",
          message: "The CMTK setup is unavailable right now.",
        }),
      );
    } finally {
      setIsLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void load();
  }, [load]);

  const redirectTarget = setup && !connectRequested ? autoRedirectTarget(setup, chooseRequested) : null;

  useEffect(() => {
    if (redirectTarget) router.replace(redirectTarget);
  }, [redirectTarget, router]);

  function onConnected(result: CmtkConnectResult) {
    if (result.connection.success) {
      toast.success(`${result.machine.name} is being monitored`);
    } else {
      toast.message(`${result.machine.name} is set up`, { description: CMTK_NOT_REACHABLE_MESSAGE });
    }
    router.push(monitorPathFor(result.machine.entityId));
  }

  if (isLoading && !setup) {
    return <p className="text-sm text-muted-foreground">Checking the CMTK setup…</p>;
  }

  if (!setup) {
    return <ErrorNotice error={error ?? toUserFacingError(null, "data.load")} actionLabel="Try again" onAction={() => void load()} />;
  }

  if (!setup.configured && setup.machines.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <NotConfiguredCard />
        <ConnectMachineForm setup={setup} onConnected={onConnected} />
      </div>
    );
  }

  if (redirectTarget) {
    return <p className="text-sm text-muted-foreground">Opening {setup.machines[0]?.name}…</p>;
  }

  if (setup.machines.length === 0 || connectRequested) {
    return (
      <div className="flex flex-col gap-4">
        {error ? <ErrorNotice error={error} /> : null}
        <ConnectMachineForm setup={setup} onConnected={onConnected} />
        {setup.machines.length > 0 ? (
          <div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/monitor?choose=1">Back to connected machines</Link>
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return <MachineChooser machines={setup.machines} />;
}
