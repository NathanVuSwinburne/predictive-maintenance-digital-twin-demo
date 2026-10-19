"use client";

import { ArrowClockwiseIcon, ArrowRightIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { ErrorNotice } from "@/components/feedback/error-notice";
import { Badge } from "@/components/ui/badge";
import { SourceAttribution } from "@/components/provenance/source-attribution";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDataProvider } from "@/hooks/use-data-provider";
import { usesVibrationLevelLabels } from "@/lib/domain/presentation";
import type {
  EntityDetail,
  EntityCapability,
  EntityInferenceResult,
  JsonValue,
  SimulatorEntityModel,
} from "@/lib/domain/types";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";
import { formatAppNumericDateTime } from "@/lib/time";

type Props = {
  models: SimulatorEntityModel[];
  objective: EntityCapability;
  requestedEntityId?: string;
  showEntitySelector?: boolean;
};

export function GenericModelSimulator({
  models,
  objective,
  requestedEntityId,
  showEntitySelector = true,
}: Props) {
  const provider = useDataProvider();
  const availableModels = useMemo(
    () => models.filter((model) => model.objectives.includes(objective)),
    [models, objective],
  );
  const [entityId, setEntityId] = useState("");
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [latestValues, setLatestValues] = useState<Record<string, JsonValue>>({});
  const [valueInputs, setValueInputs] = useState<Record<string, string>>({});
  const [latestTimestamp, setLatestTimestamp] = useState<string | null>(null);
  const [loadingInputs, setLoadingInputs] = useState(false);
  const [result, setResult] = useState<EntityInferenceResult | null>(null);
  const [running, setRunning] = useState(false);
  const [operationError, setOperationError] = useState<UserFacingError | null>(null);

  useEffect(() => {
    const requestedIsAvailable = availableModels.some(
      (model) => model.entityId === requestedEntityId,
    );
    setEntityId((current) =>
      requestedIsAvailable
        ? (requestedEntityId ?? "")
        : availableModels.some((model) => model.entityId === current)
          ? current
          : (availableModels[0]?.entityId ?? ""),
    );
  }, [availableModels, requestedEntityId]);

  const selected = useMemo(
    () => availableModels.find((model) => model.entityId === entityId),
    [availableModels, entityId],
  );

  useEffect(() => {
    setResult(null);
  }, [entityId, objective]);

  const activeFeatures = useMemo(() => {
    const names = new Set(selected?.inputFeatures?.[objective] ?? []);
    return (entity?.features ?? []).filter((feature) => names.has(feature.name));
  }, [entity, objective, selected]);

  useEffect(() => {
    if (!selected || objective !== "predict") {
      setEntity(null);
      setLatestValues({});
      setValueInputs({});
      setLatestTimestamp(null);
      return;
    }
    let cancelled = false;
    setLoadingInputs(true);
    Promise.all([
      provider.getEntity(selected.entityId),
      provider.listEntityTelemetry(selected.entityId, { limit: 1 }),
    ])
      .then(([detail, rows]) => {
        if (cancelled) return;
        const latest = rows[0];
        const payload = latest?.payload ?? {};
        setEntity(detail);
        setLatestValues(payload);
        setLatestTimestamp(latest?.timestamp ?? null);
        setValueInputs(
          Object.fromEntries(
            Object.entries(payload).map(([name, value]) => [
              name,
              value === null || value === undefined ? "" : String(value),
            ]),
          ),
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setOperationError(toUserFacingError(error, "data.load", {
            title: "Latest sensor data could not be loaded",
            message: "Prediction inputs are unavailable for this machine.",
          }));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingInputs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [objective, provider, selected]);

  function resetToLatest() {
    setValueInputs(
      Object.fromEntries(
        Object.entries(latestValues).map(([name, value]) => [name, value === null ? "" : String(value)]),
      ),
    );
  }

  function parsedValue(name: string): JsonValue {
    const feature = activeFeatures.find((candidate) => candidate.name === name);
    const raw = valueInputs[name] ?? "";
    if (!feature || feature.dtype === "string") return raw;
    if (feature.dtype === "boolean") {
      if (raw === "true") return true;
      if (raw === "false") return false;
      throw new Error(`${name} must be true or false.`);
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) throw new Error(`${name} must be numeric.`);
    if (feature.dtype === "integer" && !Number.isInteger(numeric)) {
      throw new Error(`${name} must be a whole number.`);
    }
    return numeric;
  }

  async function execute() {
    if (!selected) return;
    setOperationError(null);
    setRunning(true);
    try {
      const values = objective === "predict"
        ? Object.fromEntries(
            activeFeatures
              .map((feature) => [feature.name, parsedValue(feature.name)] as const)
              .filter(([name, value]) => String(value) !== String(latestValues[name] ?? "")),
          )
        : undefined;
      setResult(
        await provider.runEntityInference(selected.entityId, objective, {
          limit: 500,
          values,
          idempotencyKey: globalThis.crypto?.randomUUID?.(),
        }),
      );
    } catch (error) {
      setOperationError(toUserFacingError(error, "simulation.run", {
        title: "The model could not run",
        message: "Review the sensor values and try again. No new result was saved.",
      }));
    } finally {
      setRunning(false);
    }
  }

  if (availableModels.length === 0) return null;

  const isForecast = objective === "simulate";
  // Machine C / CMTK predict models classify vibration intensity (low/medium/high), not failure risk.
  const vibrationLevel = usesVibrationLevelLabels({
    entityId: selected?.entityId,
    features: selected?.inputFeatures?.predict,
  });
  const checkLabel = vibrationLevel ? "Check vibration level" : "Check failure risk";
  const outputs = isForecast ? result?.forecast : result?.probabilities;
  const overriddenCount = activeFeatures.filter(
    (feature) => String(valueInputs[feature.name] ?? "") !== String(latestValues[feature.name] ?? ""),
  ).length;

  return (
    <section className="flex flex-col gap-4" aria-label={`Registered machine ${objective}`}>
      {operationError ? <ErrorNotice error={operationError} /> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isForecast ? "Forecast from the latest data" : checkLabel}
            </CardTitle>
            <CardDescription className="text-sm">
              {isForecast
                ? "Runs the active model forward from the latest saved sensor readings."
                : vibrationLevel
                  ? "Classifies how strongly the machine is vibrating (low, medium or high) from the latest saved sensor readings. Change a value to test a what-if scenario."
                  : "Runs the active model on the latest saved sensor reading. Change a value to test a what-if scenario."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {showEntitySelector && <div className="grid gap-2">
              <Label htmlFor={`registered-machine-${objective}`}>Machine</Label>
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger id={`registered-machine-${objective}`}>
                  <SelectValue placeholder="Select a registered machine" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model.entityId} value={model.entityId}>
                      {model.machineName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>}

            {!isForecast ? (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Sensor values</p>
                    <p className="text-xs text-muted-foreground">
                      {loadingInputs
                        ? "Loading the latest reading…"
                        : latestTimestamp
                          ? `Latest reading at ${formatAppNumericDateTime(latestTimestamp)}`
                          : "No saved reading is available for this machine."}
                    </p>
                  </div>
                  {overriddenCount > 0 ? (
                    <Button type="button" variant="outline" size="sm" onClick={resetToLatest} disabled={loadingInputs}>
                      <ArrowClockwiseIcon /> Reset to latest
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {activeFeatures.map((feature) => {
                    const overridden = String(valueInputs[feature.name] ?? "") !== String(latestValues[feature.name] ?? "");
                    return (
                      <div key={feature.id} className="grid gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor={`prediction-${feature.id}`}>
                            {feature.name}{feature.unit ? ` (${feature.unit})` : ""}
                          </Label>
                          {overridden ? <Badge>Changed</Badge> : null}
                        </div>
                        {feature.dtype === "boolean" ? (
                          <Select
                            value={valueInputs[feature.name] ?? ""}
                            onValueChange={(value) => setValueInputs((current) => ({ ...current, [feature.name]: value }))}
                          >
                            <SelectTrigger id={`prediction-${feature.id}`}><SelectValue placeholder="Select true or false" /></SelectTrigger>
                            <SelectContent><SelectItem value="true">true</SelectItem><SelectItem value="false">false</SelectItem></SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id={`prediction-${feature.id}`}
                            type={feature.dtype === "float" || feature.dtype === "integer" ? "number" : "text"}
                            step={feature.dtype === "integer" ? 1 : feature.dtype === "float" ? "any" : undefined}
                            value={valueInputs[feature.name] ?? ""}
                            onChange={(event) => setValueInputs((current) => ({ ...current, [feature.name]: event.target.value }))}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                {!loadingInputs && activeFeatures.length === 0 ? (
                  <p className="text-sm text-destructive">The active model does not expose a compatible input contract.</p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Active model version {selected?.currentVersions[objective] ?? "—"}
              </span>
              <Button
                onClick={() => void execute()}
                disabled={running || loadingInputs || !selected || (!isForecast && activeFeatures.length === 0)}
              >
                <ArrowRightIcon />
                {running
                  ? "Running..."
                  : isForecast
                    ? "Run forecast"
                    : checkLabel}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isForecast ? "Forecast result" : "Prediction result"}
            </CardTitle>
            <CardDescription className="text-sm">
              {selected?.machineName ?? "Select a registered machine"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm" aria-live="polite">
            {!result ? (
              <p className="text-muted-foreground">
                {isForecast
                  ? "Select Run forecast to see the model's projection here."
                  : vibrationLevel
                    ? "Select Check vibration level to see the predicted vibration level here."
                    : "Select Check failure risk to see the model's assessment here."}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <CheckCircleIcon className="text-success" size={20} aria-hidden="true" />
                  <SourceAttribution provenance={result.provenance} />
                  <span>
                    {result.overriddenFeatures.length > 0
                      ? `Based on ${result.overriddenFeatures.length} changed value${result.overriddenFeatures.length === 1 ? "" : "s"}`
                      : "Based on the latest saved reading"}
                  </span>
                </div>

                {result.predictedLabel ? (
                  <div className="border border-primary/30 bg-primary/5 p-3">
                    <p className="text-xs text-muted-foreground">
                      {vibrationLevel ? "Predicted vibration level" : "Most likely result"}
                    </p>
                    <p className="mt-1 text-lg font-semibold">{result.predictedLabel}</p>
                  </div>
                ) : null}

                <div className="grid gap-2 md:grid-cols-2">
                  {Object.entries(outputs ?? {}).map(([name, value]) => (
                    <div key={name} className="border border-border p-3">
                      <p className="text-xs text-muted-foreground">{name}</p>
                      <p className="mt-1 text-lg font-semibold">
                        {isForecast
                          ? Number(value).toFixed(4)
                          : `${(Number(value) * 100).toFixed(1)}%`}
                      </p>
                    </div>
                  ))}
                </div>

                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer py-1 font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                    Technical details
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">Version {result.modelVersion}</Badge>
                    <Badge variant="secondary">{result.inputRows} rows</Badge>
                    <Badge variant="secondary">Session {result.sessionId}</Badge>
                    {result.overriddenFeatures.length > 0 ? (
                      <Badge>{result.overriddenFeatures.length} audited override{result.overriddenFeatures.length === 1 ? "" : "s"}</Badge>
                    ) : (
                      <Badge variant="secondary">Latest telemetry unchanged</Badge>
                    )}
                  </div>
                </details>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
