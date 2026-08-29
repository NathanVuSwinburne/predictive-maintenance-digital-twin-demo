"use client";

import { useEffect, useRef } from "react";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  derivedFeatureProblem,
  FORMULA_FUNCTIONS,
  quoteColumn,
} from "@/lib/demo-mlops/formula";
import type { DerivedColumnSummary, DerivedFeatureRecipe } from "@/lib/demo-mlops/types";

function readable(value: number | null): string {
  if (value === null) return "blank";
  if (Number.isInteger(value)) return String(value);
  return Number(value.toPrecision(4)).toString();
}

function summaryText(summary: DerivedColumnSummary): string {
  const values = summary.sampleValues.map(readable).join(", ");
  const preamble = values ? `First values ${values}. ` : "";
  if (summary.blankCount === 0) {
    return `${preamble}No blank rows out of ${summary.rowCount.toLocaleString()}.`;
  }
  return `${preamble}${summary.blankCount.toLocaleString()} of ${summary.rowCount.toLocaleString()} rows came out blank.`;
}

type Props = {
  features: DerivedFeatureRecipe[];
  availableColumns: string[];
  onChange: (features: DerivedFeatureRecipe[]) => void;
  /** Per-formula outcome from the last preview, keyed by column name. */
  columnSummaries?: Record<string, DerivedColumnSummary>;
  /** When set, the editor renders as a closed door with the reason on it. */
  unavailableReason?: string;
  suggestions?: Array<{ name: string; expression: string; why: string }>;
};

/**
 * Formulas that make new columns out of the ones the machine already sends. Without this,
 * a user whose model needs a temperature difference or a mechanical power has to leave the
 * product, compute it in a notebook, and come back with a different file.
 */
export function DerivedFeatureEditor({
  features,
  availableColumns,
  onChange,
  columnSummaries,
  unavailableReason,
  suggestions = [],
}: Props) {
  const formulaRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  // Where the caret goes after a column is inserted, applied after the render that carries
  // the new value; setting it any earlier places it in the old string.
  const pendingCaret = useRef<{ index: number; position: number } | null>(null);
  // Clicking a column button takes focus off the formula first, so the field's own
  // selection has already collapsed by the time the handler runs.
  const caretRefs = useRef<Array<{ start: number; end: number } | null>>([]);

  useEffect(() => {
    const pending = pendingCaret.current;
    if (!pending) return;
    pendingCaret.current = null;
    const input = formulaRefs.current[pending.index];
    if (!input) return;
    input.focus();
    input.setSelectionRange(pending.position, pending.position);
  });

  function set(index: number, patch: Partial<DerivedFeatureRecipe>) {
    onChange(features.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  }

  function insertColumn(index: number, column: string) {
    const expression = features[index]?.expression ?? "";
    const caret = caretRefs.current[index];
    const start = Math.min(caret?.start ?? expression.length, expression.length);
    const end = Math.min(caret?.end ?? start, expression.length);
    const before = expression.slice(0, start);
    const after = expression.slice(end);
    // A column dropped straight after a name or a number would weld into it, so the
    // spacing is decided here rather than left to be repaired.
    const lead = before && !/[\s(]$/.test(before) ? " " : "";
    const insertion = `${lead}${quoteColumn(column)}`;
    const position = start + insertion.length;
    set(index, { expression: `${before}${insertion}${after}` });
    pendingCaret.current = { index, position };
    caretRefs.current[index] = { start: position, end: position };
  }

  function rememberCaret(index: number, field: HTMLTextAreaElement) {
    const start = field.selectionStart ?? field.value.length;
    caretRefs.current[index] = { start, end: field.selectionEnd ?? start };
  }

  if (unavailableReason) {
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Calculated features</legend>
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          {unavailableReason}
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Calculated features</legend>
      <p className="text-xs leading-5 text-muted-foreground">
        Make a new column from the ones above. Column names go in quotes; click one rather
        than spelling it. Calculated columns are trained on and recomputed whenever the
        model runs.
      </p>

      {suggestions.length > 0 && features.length === 0 && (
        <div className="space-y-1 rounded-lg border border-dashed bg-muted/20 p-2">
          <p className="instrument-label">Worth trying on this machine</p>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.name}
              type="button"
              onClick={() =>
                onChange([
                  ...features,
                  { name: suggestion.name, expression: suggestion.expression, dtype: "float" },
                ])
              }
              className="block w-full rounded-md border bg-background p-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <span className="font-mono font-medium">{suggestion.name}</span>
              <span className="mt-0.5 block text-muted-foreground">{suggestion.why}</span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {features.map((feature, index) => {
          const problem = derivedFeatureProblem(feature, availableColumns);
          const summary = columnSummaries?.[feature.name.trim()];
          return (
            <div key={index} className="space-y-2 rounded-lg border bg-background p-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <Input
                    aria-label={`Calculated feature ${index + 1} name`}
                    placeholder="New column name"
                    value={feature.name}
                    onChange={(event) => set(index, { name: event.target.value })}
                  />
                  <Textarea
                    ref={(element) => {
                      formulaRefs.current[index] = element;
                    }}
                    aria-label={`Calculated feature ${index + 1} formula`}
                    placeholder='"Process temperature [K]" - "Air temperature [K]"'
                    className="min-h-20 font-mono text-xs"
                    rows={3}
                    value={feature.expression}
                    // A formula is one expression, so a newline would only break the parse.
                    onChange={(event) => {
                      rememberCaret(index, event.currentTarget);
                      set(index, { expression: event.target.value.replace(/[\r\n]+/g, " ") });
                    }}
                    onSelect={(event) => rememberCaret(index, event.currentTarget)}
                  />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <select
                    aria-label={`Calculated feature ${index + 1} type`}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={feature.dtype}
                    onChange={(event) =>
                      set(index, { dtype: event.target.value as DerivedFeatureRecipe["dtype"] })
                    }
                  >
                    <option value="float">Decimal</option>
                    <option value="integer">Whole number</option>
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove calculated feature ${index + 1}`}
                    onClick={() => onChange(features.filter((_, position) => position !== index))}
                  >
                    <TrashIcon aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {availableColumns.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {availableColumns.map((column) => (
                    <button
                      key={column}
                      type="button"
                      aria-label={`Add ${column} to calculated feature ${index + 1}`}
                      className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => insertColumn(index, column)}
                    >
                      {column}
                    </button>
                  ))}
                </div>
              )}
              {problem && <p className="text-xs text-destructive">{problem}</p>}
              {!problem && summary && (
                <p
                  className={
                    summary.blankCount > 0
                      ? "text-xs text-[var(--status-watch)]"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {summaryText(summary)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...features, { name: "", expression: "", dtype: "float" }])}
      >
        <PlusIcon aria-hidden="true" /> Add a calculated feature
      </Button>

      {features.length > 0 && (
        <details className="rounded-lg border bg-background p-2 text-xs">
          <summary className="cursor-pointer font-medium">What can go in a formula</summary>
          <p className="mt-2 text-muted-foreground">
            Quoted column names, numbers, <code className="font-mono">+ - * / // % **</code>,{" "}
            <code className="font-mono">pi</code>, <code className="font-mono">e</code>, and these
            functions: <span className="font-mono">{FORMULA_FUNCTIONS.join(", ")}</span>. A
            single-word name may be written without quotes.
          </p>
          <p className="mt-2 text-muted-foreground">
            A formula reads the machine&rsquo;s own columns, not other calculated ones. A row whose
            formula cannot be worked out (a missing reading, a division by zero) becomes a
            missing value and is handled by the missing-value setting below.
          </p>
        </details>
      )}
    </fieldset>
  );
}
