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
import type { MqttHealth, MqttPipelineStatus } from "@/lib/domain/types";
import type { UserFacingError } from "@/lib/errors/user-facing-error";

type MqttHealthPanelProps = {
  health: MqttHealth | null;
  isLoading?: boolean;
  error?: UserFacingError | null;
  lastCheckedAt?: Date | null;
};

const statusLabels: Record<MqttPipelineStatus, string> = {
  "not-configured": "Not configured",
  starting: "Starting",
  healthy: "Healthy",
  degraded: "Degraded",
  unhealthy: "Unhealthy",
};

function statusVariant(status: MqttPipelineStatus) {
  if (status === "unhealthy") return "destructive" as const;
  if (status === "healthy") return "secondary" as const;
  return "default" as const;
}

function stateLabel(state: string) {
  return state
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function timestamp(value: string | null | undefined) {
  return value ? formatDateTime(value) : "-";
}

export function MqttHealthPanel({
  health,
  isLoading = false,
  error = null,
  lastCheckedAt = null,
}: MqttHealthPanelProps) {
  return (
    <Card aria-live="polite">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm" role="heading" aria-level={2}>
            MQTT pipeline health
          </CardTitle>
          {health ? (
            <Badge variant={statusVariant(health.status)}>
              {statusLabels[health.status]}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <ErrorNotice error={error} /> : null}

        {!health && isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        ) : null}

        {!health && !isLoading ? (
          <p className="text-sm text-muted-foreground">
            MQTT operational status is unavailable.
          </p>
        ) : null}

        {health ? (
          <>
            <div className="border-l-2 border-border py-2 pl-3">
              <p className="font-medium">{health.summary}</p>
              <p className="text-xs text-muted-foreground">
                Target: {health.targetMachineId} · Process started:{" "}
                {timestamp(health.processStartedAt)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
          Connection freshness does not determine information-source attribution.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <section className="border border-border p-3">
                <p className="text-xs text-muted-foreground">Broker</p>
                <p className="font-medium">{stateLabel(health.broker.state)}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Connected: {timestamp(health.broker.connectedAt)}
                </p>
                {health.broker.lastError ? (
                  <p className="mt-1 text-xs text-destructive">
                    {health.broker.lastError}
                  </p>
                ) : null}
              </section>

              <section className="border border-border p-3">
                <p className="text-xs text-muted-foreground">Subscription</p>
                <p className="font-medium">
                  {stateLabel(health.subscription.state)}
                </p>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  {health.subscription.topic ?? "No topic registered"}
                  {health.subscription.qos != null
                    ? ` · QoS ${health.subscription.qos}`
                    : ""}
                </p>
                {health.subscription.lastError ? (
                  <p className="mt-1 text-xs text-destructive">
                    {health.subscription.lastError}
                  </p>
                ) : null}
              </section>

              <section className="border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Message throughput
                </p>
                <div className="font-medium tabular-nums">
                  <p>{`${health.messages.receivedPerMinute.toLocaleString("en-AU")} / min received`}</p>
                  <p>{`${health.messages.acceptedPerMinute.toLocaleString("en-AU")} / min accepted`}</p>
                  <p>
                    {health.messages.expectedPerMinute == null
                      ? "Expected rate not configured"
                      : `${health.messages.expectedPerMinute.toLocaleString("en-AU")} / min expected`}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span>
                    {health.messages.receivedTotal.toLocaleString("en-AU")}{" "}
                    received
                  </span>
                  <span>
                    {health.messages.acceptedTotal.toLocaleString("en-AU")}{" "}
                    accepted
                  </span>
                  <span>
                    {health.messages.invalidTotal.toLocaleString("en-AU")}{" "}
                    invalid
                  </span>
                  <span>
                    {health.messages.rejectedTotal.toLocaleString("en-AU")}{" "}
                    rejected
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Flow: {stateLabel(health.messages.flowState)}
                </p>
              </section>

              <section className="border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Reconnect behaviour
                </p>
                <p className="font-medium">
                  {health.reconnect.abnormal ? "Abnormal activity" : "Normal"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{`${health.reconnect.attemptsTotal.toLocaleString("en-AU")} total reconnect attempts`}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {health.reconnect.attemptsInWindow} in the last five minutes
                </p>
              </section>
            </div>

            {health.messages.lastProblemReason ? (
              <div className="text-xs text-muted-foreground">
                Latest message issue: A recent message did not match the expected fields ·{" "}
                {timestamp(health.messages.lastProblemAt)}
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              This is the state of the ingestion pipeline only, and is separate from
              model readiness: messages can be arriving normally while no model is
              trained or approved to use them.
            </p>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Snapshot: {timestamp(health.observedAt)}</span>
              <span>
                Last checked:{" "}
                {lastCheckedAt ? timestamp(lastCheckedAt.toISOString()) : "-"}
              </span>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
