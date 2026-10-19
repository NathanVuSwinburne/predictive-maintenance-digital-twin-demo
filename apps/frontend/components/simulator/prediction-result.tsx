"use client";

import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { SourceAttribution } from "@/components/provenance/source-attribution";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/domain/presentation";
import type { ManualPredictionResult } from "@/lib/domain/types";

const VIBRATION_LEVEL_TITLES: Record<string, string> = {
  low: "Low vibration level",
  medium: "Medium vibration level",
  high: "High vibration level",
  critical: "High vibration level",
};

export function PredictionResult({ result, historical = false, vibrationLevel: vibrationLevelProp }: {
  result: ManualPredictionResult | null;
  historical?: boolean;
  /** Machine C labels are vibration intensity levels, not failure risk. Inferred from the result when omitted. */
  vibrationLevel?: boolean;
}) {
  const low = result?.severity === "low" && result?.thresholdTriggered !== true;
  const machineA = result?.machineType === "ai4i";
  const vibrationLevel = result
    ? result.machineType === "real-sensor" || result.machineType === "kaggle"
    : Boolean(vibrationLevelProp);
  const vibrationTitle = result
    ? VIBRATION_LEVEL_TITLES[result.predictedLabel?.trim().toLowerCase()] ?? VIBRATION_LEVEL_TITLES[result.severity]
    : undefined;
  const title = result
    ? result.thresholdTriggered === true ? "Possible failure detected"
      : vibrationLevel && vibrationTitle ? vibrationTitle
      : ({ low: "Low predicted risk", medium: "Elevated predicted risk", high: "High predicted risk", critical: "Critical predicted risk" })[result.severity]
    : "No prediction yet";
  const StatusIcon = low ? CheckCircleIcon : WarningCircleIcon;

  return (
    <Card className="self-start min-w-0" aria-label="Prediction result">
      <CardHeader>
        <CardTitle className="text-base">Prediction result</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm" aria-live="polite">
        {result ? <>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <SourceAttribution provenance={result.provenance} />
            <span>{historical ? "Historical result · not current" : "Based on entered values"}</span>
          </div>
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-xl font-semibold">
              <StatusIcon aria-hidden className={`size-6 shrink-0 ${low ? "text-success" : result.severity === "critical" ? "text-destructive" : "text-warning"}`} />
              {title}
            </h3>
            <p className="text-muted-foreground">
              {machineA && result.thresholdTriggered === false
                ? "These values did not trigger the model’s failure alert."
                : "The model’s assessment applies to the values used for this prediction."}
            </p>
          </div>
          <div className="border-y py-4">
            <p className="text-muted-foreground">{machineA ? "Estimated failure probability" : vibrationLevel ? "Probability of high vibration" : "Estimated high-risk probability"}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{(result.failureProbability * 100).toFixed(1)}%</p>
            <p className="mt-2 text-muted-foreground">{machineA ? "Model estimate for this input set." : vibrationLevel ? "Model probability of the high vibration level. This is not a failure probability." : "Model probability of the high-risk label."}</p>
          </div>
          {result.failureType && result.thresholdTriggered === true ? (
            <p><span className="font-medium">Possible failure type: </span>{result.failureType}</p>
          ) : null}
          <div>
            <p className="font-medium">Suggested next step</p>
            <p className="mt-1 text-muted-foreground">{historical
              ? "Review the result’s date and source before using it. Run a new prediction to assess another set of values."
              : result.warnings.length ? "Review the flagged inputs before relying on this result."
                : low ? vibrationLevel
                  ? "Continue routine monitoring. Review unusual readings or symptoms even when the vibration level is low."
                  : "Continue routine monitoring. Review unusual readings or symptoms even when predicted risk is low."
                  : "Review the sensor readings and arrange an inspection with qualified personnel if needed."}</p>
          </div>
          {result.warnings.length > 0 ? (
            <div className="border border-warning/40 bg-warning/10 p-3">
              <p className="flex items-center gap-2 font-medium"><WarningCircleIcon aria-hidden />Review input values</p>
              {result.warnings.map(warning => <p key={warning} className="mt-1">{warning}</p>)}
            </div>
          ) : null}
          <details key={`${result.machineId}-${result.generatedAt}`} className="border-t pt-3">
            <summary className="cursor-pointer py-2 font-medium focus-visible:outline-2 focus-visible:outline-ring">Model details</summary>
            <dl className="mt-2 space-y-3 text-muted-foreground">
              <div><dt className="font-medium text-foreground">{vibrationLevel ? "Returned vibration level" : "Returned label"}</dt><dd>{result.predictedLabel}</dd></div>
              <div>
                <dt className="font-medium text-foreground">{machineA ? "Failure-type confidence" : vibrationLevel ? "Vibration-level confidence" : "Predicted-label confidence"}</dt>
                <dd>{(result.confidence * 100).toFixed(1)}%</dd>
                <dd className="mt-1">{machineA
                  ? "Score from the separate failure-type classifier. It does not measure confidence in the overall risk assessment. A failure type is shown only when the failure alert triggers."
                  : vibrationLevel
                    ? "Model probability of the returned vibration level. This is separate from the probability of high vibration."
                    : "Model probability of the returned label. This is separate from the probability of the high-risk label."}</dd>
              </div>
              {vibrationLevel && result.thresholdTriggered == null ? null : (
                <div><dt className="font-medium text-foreground">Failure alert</dt><dd>{result.thresholdTriggered == null ? "Not recorded for this result." : result.thresholdTriggered ? "Triggered." : "Not triggered."}</dd></div>
              )}
            </dl>
          </details>
          <p className="text-xs text-muted-foreground">Generated {formatDateTime(result.generatedAt)}</p>
        </> : <p className="text-muted-foreground">{vibrationLevel
          ? "Enter sensor values and select Run prediction to see the predicted vibration level here."
          : "Enter sensor values and select Run prediction to see the risk assessment here."}</p>}
      </CardContent>
    </Card>
  );
}
