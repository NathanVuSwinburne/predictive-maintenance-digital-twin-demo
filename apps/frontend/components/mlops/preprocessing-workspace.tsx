"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ArrowRightIcon, CheckIcon, SlidersHorizontalIcon, WarningIcon } from "@phosphor-icons/react";

import { DerivedFeatureEditor } from "@/components/mlops/derived-feature-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isDerivedFeatureSendable } from "@/lib/demo-mlops/formula";
import {
  COLUMN_TYPE_LABEL,
  declaredColumnType,
  isNumericColumnType,
  previewRecipe,
  retypeColumn,
} from "@/lib/demo-mlops/preprocessing";
import type {
  ColumnType,
  DemoMachine,
  DerivedFeatureRecipe,
  PreprocessingRecipe,
  PreviewResult,
} from "@/lib/demo-mlops/types";

type Partition = "raw" | "train" | "test";

const scalerHelp: Record<PreprocessingRecipe["scaler"], string> = {
  none: "Leave numeric values unchanged.",
  standard: "Centre on the Train mean and divide by the Train standard deviation.",
  robust: "Centre on the Train median and divide by the Train interquartile range.",
  minmax: "Map the Train minimum to 0 and maximum to 1; Test may fall outside that range.",
};

/** Formulas worth offering per machine, because the labels genuinely depend on them. */
const SUGGESTIONS: Record<string, Array<{ name: string; expression: string; why: string }>> = {
  "mach-ai4i-mill": [
    {
      name: "power_w",
      expression: '"Torque [Nm]" * "Rotational speed [rpm]" * 2 * pi / 60',
      why: "Power failure is a band on torque × speed. Neither column shows it alone.",
    },
    {
      name: "temp_difference_k",
      expression: '"Process temperature [K]" - "Air temperature [K]"',
      why: "Heat-dissipation failure is a threshold on this difference, plus a speed limit.",
    },
    {
      name: "overstrain",
      expression: '"Tool wear [min]" * "Torque [Nm]"',
      why: "Overstrain failure trips above a limit on wear × torque that varies by quality variant.",
    },
  ],
  "mach-utility-pump": [
    {
      name: "specific_power",
      expression: '"motor_power_kw" / "flow_lpm" * 1000',
      why: "Power spent per litre moved rises as the impeller wears, before either column looks wrong.",
    },
  ],
  "mach-packaging-drive": [
    {
      name: "radial_magnitude",
      expression: 'sqrt("vibration_x_g" ** 2 + "vibration_y_g" ** 2)',
      why: "Imbalance shows in the resultant of the two radial axes, not in either one.",
    },
  ],
};

type Props = {
  machine: DemoMachine;
  recipe: PreprocessingRecipe;
  onRecipeChange: (recipe: PreprocessingRecipe) => void;
  isBuilding: boolean;
  onBuild: (preview: PreviewResult) => void;
};

export function PreprocessingWorkspace({
  machine,
  recipe,
  onRecipeChange,
  isBuilding,
  onBuild,
}: Props) {
  const [activePartition, setActivePartition] = useState<Partition>("raw");

  const availableColumns = useMemo(
    () => machine.features.map((feature) => feature.name),
    [machine.features],
  );

  const effectiveType = (name: string, dtype: string) =>
    recipe.columnTypes[name] ?? declaredColumnType(dtype);

  const numericColumns = machine.features.filter((feature) =>
    isNumericColumnType(effectiveType(feature.name, feature.dtype)),
  );
  const categoricalColumns = machine.features.filter(
    (feature) => !isNumericColumnType(effectiveType(feature.name, feature.dtype)),
  );

  // A half-typed formula must not reach the engine: the preview recomputes on every
  // keystroke, and a column name mid-spelling would blank the table the user is reading.
  const requestedRecipe = useMemo(() => {
    const sendable = (item: DerivedFeatureRecipe) => isDerivedFeatureSendable(item, availableColumns);
    const pending = new Set(
      recipe.derivedFeatures.filter((item) => !sendable(item)).map((item) => item.name.trim()),
    );
    return {
      ...recipe,
      derivedFeatures: recipe.derivedFeatures.filter(sendable),
      featureNames: recipe.featureNames.filter((name) => !pending.has(name)),
    };
  }, [availableColumns, recipe]);

  const unsoundFormulaCount = recipe.derivedFeatures.filter(
    (item) => !isDerivedFeatureSendable(item, availableColumns),
  ).length;

  const selectedCount = requestedRecipe.featureNames.length + requestedRecipe.categoricalFeatures.length;

  // The engine walks every bundled row, so the preview trails the controls by a render
  // rather than blocking the tick that ticked a checkbox. Deferring the recipe keeps the
  // sidebar responsive without a debounce timer holding a stale copy of the state.
  const deferredRecipe = useDeferredValue(requestedRecipe);
  const isComputing = deferredRecipe !== requestedRecipe;
  const preview = useMemo(() => {
    const count =
      deferredRecipe.featureNames.length + deferredRecipe.categoricalFeatures.length;
    // With nothing selected there is nothing to show, and the last preview would be a lie
    // about the current recipe.
    if (count === 0) return null;
    return previewRecipe(machine, deferredRecipe);
  }, [deferredRecipe, machine]);

  function update(patch: Partial<PreprocessingRecipe>) {
    onRecipeChange({ ...recipe, ...patch });
  }

  function setDerivedFeatures(derivedFeatures: DerivedFeatureRecipe[]) {
    // A calculated column is only worth computing if the model uses it, so selection
    // follows the formula list rather than asking for a box that cannot sensibly be left
    // unticked.
    const previous = recipe.derivedFeatures.map((item) => item.name.trim());
    const next = derivedFeatures.map((item) => item.name.trim()).filter(Boolean);
    const kept = recipe.featureNames.filter(
      (name) => !previous.includes(name) || next.includes(name),
    );
    onRecipeChange({
      ...recipe,
      derivedFeatures,
      featureNames: [...kept, ...next.filter((name) => !kept.includes(name))],
    });
  }

  const knownCategories = useMemo(() => {
    const categorical = (preview?.fittedStatistics.categorical ?? {}) as Record<
      string,
      { categories?: string[] }
    >;
    return Object.fromEntries(
      Object.entries(categorical).map(([name, entry]) => [name, entry.categories ?? []]),
    );
  }, [preview]);

  const rows =
    preview === null
      ? []
      : activePartition === "raw"
        ? preview.rawRows
        : activePartition === "train"
          ? preview.trainRows
          : preview.testRows;

  const displayFeatures =
    activePartition === "raw"
      ? [...recipe.featureNames, ...recipe.categoricalFeatures.map((item) => item.name)]
      : (preview?.transformedFeatureNames ?? recipe.featureNames);

  const blockingError =
    selectedCount === 0
      ? "Select at least one model feature."
      : recipe.objective === "failure_detection" && !recipe.target
        ? "This machine has no confirmed target column, so nothing can be detected from it."
        : null;

  return (
    <div className="grid overflow-hidden rounded-xl border bg-card xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="border-b bg-muted/15 p-5 xl:border-b-0 xl:border-r">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg border bg-primary/10 text-primary">
            <SlidersHorizontalIcon size={20} />
          </span>
          <div>
            <p className="instrument-label">Recipe controls</p>
            <h3 className="font-semibold">Transform the preview</h3>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          <div className="rounded-lg border bg-background p-3 text-sm">
            <span className="font-medium">Model goal: </span>
            {recipe.objective === "forecast" ? "Forecast Sensor Values" : "Detect Possible Failure"}
          </div>

          <details className="rounded-lg border bg-background p-3">
            <summary className="cursor-pointer text-sm font-medium">Column types</summary>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              How each column is read, for this dataset only. Change one when the registered
              type is wrong for this recipe: a sensor that arrived as text, or a 0/1 flag
              that is really a category. Retyping moves the column between the lists below.
            </p>
            <div className="mt-2 max-h-56 space-y-1 overflow-auto">
              {machine.features.map((feature) => {
                const declared = declaredColumnType(feature.dtype);
                const offered: ColumnType[] =
                  recipe.objective === "forecast"
                    ? ["number", "integer"]
                    : ["number", "integer", "text", "boolean"];
                const options = offered.includes(declared) ? offered : [...offered, declared];
                return (
                  <div key={feature.name} className="grid grid-cols-[1fr_128px] items-center gap-2">
                    <span className="truncate text-xs" title={feature.name}>
                      {feature.name}
                    </span>
                    <select
                      aria-label={`${feature.name} type`}
                      className="h-8 rounded-md border border-input bg-background px-1 text-xs"
                      value={effectiveType(feature.name, feature.dtype)}
                      onChange={(event) =>
                        onRecipeChange(
                          retypeColumn(recipe, feature.name, event.target.value as ColumnType, declared),
                        )
                      }
                    >
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {COLUMN_TYPE_LABEL[option]}
                          {option === declared ? " · registered" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </details>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Numeric model features</legend>
            <p className="text-xs text-muted-foreground">
              Timestamp and session stay metadata, never model inputs.
            </p>
            <div className="max-h-44 space-y-1 overflow-auto rounded-lg border bg-background p-2">
              {numericColumns.map((feature) => (
                <label
                  key={feature.name}
                  className="flex items-center justify-between gap-3 p-1 text-sm"
                >
                  <span className="truncate">{feature.name}</span>
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={recipe.featureNames.includes(feature.name)}
                    onChange={(event) =>
                      update({
                        featureNames: event.target.checked
                          ? [...recipe.featureNames, feature.name]
                          : recipe.featureNames.filter((name) => name !== feature.name),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <DerivedFeatureEditor
            features={recipe.derivedFeatures}
            availableColumns={availableColumns}
            onChange={setDerivedFeatures}
            columnSummaries={preview?.derivedColumns}
            suggestions={SUGGESTIONS[machine.id]}
            unavailableReason={
              recipe.objective === "forecast"
                ? "A forecast feeds its own predictions back in as inputs, so every input has to be a column the machine actually sends. Calculated features are available on Detect Possible Failure."
                : undefined
            }
          />

          {recipe.objective === "failure_detection" && categoricalColumns.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Categorical model features</legend>
              <div className="max-h-64 space-y-2 overflow-auto rounded-lg border bg-background p-2">
                {categoricalColumns.map((feature) => {
                  const selected = recipe.categoricalFeatures.find(
                    (item) => item.name === feature.name,
                  );
                  return (
                    <div key={feature.name} className="space-y-2">
                      <div className="grid grid-cols-[1fr_116px] items-center gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={Boolean(selected)}
                            onChange={(event) =>
                              update({
                                categoricalFeatures: event.target.checked
                                  ? [
                                      ...recipe.categoricalFeatures,
                                      { name: feature.name, encoding: "one_hot", ordinalOrder: [] },
                                    ]
                                  : recipe.categoricalFeatures.filter(
                                      (item) => item.name !== feature.name,
                                    ),
                              })
                            }
                          />
                          <span className="truncate">{feature.name}</span>
                        </label>
                        {selected && (
                          <select
                            aria-label={`${feature.name} encoding`}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                            value={selected.encoding}
                            onChange={(event) =>
                              update({
                                categoricalFeatures: recipe.categoricalFeatures.map((item) =>
                                  item.name === feature.name
                                    ? {
                                        ...item,
                                        encoding: event.target.value as typeof item.encoding,
                                        ordinalOrder:
                                          event.target.value === "ordinal" && item.ordinalOrder.length === 0
                                            ? (knownCategories[feature.name] ?? [])
                                            : item.ordinalOrder,
                                      }
                                    : item,
                                ),
                              })
                            }
                          >
                            <option value="one_hot">One-hot</option>
                            <option value="frequency">Frequency</option>
                            <option value="ordinal">Ordinal</option>
                          </select>
                        )}
                      </div>
                      {selected?.encoding === "ordinal" && (
                        <div className="ml-6 rounded-md border bg-muted/20 p-2">
                          <p className="text-[11px] text-muted-foreground">
                            Confirm the low-to-high order for every Train category.
                          </p>
                          {selected.ordinalOrder.length === 0 ? (
                            <p className="mt-1 text-xs text-destructive">
                              No categories known yet. Preview once with One-hot to discover them.
                            </p>
                          ) : (
                            <ol className="mt-1 space-y-1">
                              {selected.ordinalOrder.map((category, index) => (
                                <li
                                  key={category}
                                  className="flex items-center justify-between gap-2 text-xs"
                                >
                                  <span className="font-mono">
                                    {index}. {category}
                                  </span>
                                  <span className="flex gap-1">
                                    <button
                                      type="button"
                                      aria-label={`Move ${category} earlier`}
                                      className="rounded border px-1.5 disabled:opacity-30"
                                      disabled={index === 0}
                                      onClick={() =>
                                        update({
                                          categoricalFeatures: recipe.categoricalFeatures.map((item) => {
                                            if (item.name !== feature.name) return item;
                                            const order = [...item.ordinalOrder];
                                            [order[index], order[index - 1]] = [order[index - 1], order[index]];
                                            return { ...item, ordinalOrder: order };
                                          }),
                                        })
                                      }
                                    >
                                      ▲
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`Move ${category} later`}
                                      className="rounded border px-1.5 disabled:opacity-30"
                                      disabled={index === selected.ordinalOrder.length - 1}
                                      onClick={() =>
                                        update({
                                          categoricalFeatures: recipe.categoricalFeatures.map((item) => {
                                            if (item.name !== feature.name) return item;
                                            const order = [...item.ordinalOrder];
                                            [order[index], order[index + 1]] = [order[index + 1], order[index]];
                                            return { ...item, ordinalOrder: order };
                                          }),
                                        })
                                      }
                                    >
                                      ▼
                                    </button>
                                  </span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {recipe.categoricalFeatures.length > 0 && (
                <div className="space-y-3 border-t pt-3">
                  <div className="space-y-2">
                    <Label htmlFor="categorical-missing">Missing categorical values</Label>
                    <select
                      id="categorical-missing"
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={recipe.categoricalMissingStrategy}
                      onChange={(event) =>
                        update({
                          categoricalMissingStrategy: event.target
                            .value as PreprocessingRecipe["categoricalMissingStrategy"],
                        })
                      }
                    >
                      <option value="none">No action</option>
                      <option value="mode">Train mode imputation</option>
                      <option value="missing_category">Explicit &quot;missing&quot; category</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unknown-category">Unseen categories in Test</Label>
                    <select
                      id="unknown-category"
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={recipe.unknownCategoryPolicy}
                      onChange={(event) =>
                        update({
                          unknownCategoryPolicy: event.target
                            .value as PreprocessingRecipe["unknownCategoryPolicy"],
                        })
                      }
                    >
                      <option value="error">Reject the recipe</option>
                      <option value="unknown_bucket">Encode as an explicit &quot;unknown&quot;</option>
                    </select>
                  </div>
                </div>
              )}
            </fieldset>
          )}

          {recipe.objective === "failure_detection" && recipe.target && (
            <div className="rounded-lg border bg-background p-3 text-xs">
              <p className="font-medium">Target: {recipe.target.column}</p>
              <p className="mt-1 text-muted-foreground">
                {recipe.target.taskType} · {recipe.target.classes.join(" → ")}
                {recipe.target.positiveClass ? ` · positive: ${recipe.target.positiveClass}` : ""}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="split-strategy">Train / Test split</Label>
            <select
              id="split-strategy"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={recipe.splitStrategy}
              onChange={(event) =>
                update({ splitStrategy: event.target.value as PreprocessingRecipe["splitStrategy"] })
              }
            >
              <option value="none">No holdout</option>
              <option value="chronological">Chronological</option>
              <option value="random">Seeded random</option>
              {recipe.objective === "failure_detection" && (
                <option value="stratified">Stratified by outcome</option>
              )}
            </select>
            <p className="text-xs leading-5 text-muted-foreground">
              {recipe.splitStrategy === "chronological"
                ? "Earlier rows train; the newest rows test future behaviour without leakage."
                : recipe.splitStrategy === "stratified"
                  ? "Each outcome is represented in Train and Test."
                  : recipe.splitStrategy === "random"
                    ? "Reproducible, but on a time series it leaks future operating conditions."
                    : "All rows remain in Train, and nothing can be scored."}
            </p>
          </div>

          {recipe.splitStrategy !== "none" && (
            <div className="grid grid-cols-[1fr_84px] items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="test-fraction">Test fraction</Label>
                <input
                  id="test-fraction"
                  className="w-full accent-primary"
                  type="range"
                  min="0.05"
                  max="0.5"
                  step="0.05"
                  value={recipe.testFraction}
                  onChange={(event) => update({ testFraction: Number(event.target.value) })}
                />
              </div>
              <Input
                aria-label="Test fraction value"
                type="number"
                min="0.05"
                max="0.5"
                step="0.05"
                value={recipe.testFraction}
                onChange={(event) => update({ testFraction: Number(event.target.value) })}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="missing-strategy">Missing numeric values</Label>
            <select
              id="missing-strategy"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={recipe.missingStrategy}
              onChange={(event) =>
                update({ missingStrategy: event.target.value as PreprocessingRecipe["missingStrategy"] })
              }
            >
              <option value="none">No action</option>
              <option value="drop">Drop affected rows</option>
              <option value="mean">Train mean imputation</option>
              <option value="median">Train median imputation</option>
            </select>
            <p className="text-xs leading-5 text-muted-foreground">
              Mean and median are learned from Train only, then applied unchanged to Test.
            </p>
          </div>

          <label className="flex items-start justify-between gap-3 rounded-lg border bg-background p-3 text-sm">
            <span>
              <span className="block font-medium">IQR outlier clipping</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Clip to Train-derived bounds without deleting rows.
              </span>
            </span>
            <input
              type="checkbox"
              className="mt-1 accent-primary"
              checked={recipe.outlierClipping}
              onChange={(event) => update({ outlierClipping: event.target.checked })}
            />
          </label>
          {recipe.outlierClipping && (
            <div className="space-y-2">
              <Label htmlFor="iqr-multiplier">IQR multiplier</Label>
              <Input
                id="iqr-multiplier"
                type="number"
                min="0.5"
                max="5"
                step="0.1"
                value={recipe.iqrMultiplier}
                onChange={(event) => update({ iqrMultiplier: Number(event.target.value) })}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="numeric-scaler">Numeric scaling</Label>
            <select
              id="numeric-scaler"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={recipe.scaler}
              onChange={(event) =>
                update({ scaler: event.target.value as PreprocessingRecipe["scaler"] })
              }
            >
              <option value="none">None</option>
              <option value="standard">StandardScaler</option>
              <option value="robust">RobustScaler</option>
              <option value="minmax">MinMaxScaler</option>
            </select>
            <p className="text-xs leading-5 text-muted-foreground">{scalerHelp[recipe.scaler]}</p>
          </div>
        </div>
      </aside>

      <main className="min-w-0 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="instrument-label">Full dataset analysis · bounded row preview</p>
            <h3 className="mt-1 text-lg font-semibold">Raw → Train / Test</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Counts cover every bundled row. The table samples up to {preview?.rowLimit ?? 12} of
              them, showing what this recipe does to the original values.
            </p>
          </div>
          {preview && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {preview.recipeDigest.slice(0, 22)}…
            </Badge>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {(["raw", "train", "test"] as Partition[]).map((partition) => {
            const current = preview?.[partition];
            const isActive = activePartition === partition;
            return (
              <button
                key={partition}
                type="button"
                onClick={() => setActivePartition(partition)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  isActive ? "border-primary/45 bg-primary/8" : "border-border/70 hover:bg-accent/40"
                }`}
              >
                <span className="instrument-label">{partition}</span>
                <span className="data-value mt-1 block text-xl font-semibold">
                  {current?.rowCount ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {blockingError && (
          <div
            role="alert"
            className="mt-4 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <WarningIcon className="mt-0.5 shrink-0" />
            <span>{blockingError}</span>
          </div>
        )}

        {isComputing && !preview && (
          <div className="mt-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Computing the preview…
          </div>
        )}

        {preview && !blockingError && (
          <div>
            {preview.warnings.length > 0 && (
              <div className="mt-4 space-y-1 rounded-lg border border-[var(--status-watch)]/40 bg-[var(--status-watch)]/10 p-3 text-xs text-foreground">
                {preview.warnings.map((warning) => (
                  <p key={warning} className="flex gap-2">
                    <WarningIcon className="mt-0.5 shrink-0 text-[var(--status-watch)]" /> {warning}
                  </p>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{preview.affectedRows.missing} missing values handled</Badge>
              <Badge variant="secondary">{preview.affectedRows.outliers} values clipped</Badge>
              <Badge variant="secondary">{preview.affectedRows.scaled} values scaled</Badge>
              {preview[activePartition].timeStart && (
                <span className="font-mono text-[10px]">
                  {preview[activePartition].timeStart?.slice(0, 16).replace("T", " ")} →{" "}
                  {preview[activePartition].timeEnd?.slice(0, 16).replace("T", " ")}
                </span>
              )}
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>timestamp</TableHead>
                    <TableHead>session</TableHead>
                    {displayFeatures.map((feature) => (
                      <TableHead key={feature}>{feature}</TableHead>
                    ))}
                    {recipe.target && <TableHead>encoded target</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={`${row.sessionId}-${row.timestamp}`}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {row.timestamp.slice(0, 19).replace("T", " ")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.sessionId}</TableCell>
                      {displayFeatures.map((feature) => {
                        const raw = row.rawValues[feature];
                        const transformed =
                          activePartition === "raw" ? raw : row.transformedValues[feature];
                        const changed = raw !== transformed;
                        const format = (value: unknown) =>
                          value === null || value === undefined
                            ? "missing"
                            : typeof value === "number"
                              ? value.toFixed(3)
                              : String(value);
                        return (
                          <TableCell key={feature} className="font-mono text-xs">
                            {changed && raw !== undefined && (
                              <span className="mr-1 text-muted-foreground line-through">
                                {format(raw)}
                              </span>
                            )}
                            <span className={changed ? "font-semibold text-primary" : ""}>
                              {format(transformed)}
                            </span>
                          </TableCell>
                        );
                      })}
                      {recipe.target && (
                        <TableCell className="font-mono text-xs">{row.encodedTarget ?? "n/a"}</TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <details className="mt-4 rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Fitted Train-only statistics
              </summary>
              <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-muted/40 p-3 text-xs">
                {JSON.stringify(preview.fittedStatistics, null, 2)}
              </pre>
            </details>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              {unsoundFormulaCount > 0 ? (
                <p className="flex items-center gap-2 text-xs text-destructive">
                  <WarningIcon className="shrink-0" />
                  {unsoundFormulaCount === 1
                    ? "One calculated feature is unfinished, and nothing below includes it."
                    : `${unsoundFormulaCount} calculated features are unfinished, and nothing below includes them.`}
                </p>
              ) : (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckIcon className="text-[var(--status-healthy)]" /> Every statistic on this
                  screen was fitted on Train only.
                </p>
              )}
              <Button
                type="button"
                disabled={isBuilding || unsoundFormulaCount > 0}
                onClick={() => onBuild(preview)}
              >
                {isBuilding ? "Freezing dataset…" : "Freeze this recipe into a dataset"}{" "}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
