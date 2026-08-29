"use client";

import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";

import type { TrainingRun } from "@/lib/demo-mlops/types";
import { cn } from "@/lib/utils";

const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const count = new Intl.NumberFormat();

/** Metrics promoted out of the technical dump. Everything else still renders below it. */
export const HEADLINE_METRIC_KEYS = new Set([
  "test_accuracy",
  "test_balanced_accuracy",
  "majority_class_baseline_accuracy",
  "test_accuracy_lift",
  "test_rmse",
  "persistence_baseline_rmse",
]);

function Figure({
  value,
  caption,
  tone = "neutral",
}: {
  value: string;
  caption: string;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <span
        className={cn(
          "data-value block text-xl font-semibold",
          tone === "good" && "text-[var(--status-healthy)]",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </span>
      <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{caption}</span>
    </div>
  );
}

/**
 * The plain-language verdict on a finished run: what it scored, what the trivial answer
 * scores, and where it is wrong. All of this used to sit inside a collapsed key/value
 * dump, which is how a model that lost to always guessing "no failure" got read as 96 %.
 */
export function QualityVerdict({ run }: { run: TrainingRun }) {
  const quality = run.outputContract?.qualityStatus;
  if (!quality) return null;
  const tone =
    quality === "recommended"
      ? "border-[var(--status-healthy)]/40 bg-[var(--status-healthy)]/10"
      : quality === "borderline"
        ? "border-[var(--status-watch)]/45 bg-[var(--status-watch)]/10"
        : "border-destructive/40 bg-destructive/10 text-destructive";
  const Icon = quality === "recommended" ? CheckCircleIcon : WarningCircleIcon;
  return (
    <div className={cn("mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm", tone)} role="status">
      <Icon className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>{run.outputContract?.qualityNote}</p>
    </div>
  );
}

function PredictScorecard({ run }: { run: TrainingRun }) {
  const metrics = run.metrics;
  const labels = run.outputContract?.labels ?? [];
  const matrix = run.outputContract?.confusionMatrix ?? [];

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.test_balanced_accuracy !== undefined && (
          <Figure
            value={percent.format(metrics.test_balanced_accuracy)}
            caption="Balanced accuracy: every outcome weighted equally"
          />
        )}
        {metrics.test_accuracy !== undefined && (
          <Figure value={percent.format(metrics.test_accuracy)} caption="Plain accuracy" />
        )}
        {metrics.majority_class_baseline_accuracy !== undefined && (
          <Figure
            value={percent.format(metrics.majority_class_baseline_accuracy)}
            caption={`Always guessing "${run.outputContract?.baselineLabel ?? "the common outcome"}"`}
          />
        )}
        {metrics.test_accuracy_lift !== undefined && (
          <Figure
            value={`${metrics.test_accuracy_lift >= 0 ? "+" : ""}${percent.format(metrics.test_accuracy_lift)}`}
            caption="Gain over that trivial answer"
            tone={metrics.test_accuracy_lift > 0 ? "good" : "bad"}
          />
        )}
      </div>

      {labels.length > 0 && metrics.test_recall_class_0 !== undefined && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="p-2 text-left text-xs text-muted-foreground">
              Per-outcome breakdown on the held-out rows
            </caption>
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="p-2 text-left">Outcome</th>
                <th scope="col" className="p-2 text-right">Caught</th>
                <th scope="col" className="p-2 text-right">Correct when flagged</th>
                <th scope="col" className="p-2 text-right">Held out</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((label, index) => (
                <tr key={label} className="border-t">
                  <th scope="row" className="p-2 text-left font-medium">{label}</th>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {percent.format(metrics[`test_recall_class_${index}`] ?? 0)}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {percent.format(metrics[`test_precision_class_${index}`] ?? 0)}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {count.format(metrics[`test_support_class_${index}`] ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {matrix.length > 0 && labels.length === matrix.length && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="p-2 text-left text-xs text-muted-foreground">
              What it actually answered: rows are the true outcome, columns what the model said
            </caption>
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="p-2 text-left">Actually</th>
                {labels.map((label) => (
                  <th key={label} scope="col" className="p-2 text-right">Said {label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, rowIndex) => (
                <tr key={labels[rowIndex]} className="border-t">
                  <th scope="row" className="p-2 text-left font-medium">{labels[rowIndex]}</th>
                  {row.map((value, columnIndex) => (
                    <td
                      key={`${labels[rowIndex]}-${labels[columnIndex]}`}
                      className={cn(
                        "p-2 text-right font-mono tabular-nums",
                        rowIndex === columnIndex ? "font-semibold" : "text-muted-foreground",
                      )}
                    >
                      {count.format(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {metrics.train_test_gap !== undefined && (
        <p className="text-xs text-muted-foreground">
          Train accuracy {percent.format(metrics.train_accuracy ?? 0)} against test{" "}
          {percent.format(metrics.test_accuracy ?? 0)}, a gap of{" "}
          <span className={metrics.train_test_gap > 0.2 ? "text-[var(--status-watch)]" : undefined}>
            {percent.format(metrics.train_test_gap)}
          </span>
          .
        </p>
      )}
    </div>
  );
}

function SimulateScorecard({ run }: { run: TrainingRun }) {
  const rmse = run.metrics.test_rmse;
  const baseline = run.metrics.persistence_baseline_rmse;
  if (rmse === undefined) return null;
  const improvement = baseline !== undefined && baseline > 0 ? (baseline - rmse) / baseline : undefined;
  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure value={decimal.format(rmse)} caption="Typical error per reading (RMSE)" />
        <Figure value={decimal.format(run.metrics.test_mae ?? 0)} caption="Average absolute error" />
        {baseline !== undefined && (
          <Figure
            value={decimal.format(baseline)}
            caption="Error from simply repeating the last reading"
          />
        )}
        {improvement !== undefined && (
          <Figure
            value={`${improvement >= 0 ? "+" : ""}${percent.format(improvement)}`}
            caption="Gain over that trivial answer"
            tone={improvement > 0 ? "good" : "bad"}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Scored one step ahead on {count.format(run.metrics.forecast_examples ?? 0)} held-out
        readings, never crossing a session boundary.
      </p>
    </div>
  );
}

export function ModelScorecard({ run }: { run: TrainingRun }) {
  if (run.status !== "succeeded") return null;
  return (
    <section aria-label="Model results">
      {Object.keys(run.metrics).length > 0 &&
        (run.capability === "predict" ? (
          <PredictScorecard run={run} />
        ) : (
          <SimulateScorecard run={run} />
        ))}
      <QualityVerdict run={run} />
    </section>
  );
}
