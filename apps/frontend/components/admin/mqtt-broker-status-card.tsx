import { ErrorNotice } from "@/components/feedback/error-notice";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/domain/presentation";
import type { MqttHealth } from "@/lib/domain/types";
import type { UserFacingError } from "@/lib/errors/user-facing-error";

type MqttBrokerStatusCardProps = {
  health: MqttHealth | null;
  isLoading?: boolean;
  error?: UserFacingError | null;
  lastCheckedAt?: Date | null;
};

type BrokerStatus = {
  label: string;
  variant: "default" | "secondary" | "destructive";
};

function brokerStatus(state: MqttHealth["broker"]["state"]): BrokerStatus {
  switch (state) {
    case "connected":
      return { label: "Running", variant: "secondary" };
    case "connecting":
      return { label: "Starting", variant: "default" };
    case "disconnected":
      return { label: "Not running", variant: "destructive" };
    default:
      return { label: "Not configured", variant: "default" };
  }
}

function timestamp(value: string | null | undefined) {
  return value ? formatDateTime(value) : "-";
}

export function MqttBrokerStatusCard({
  health,
  isLoading = false,
  error = null,
  lastCheckedAt = null,
}: MqttBrokerStatusCardProps) {
  const status = health ? brokerStatus(health.broker.state) : null;

  return (
    <Card aria-live="polite">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm" role="heading" aria-level={2}>
            MQTT broker status
          </CardTitle>
          {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <ErrorNotice error={error} /> : null}

        {!health && isLoading ? <Skeleton className="h-20 w-full" /> : null}

        {!health && !isLoading ? (
          <p className="text-sm text-muted-foreground">
            Broker status is unavailable.
          </p>
        ) : null}

        {health && status ? (
          <>
            <div>
              <p className="text-2xl font-semibold tracking-tight">{status.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {health.broker.state === "connected"
                  ? "The application is connected to the MQTT broker."
                  : health.broker.state === "connecting"
                    ? "The application is trying to connect to the MQTT broker."
                    : health.broker.state === "disconnected"
                      ? "The application is not connected to the MQTT broker."
                      : "No MQTT broker connection has been reported."}
              </p>
            </div>
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <span>Connected: {timestamp(health.broker.connectedAt)}</span>
              <span>
                Last checked: {lastCheckedAt ? timestamp(lastCheckedAt.toISOString()) : "-"}
              </span>
            </div>
            {health.broker.lastError ? (
              <p className="text-xs text-destructive">{health.broker.lastError}</p>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
