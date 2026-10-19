"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ErrorNotice } from "@/components/feedback/error-notice";

import { PredictionResult } from "@/components/simulator/prediction-result";
import { ModelReadinessPanel } from "@/components/machines/model-readiness-panel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDataProvider } from "@/hooks/use-data-provider";
import { useModelReadiness } from "@/hooks/use-model-readiness";
import type {
  MachineSummary,
  ManualPredictionResult,
  Prediction,
  PredictionConfig,
} from "@/lib/domain/types";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";

type Props = {
  machines: MachineSummary[];
  requestedMachineId?: string;
  requestedPredictionId?: string;
  showMachineSelector?: boolean;
};

function formatRange(config: PredictionConfig, key: string) {
  const field = config.fields.find((item) => item.key === key);
  const range = field?.range;
  if (!field || !range) {
    return "No observed range available";
  }

  const decimals = field.step && field.step < 1 ? 3 : 1;
  return `Observed ${range.observedMin.toFixed(decimals)} - ${range.observedMax.toFixed(decimals)} ${field.unit ?? ""} · Typical ${range.typicalValue.toFixed(decimals)} ${field.unit ?? ""}`;
}

function predictionToManualResult(
  prediction: Prediction,
  machineType: NonNullable<MachineSummary["machineType"]>,
): ManualPredictionResult {
  return {
    machineId: prediction.machineId,
    machineType,
    predictedLabel: prediction.failureMode,
    failureProbability: prediction.probability,
    confidence: prediction.confidence,
    severity: prediction.severity,
    failureType: prediction.failureMode,
    thresholdTriggered: null,
    warnings: [],
    breachedFields: [],
    generatedAt: prediction.generatedAt,
    provenance: prediction.provenance,
  };
}

export function ManualPredictionPanel({
  machines,
  requestedMachineId,
  requestedPredictionId,
  showMachineSelector = true,
}: Props) {
  const provider = useDataProvider();
  const supportedMachines = useMemo(
    () =>
      machines.filter(
        (machine) =>
          machine.machineType === "ai4i" ||
          machine.machineType === "real-sensor" ||
          machine.machineType === "kaggle",
      ),
    [machines],
  );

  const [machineId, setMachineId] = useState("");
  const [config, setConfig] = useState<PredictionConfig | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ManualPredictionResult | null>(null);
  const [historicalResult, setHistoricalResult] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [operationError, setOperationError] = useState<UserFacingError | null>(null);
  const effectiveMachineId =
    machineId || supportedMachines[0]?.id || "";
  const modelReadiness = useModelReadiness(effectiveMachineId || undefined);
  // The legacy Machine C adapter (real-sensor / kaggle) classifies vibration intensity, not failure risk.
  const effectiveMachineType = supportedMachines.find(
    (machine) => machine.id === effectiveMachineId,
  )?.machineType;
  const vibrationLevel =
    effectiveMachineType === "real-sensor" || effectiveMachineType === "kaggle";

  useEffect(() => {
    if (supportedMachines.length === 0) {
      setMachineId("");
      return;
    }

    if (
      requestedMachineId &&
      supportedMachines.some((machine) => machine.id === requestedMachineId)
    ) {
      setMachineId(requestedMachineId);
      return;
    }

    setMachineId((current) =>
      supportedMachines.some((machine) => machine.id === current)
        ? current
        : "",
    );
  }, [requestedMachineId, supportedMachines]);

  useEffect(() => {
    if (!effectiveMachineId) {
      setConfig(null);
      setValues({});
      return;
    }

    let active = true;

    async function loadConfig() {
      setLoadingConfig(true);
      setResult(null);
      setHistoricalResult(false);
      try {
        const nextConfig = await provider.getPredictionConfig(effectiveMachineId);
        if (!active) {
          return;
        }
        setConfig(nextConfig);
        setValues(
          Object.fromEntries(
            nextConfig.fields.map((field) => [
              field.key,
              field.type === "select"
                ? String(field.options?.[0]?.value ?? "")
                : field.range
                  ? String(field.range.typicalValue)
              : "",
            ]),
          ),
        );
      } catch (error) {
        if (!active) {
          return;
        }
        setOperationError(toUserFacingError(error, "data.load", {
          title: "Prediction inputs could not be loaded",
          message: "The required sensor fields are unavailable.",
        }));
        setConfig(null);
      } finally {
        if (active) {
          setLoadingConfig(false);
        }
      }
    }

    void loadConfig();
    return () => {
      active = false;
    };
  }, [effectiveMachineId, provider]);

  useEffect(() => {
    if (!requestedPredictionId || !effectiveMachineId) {
      return;
    }

    const selectedMachine = supportedMachines.find(
      (machine) => machine.id === effectiveMachineId,
    );
    if (!selectedMachine) {
      return;
    }
    const selectedMachineType = selectedMachine.machineType ?? "ai4i";

    let active = true;

    async function loadLinkedPrediction() {
      try {
        const predictions = await provider.getMachinePredictions(effectiveMachineId);
        if (!active) {
          return;
        }

        const linkedPrediction =
          predictions.find((prediction) => prediction.id === requestedPredictionId) ??
          null;
        if (!linkedPrediction) {
          return;
        }

        setResult(
          predictionToManualResult(linkedPrediction, selectedMachineType),
        );
        setHistoricalResult(true);
      } catch (error) {
        if (!active) {
          return;
        }
        setOperationError(toUserFacingError(error, "data.load", {
          title: "Prediction result could not be loaded",
          message: "The linked historical result is unavailable.",
        }));
      }
    }

    void loadLinkedPrediction();

    return () => {
      active = false;
    };
  }, [effectiveMachineId, provider, requestedPredictionId, supportedMachines]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOperationError(null);
    if (!config) {
      return;
    }

    const payloadValues: Record<string, number | string> = {};
    for (const field of config.fields) {
      const rawValue = values[field.key];
      if (field.type === "number") {
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) {
          setOperationError(toUserFacingError(null, "simulation.run", {
            title: `Review ${field.label}`,
            message: `${field.label} must be a valid number. Correct the highlighted value and try again.`,
          }));
          return;
        }
        payloadValues[field.key] = numericValue;
      } else {
        payloadValues[field.key] = rawValue;
      }
    }

    setSubmitting(true);
    try {
      const response = await provider.predictMachine(config.machineId, {
        values: payloadValues,
      });
      setResult(response);
      setHistoricalResult(false);
    } catch (error) {
      setOperationError(toUserFacingError(error, "simulation.run", {
        title: "Prediction could not be generated",
        message: "Review the sensor values and try again. No new result was saved.",
      }));
    } finally {
      setSubmitting(false);
    }
  }

  if (supportedMachines.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prediction isn&apos;t available for this machine</CardTitle>
          <CardDescription className="text-sm">
            Manual prediction is only available for Machine A and Machine C. Choose one of those
            machines above, or set up a prediction model for this machine in Machine Registry.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {operationError ? <ErrorNotice error={operationError} /> : null}
      <ModelReadinessPanel
        compact
        readiness={modelReadiness.readiness}
        isLoading={modelReadiness.isLoading}
        error={modelReadiness.error}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {vibrationLevel ? "Check vibration level" : "Check failure risk"}
            </CardTitle>
            <CardDescription className="text-sm">
              {vibrationLevel
                ? "Enter sensor values to classify how strongly the machine is vibrating (low, medium or high)."
                : "Enter sensor values to get the model's risk assessment."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {showMachineSelector && <div className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Machine
              </span>
              <Select
                value={effectiveMachineId}
                onValueChange={setMachineId}
                disabled={supportedMachines.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a machine" />
                </SelectTrigger>
                <SelectContent>
                  {supportedMachines.map((machine) => (
                    <SelectItem key={machine.id} value={machine.id}>
                      {machine.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>}

            {config ? (
              <>
                <div className="border border-border p-3 text-sm">
                  <p className="font-medium">{config.title}</p>
                  <p className="mt-1 text-muted-foreground">{config.description}</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {config.fields.map((field) => (
                    <div key={field.key} className="grid gap-2 border border-border p-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {field.label}
                          {field.unit ? ` (${field.unit})` : ""}
                        </p>
                        {field.description ? (
                          <p className="text-muted-foreground">{field.description}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatRange(config, field.key)}
                        </p>
                      </div>

                      {field.type === "select" ? (
                        <Select
                          value={values[field.key] ?? ""}
                          onValueChange={(nextValue) =>
                            setValues((current) => ({
                              ...current,
                              [field.key]: nextValue,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={`Select ${field.label}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options?.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          inputMode="decimal"
                          type="number"
                          step={field.step ?? "any"}
                          value={values[field.key] ?? ""}
                          onChange={(event) =>
                            setValues((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>

                {config.warnings.length > 0 ? (
                  <div className="border border-warning/40 bg-warning/10 p-3 text-sm text-muted-foreground">
                    {config.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <Button type="submit" disabled={submitting || loadingConfig}>
                    {submitting ? "Predicting..." : "Run prediction"}
                  </Button>
                </div>
              </>
            ) : loadingConfig ? (
              <div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
                Loading prediction inputs...
              </div>
            ) : null}
          </CardContent>
        </Card>
      </form>

      <PredictionResult result={result} historical={historicalResult} vibrationLevel={vibrationLevel} />
      </div>
    </div>
  );
}
