"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { badgeVariantForSeverity, formatDateTime } from "@/lib/domain/presentation";
import type {
  MachineSummary,
  ManualPredictionResult,
  Prediction,
  PredictionConfig,
} from "@/lib/domain/types";

type Props = {
  machines: MachineSummary[];
  requestedMachineId?: string;
  requestedPredictionId?: string;
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

function isMachineCType(machineType?: string | null) {
  return machineType === "real-sensor" || machineType === "kaggle";
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
  };
}

export function ManualPredictionPanel({
  machines,
  requestedMachineId,
  requestedPredictionId,
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
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
        : (supportedMachines[0]?.id ?? ""),
    );
  }, [requestedMachineId, supportedMachines]);

  useEffect(() => {
    if (!machineId) {
      setConfig(null);
      setValues({});
      return;
    }

    let active = true;

    async function loadConfig() {
      setLoadingConfig(true);
      try {
        const nextConfig = await provider.getPredictionConfig(machineId);
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
        setResult(null);
      } catch (error) {
        if (!active) {
          return;
        }
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load prediction inputs",
        );
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
  }, [machineId, provider]);

  useEffect(() => {
    if (!requestedPredictionId || !machineId) {
      return;
    }

    const selectedMachine = supportedMachines.find(
      (machine) => machine.id === machineId,
    );
    if (!selectedMachine) {
      return;
    }
    const selectedMachineType = selectedMachine.machineType ?? "ai4i";

    let active = true;

    async function loadLinkedPrediction() {
      try {
        const predictions = await provider.getMachinePredictions(machineId);
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
      } catch (error) {
        if (!active) {
          return;
        }
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load linked prediction result",
        );
      }
    }

    void loadLinkedPrediction();

    return () => {
      active = false;
    };
  }, [machineId, provider, requestedPredictionId, supportedMachines]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) {
      return;
    }

    const payloadValues: Record<string, number | string> = {};
    for (const field of config.fields) {
      const rawValue = values[field.key];
      if (field.type === "number") {
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) {
          toast.error(`${field.label} must be a valid number.`);
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
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Prediction failed",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (supportedMachines.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Predict</CardTitle>
          <CardDescription className="text-sm">
            Manual prediction is only available for Machine A and Machine C.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Predict</CardTitle>
            <CardDescription className="text-sm">
              Enter machine values directly and get an immediate model label plus confidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Machine
              </span>
              <Select value={machineId} onValueChange={setMachineId}>
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
            </div>

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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Prediction Result</CardTitle>
          <CardDescription className="text-sm">
            {isMachineCType(config?.machineType)
              ? "The predicted label, high-risk probability, and predicted-label confidence."
              : "The predicted label plus model confidence."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {result ? (
            <>
              {requestedPredictionId ? (
                <div className="border border-success/40 bg-success/5 p-3 text-muted-foreground">
                  Loaded the prediction result that was created from chat.
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={badgeVariantForSeverity(result.severity)}>
                  {result.severity}
                </Badge>
                <span className="font-medium">{result.predictedLabel}</span>
                {result.failureType ? (
                  <Badge variant="outline">{result.failureType}</Badge>
                ) : null}
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    {isMachineCType(result.machineType)
                      ? "High-risk probability"
                      : "Failure probability"}
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {(result.failureProbability * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    {isMachineCType(result.machineType)
                      ? "Predicted-label confidence"
                      : "Confidence"}
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {(result.confidence * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              {isMachineCType(result.machineType) ? (
                <div className="border border-border p-3 text-muted-foreground">
                  <p>
                    High-risk probability is <strong>P(high)</strong>. Predicted-label
                    confidence is the probability of the returned label.
                  </p>
                </div>
              ) : null}

              {result.machineType === "ai4i" ? (
                <div className="border border-border p-3 text-muted-foreground">
                  {result.thresholdTriggered ? (
                    <p>
                      The binary stage crossed the failure threshold, so the failure type is shown.
                    </p>
                  ) : (
                    <p>
                      The binary stage stayed below the failure threshold, so no failure type is surfaced.
                    </p>
                  )}
                </div>
              ) : null}

              {result.warnings.length > 0 ? (
                <div className="border border-warning/40 bg-warning/10 p-3 text-muted-foreground">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <WarningCircleIcon />
                    Out-of-range warning
                  </div>
                  {result.warnings.map((warning) => (
                    <p key={warning} className="mt-1">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="border border-success/40 bg-success/5 p-3 text-muted-foreground">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <CheckCircleIcon />
                    Inputs stayed within the observed dataset range.
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Generated {formatDateTime(result.generatedAt)}
              </p>
            </>
          ) : (
            <div className="border border-dashed border-border p-4 text-muted-foreground">
              Submit a machine input set to see the model label and confidence.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
