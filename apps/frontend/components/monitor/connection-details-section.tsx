"use client";

import { useState } from "react";
import {
  CheckCircleIcon,
  PlugsConnectedIcon,
  SpinnerIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";

import { ErrorNotice } from "@/components/feedback/error-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDataProvider } from "@/hooks/use-data-provider";
import {
  CMTK_PRESETS,
  CMTK_PRESET_LABELS,
  brokerPayload,
  connectionDraftErrors,
  formatSample,
  isConnectionDraftDirty,
  type ConnectionDraft,
} from "@/lib/domain/cmtk-connection";
import type { CmtkConnection, CmtkPreset, CmtkProbeResult } from "@/lib/domain/types";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";

type Props = {
  /** Prefix for input ids so the section can appear in a form and a dialog. */
  idPrefix: string;
  connection: CmtkConnection;
  presets: Record<CmtkPreset, string>;
  draft: ConnectionDraft;
  initial: ConnectionDraft;
  onChange: (draft: ConnectionDraft) => void;
  /** Machine the probe should evaluate the payload against, when known. */
  entityId?: string;
  /** Open on first render (used when nothing is configured yet). */
  defaultOpen: boolean;
  /** Show field errors (after a submit attempt). */
  showErrors?: boolean;
};

function probeTone(result: CmtkProbeResult) {
  if (!result.connected) return { Icon: XCircleIcon, className: "text-destructive", label: "Not connected" };
  if (result.topics.length === 0) return { Icon: WarningCircleIcon, className: "text-warning", label: "Connected, no messages yet" };
  return { Icon: CheckCircleIcon, className: "text-success", label: "Connected" };
}

/** Plain words for a path the preset expects but the sample does not contain. */
function describeMissing(preset: CmtkPreset, missing: string[]) {
  if (missing.length === 0) return `${CMTK_PRESET_LABELS[preset]}: all fields present.`;
  return `${CMTK_PRESET_LABELS[preset]}: missing ${missing.join(", ")}.`;
}

export const CUSTOM_MAPPING_HINT =
  "If your messages use different field names, set a custom mapping in Machine Registry → Add Machine Data → MQTT.";

/**
 * Broker/topic/format fields for the CMTK connection, with a "Test connection" probe.
 * Collapsed when the server already has a connection; expanded when nothing is set.
 */
export function ConnectionDetailsSection({
  idPrefix,
  connection,
  presets,
  draft,
  initial,
  onChange,
  entityId,
  defaultOpen,
  showErrors = false,
}: Props) {
  const provider = useDataProvider();
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<CmtkProbeResult | null>(null);
  const [probeError, setProbeError] = useState<UserFacingError | null>(null);
  const [detectedPreset, setDetectedPreset] = useState<CmtkPreset | null>(null);
  const errors = connectionDraftErrors(draft);
  const dirty = isConnectionDraftDirty(draft, initial);
  const id = (field: string) => `${idPrefix}-${field}`;

  function update(patch: Partial<ConnectionDraft>) {
    onChange({ ...draft, ...patch });
  }

  async function testConnection() {
    setProbeError(null);
    setProbe(null);
    setDetectedPreset(null);
    const broker = brokerPayload(draft, initial);
    if (broker && Object.keys(errors).length > 0) {
      setProbeError({ title: "Check the connection details", message: "Fill in the broker address, port, and topic before testing." });
      return;
    }
    setProbing(true);
    try {
      const result = await provider.probeCmtkBroker({ broker, entityId, seconds: 8 });
      setProbe(result);
      if (result.detectedPreset && result.detectedPreset !== draft.preset) {
        setDetectedPreset(result.detectedPreset);
        update({ preset: result.detectedPreset });
      } else if (result.detectedPreset) {
        setDetectedPreset(result.detectedPreset);
      }
    } catch (caught) {
      setProbeError(
        toUserFacingError(caught, "data.load", {
          title: "The connection test could not run",
          message: "Check the broker address and try again.",
        }),
      );
    } finally {
      setProbing(false);
    }
  }

  const sourceNote =
    connection.source === "saved"
      ? "Using this machine's saved connection. Change a field only if the CMTK has moved."
      : connection.source === "server"
        ? "Using the connection set on the server. Change a field only if the CMTK has moved."
        : "No connection is saved yet. Enter where the CMTK publishes its readings.";

  return (
    <details open={defaultOpen} className="border border-border" data-testid="connection-details">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
        Connection details
        {dirty ? <span className="ml-2 text-xs font-normal text-muted-foreground">(changed)</span> : null}
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-3">
        <p className="text-xs text-muted-foreground">{sourceNote}</p>
        <FieldGroup className="gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <Field data-invalid={showErrors && errors.host ? true : undefined}>
              <FieldLabel htmlFor={id("host")}>Broker address</FieldLabel>
              <Input
                id={id("host")}
                value={draft.host}
                onChange={(event) => update({ host: event.target.value })}
                placeholder="e.g. 192.168.1.20 or cmtk.local"
                autoComplete="off"
              />
              {showErrors ? <FieldError>{errors.host}</FieldError> : null}
            </Field>
            <Field data-invalid={showErrors && errors.port ? true : undefined}>
              <FieldLabel htmlFor={id("port")}>Port</FieldLabel>
              <Input
                id={id("port")}
                inputMode="numeric"
                value={draft.port}
                onChange={(event) => update({ port: event.target.value })}
              />
              {showErrors ? <FieldError>{errors.port}</FieldError> : null}
            </Field>
          </div>
          <Field orientation="horizontal">
            <Checkbox
              id={id("tls")}
              checked={draft.tls}
              onCheckedChange={(checked) => update({ tls: checked === true })}
            />
            <FieldLabel htmlFor={id("tls")} className="font-normal">
              Use TLS (encrypted connection)
            </FieldLabel>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={id("username")}>Username</FieldLabel>
              <Input
                id={id("username")}
                value={draft.username}
                onChange={(event) => update({ username: event.target.value })}
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("password")}>Password</FieldLabel>
              <Input
                id={id("password")}
                type="password"
                value={draft.password}
                onChange={(event) => update({ password: event.target.value })}
                placeholder={connection.hasPassword ? "Saved — leave blank to keep" : undefined}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <Field data-invalid={showErrors && errors.topic ? true : undefined}>
            <FieldLabel htmlFor={id("topic")}>Topic</FieldLabel>
            <Input
              id={id("topic")}
              value={draft.topic}
              onChange={(event) => update({ topic: event.target.value })}
              placeholder="e.g. balluff/cmtk/master1/iolink/devices/port1/data/fromdevice"
              autoComplete="off"
            />
            <FieldDescription>Use # to see every topic the CMTK publishes when you test the connection.</FieldDescription>
            {showErrors ? <FieldError>{errors.topic}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor={id("preset")}>Payload format</FieldLabel>
            <Select value={draft.preset} onValueChange={(value) => update({ preset: value as CmtkPreset })}>
              <SelectTrigger id={id("preset")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CMTK_PRESETS.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {CMTK_PRESET_LABELS[preset]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {detectedPreset && detectedPreset === draft.preset ? (
                <span className="text-success">Detected from the live messages. </span>
              ) : null}
              {presets[draft.preset]}
            </FieldDescription>
          </Field>
        </FieldGroup>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={probing} onClick={() => void testConnection()}>
            {probing ? (
              <SpinnerIcon data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            ) : (
              <PlugsConnectedIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {probing ? "Listening for messages…" : "Test connection"}
          </Button>
          {probing ? <span className="text-xs text-muted-foreground">This takes a few seconds.</span> : null}
        </div>

        {probeError ? <ErrorNotice error={probeError} /> : null}

        {probe ? (
          <div className="flex flex-col gap-3 border border-border bg-muted/30 p-3 text-sm" role="status" data-testid="probe-result">
            {(() => {
              const tone = probeTone(probe);
              return (
                <p className="flex items-start gap-2">
                  <tone.Icon aria-hidden="true" className={`mt-0.5 shrink-0 ${tone.className}`} size={18} />
                  <span>
                    <span className="font-medium">{tone.label}.</span> {probe.message}
                  </span>
                </p>
              );
            })()}

            {probe.topics.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Topics seen (select one to use it)</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {probe.topics.map((item) => (
                    <li key={item.topic}>
                      <button
                        type="button"
                        className="flex w-full flex-wrap items-center justify-between gap-2 border border-border bg-background px-2 py-1 text-left font-mono text-xs hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
                        onClick={() => update({ topic: item.topic })}
                        aria-pressed={draft.topic === item.topic}
                      >
                        <span className="break-all">{item.topic}</span>
                        <Badge variant={draft.topic === item.topic ? "default" : "secondary"}>
                          {draft.topic === item.topic ? "In use" : `${item.messages} message${item.messages === 1 ? "" : "s"}`}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {probe.detectedPreset ? (
              <p>
                Format: <span className="font-medium">{CMTK_PRESET_LABELS[probe.detectedPreset]}</span>
                <span className="text-muted-foreground"> · detected from the live messages and selected above.</span>
              </p>
            ) : probe.connected && probe.sample !== null && probe.sample !== undefined ? (
              <div className="flex flex-col gap-1">
                <p className="font-medium">The messages don&apos;t match a known CMTK format.</p>
                <ul className="list-disc pl-4 text-muted-foreground">
                  {CMTK_PRESETS.map((preset) => (
                    <li key={preset}>{describeMissing(preset, probe.presetMatches[preset] ?? [])}</li>
                  ))}
                </ul>
                <p className="text-muted-foreground">{CUSTOM_MAPPING_HINT}</p>
              </div>
            ) : null}

            {probe.sample !== null && probe.sample !== undefined ? (
              <details className="text-xs">
                <summary className="cursor-pointer py-1 font-medium focus-visible:outline-2 focus-visible:outline-ring">
                  Sample message{probe.sampleTopic ? ` from ${probe.sampleTopic}` : ""}
                </summary>
                <pre className="mt-1 max-h-48 overflow-auto border border-border bg-background p-2 font-mono text-xs whitespace-pre-wrap break-all">
                  {formatSample(probe.sample)}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}
