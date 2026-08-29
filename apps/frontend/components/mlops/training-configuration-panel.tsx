"use client";

import { useState } from "react";
import { CheckIcon, CopySimpleIcon, DownloadSimpleIcon, InfoIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ArchitectureOption, TrainingParameterOption } from "@/lib/demo-mlops/types";

export type Values = Record<string, string | number | boolean>;

/** The allowed span for one parameter, phrased for its hint line. */
export function parameterRange(parameter: TrainingParameterOption): string | null {
  const unit = parameter.unit ? ` ${parameter.unit}` : "";
  if (parameter.minimum !== undefined && parameter.maximum !== undefined) {
    return `${parameter.minimum} to ${parameter.maximum}${unit}`;
  }
  if (parameter.minimum !== undefined) return `at least ${parameter.minimum}${unit}`;
  if (parameter.maximum !== undefined) return `at most ${parameter.maximum}${unit}`;
  return null;
}

/** Numbers leave the box as numbers, so what you read is the payload, not a lookalike. */
function coerce(architecture: ArchitectureOption, values: Values): Values {
  const payload: Values = {};
  for (const parameter of architecture.parameters) {
    const value = values[parameter.key] ?? parameter.default;
    payload[parameter.key] =
      parameter.type === "integer" || parameter.type === "number" ? Number(value) : value;
  }
  return payload;
}

/** Every problem stated before the run starts, rather than 90 seconds in as a stack trace. */
export function configurationProblems(
  architecture: ArchitectureOption,
  values: Values,
): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const parameter of architecture.parameters) {
    const value = values[parameter.key];
    if (parameter.type === "boolean" || parameter.type === "select") {
      if (parameter.type === "select" && value !== undefined) {
        const choices = parameter.choices ?? [];
        if (choices.length > 0 && !choices.includes(String(value))) {
          problems[parameter.key] = `${parameter.label} must be one of ${choices.join(", ")}.`;
        }
      }
      continue;
    }
    if (value === "" || value === undefined || value === null) {
      problems[parameter.key] = `${parameter.label} is empty.`;
      continue;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      problems[parameter.key] = `${parameter.label} must be a number.`;
      continue;
    }
    if (parameter.type === "integer" && !Number.isInteger(numeric)) {
      problems[parameter.key] = `${parameter.label} must be a whole number.`;
    }
    if (parameter.minimum !== undefined && numeric < parameter.minimum) {
      problems[parameter.key] = `${parameter.label} cannot be below ${parameter.minimum}.`;
    }
    if (parameter.maximum !== undefined && numeric > parameter.maximum) {
      problems[parameter.key] = `${parameter.label} cannot be above ${parameter.maximum}.`;
    }
  }
  return problems;
}

type Props = {
  architecture: ArchitectureOption;
  values: Values;
  onChange: (values: Values) => void;
};

/**
 * Hyperparameters are edited as JSON, the same way the production app edits them. There
 * was a second set of per-parameter controls once; two ways to set one number is only ever
 * a way for the two to disagree, so the JSON is the single place a value is written.
 */
export function TrainingConfigurationPanel({ architecture, values, onChange }: Props) {
  const effective = JSON.stringify(coerce(architecture, values), null, 2);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState(effective);
  const [hintCopied, setHintCopied] = useState(false);
  // Switching model or applying values makes the box stale, so it is reset during render
  // rather than in an effect, which would paint the old JSON for a frame first.
  const [lastEffective, setLastEffective] = useState(effective);
  if (effective !== lastEffective) {
    setLastEffective(effective);
    setDraft(effective);
    setErrors({});
  }

  function applyDraft() {
    setErrors({});
    let parsed: Values;
    try {
      parsed = JSON.parse(draft) as Values;
    } catch (error) {
      setErrors({
        file: error instanceof Error ? error.message : "Configuration must be valid JSON.",
      });
      return;
    }
    const problems = configurationProblems(architecture, parsed);
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      return;
    }
    onChange(coerce(architecture, parsed));
  }

  function downloadConfiguration() {
    const payload = `${JSON.stringify(coerce(architecture, values), null, 2)}\n`;
    const href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${architecture.id}-training-config.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  async function copyHint() {
    try {
      await navigator.clipboard.writeText(effective);
      setHintCopied(true);
      setDraft(effective);
      window.setTimeout(() => setHintCopied(false), 2000);
    } catch {
      setErrors({ file: "Could not reach the clipboard; select the text above and copy it." });
    }
  }

  const problems = Object.entries(errors).filter(([, message]) => Boolean(message));

  return (
    <div className="space-y-4">
      <details className="border border-dashed bg-muted/20 p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <InfoIcon aria-hidden="true" /> Parameter hints
        </summary>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Every parameter this model accepts, with its current value. Copy this, paste it into
          the box below and change the numbers. Only model hyperparameters live here. Splitting,
          missing values, clipping and scaling are frozen into the prepared dataset.
        </p>
        <pre className="mt-3 max-h-64 overflow-auto bg-background p-3 font-mono text-[11px] leading-5">
          {effective}
        </pre>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void copyHint()}>
          {hintCopied ? <CheckIcon aria-hidden="true" /> : <CopySimpleIcon aria-hidden="true" />}
          {hintCopied ? "Copied" : "Copy into box below"}
        </Button>

        <dl className="mt-4 space-y-3 border-t pt-3">
          {architecture.parameters.map((parameter) => (
            <div key={parameter.key}>
              <dt className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[11px] font-medium">{parameter.key}</span>
                <span className="text-[11px] text-muted-foreground">{parameter.label}</span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {parameterRange(parameter) ?? (parameter.choices ?? []).join(" | ")}
                </span>
              </dt>
              <dd className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                {parameter.description}
              </dd>
            </div>
          ))}
        </dl>
      </details>

      <div className="space-y-2 border bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="training-configuration-json">Configuration JSON</Label>
          <Button type="button" variant="ghost" size="sm" onClick={downloadConfiguration}>
            <DownloadSimpleIcon aria-hidden="true" /> Download effective JSON
          </Button>
        </div>
        <textarea
          id="training-configuration-json"
          className="h-40 w-full border border-input bg-background p-2 font-mono text-xs"
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={applyDraft}>
            Apply JSON
          </Button>
          <span className="text-xs text-muted-foreground">
            Schema v1 · validated before values are applied
          </span>
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="space-y-1 border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {problems.map(([key, message]) => (
            <li key={key}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
