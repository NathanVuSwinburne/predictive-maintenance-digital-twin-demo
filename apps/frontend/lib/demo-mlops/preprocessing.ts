/**
 * The preprocessing recipe, executed in the browser.
 *
 * Nothing here is faked: the split, the fitted statistics, the clipping bounds and the
 * scaling are all computed from the bundled rows, and every statistic is fitted on Train
 * only and then applied unchanged to Test. That constraint is the reason this file exists
 * rather than a table of pre-baked numbers: it is the part of the workflow that is easy
 * to get quietly wrong, so the demo has to actually do it.
 */

import { compileFormula, isDerivedFeatureSendable } from "@/lib/demo-mlops/formula";
import type {
  Capability,
  ColumnType,
  DemoMachine,
  DerivedColumnSummary,
  PartitionSummary,
  PreprocessingRecipe,
  PreviewResult,
  PreviewRow,
  SampleRow,
} from "@/lib/demo-mlops/types";

export const PREVIEW_ROW_LIMIT = 12;

const NUMERIC_COLUMN_TYPES: ColumnType[] = ["number", "integer"];

export const COLUMN_TYPE_LABEL: Record<ColumnType, string> = {
  number: "Number",
  integer: "Whole number",
  text: "Category / text",
  boolean: "True / false",
};

/** The type a column is read as when the recipe says nothing about it. */
export function declaredColumnType(dtype: string): ColumnType {
  if (dtype === "float") return "number";
  if (dtype === "integer") return "integer";
  if (dtype === "boolean") return "boolean";
  return "text";
}

export function isNumericColumnType(type: ColumnType): boolean {
  return NUMERIC_COLUMN_TYPES.includes(type);
}

/**
 * The recipe with one column read as a different type. Retyping is not only a note on the
 * column: it decides which of the two model-input paths the column belongs to, so the
 * selection moves with the type rather than leaving a rejected recipe to be puzzled over.
 */
export function retypeColumn(
  recipe: PreprocessingRecipe,
  column: string,
  next: ColumnType,
  declared: ColumnType,
): PreprocessingRecipe {
  const columnTypes = { ...recipe.columnTypes };
  if (next === declared) delete columnTypes[column];
  else columnTypes[column] = next;

  const wasSelected =
    recipe.featureNames.includes(column) ||
    recipe.categoricalFeatures.some((item) => item.name === column);
  const featureNames = recipe.featureNames.filter((name) => name !== column);
  const categoricalFeatures = recipe.categoricalFeatures.filter((item) => item.name !== column);

  if (!wasSelected) return { ...recipe, columnTypes, featureNames, categoricalFeatures };
  if (isNumericColumnType(next)) {
    return { ...recipe, columnTypes, featureNames: [...featureNames, column], categoricalFeatures };
  }
  // A forecast feeds its own predictions back in, so every input has to be numeric; a
  // retyped column simply stops being a model input rather than moving list.
  if (recipe.objective === "forecast") {
    return { ...recipe, columnTypes, featureNames, categoricalFeatures };
  }
  return {
    ...recipe,
    columnTypes,
    featureNames,
    categoricalFeatures: [
      ...categoricalFeatures,
      { name: column, encoding: "one_hot", ordinalOrder: [] },
    ],
  };
}

export function defaultRecipe(machine: DemoMachine, capability: Capability): PreprocessingRecipe {
  const numeric = machine.features.filter(
    (feature) => feature.dtype === "float" || feature.dtype === "integer",
  );
  return {
    objective: capability === "simulate" ? "forecast" : "failure_detection",
    featureNames: numeric.map((feature) => feature.name),
    derivedFeatures: [],
    categoricalFeatures: [],
    columnTypes: {},
    splitStrategy: capability === "simulate" ? "chronological" : "stratified",
    testFraction: 0.2,
    seed: 42,
    missingStrategy: "none",
    categoricalMissingStrategy: "none",
    unknownCategoryPolicy: "error",
    outlierClipping: false,
    iqrMultiplier: 1.5,
    scaler: "none",
    target: capability === "predict" ? machine.target : null,
  };
}

/** djb2 over the canonical recipe JSON. Short, stable, and enough to name a build. */
export function digestOf(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
  }
  let second = 52711;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    second = ((second << 5) + second + text.charCodeAt(index)) >>> 0;
  }
  return `sha256:${hash.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * fraction;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

type NumericStatistics = {
  mean: number;
  median: number;
  standardDeviation: number;
  q1: number;
  q3: number;
  min: number;
  max: number;
  missing: number;
};

type CategoricalStatistics = {
  categories: string[];
  frequencies: Record<string, number>;
  mode: string | null;
  missing: number;
};

/** The rows the recipe operates on: the machine's own columns plus every calculated one. */
export function materialiseRows(
  machine: DemoMachine,
  recipe: PreprocessingRecipe,
): { rows: SampleRow[]; derivedColumns: Record<string, DerivedColumnSummary> } {
  const available = machine.features.map((feature) => feature.name);
  const usable = recipe.derivedFeatures.filter((feature) =>
    isDerivedFeatureSendable(feature, available),
  );
  if (usable.length === 0) return { rows: machine.sampleRows, derivedColumns: {} };

  const compiled = usable.map((feature) => {
    try {
      return { feature, program: compileFormula(feature.expression) };
    } catch {
      return null;
    }
  });

  const summaries: Record<string, DerivedColumnSummary> = {};
  for (const entry of compiled) {
    if (entry) summaries[entry.feature.name.trim()] = { rowCount: 0, blankCount: 0, sampleValues: [] };
  }

  const rows = machine.sampleRows.map((row) => {
    const values = { ...row.values };
    for (const entry of compiled) {
      if (!entry) continue;
      const name = entry.feature.name.trim();
      const raw = entry.program.evaluate(row.values);
      const value =
        raw === null ? null : entry.feature.dtype === "integer" ? Math.round(raw) : raw;
      values[name] = value;
      const summary = summaries[name];
      summary.rowCount += 1;
      if (value === null) summary.blankCount += 1;
      if (summary.sampleValues.length < 3) summary.sampleValues.push(value);
    }
    return { ...row, values };
  });

  return { rows, derivedColumns: summaries };
}

function splitRows(
  rows: SampleRow[],
  recipe: PreprocessingRecipe,
): { train: SampleRow[]; test: SampleRow[] } {
  if (recipe.splitStrategy === "none" || rows.length < 8) {
    return { train: rows, test: [] };
  }
  const testCount = Math.max(1, Math.round(rows.length * recipe.testFraction));

  if (recipe.splitStrategy === "chronological") {
    const ordered = [...rows].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    return { train: ordered.slice(0, rows.length - testCount), test: ordered.slice(rows.length - testCount) };
  }

  if (recipe.splitStrategy === "random") {
    const random = seededRandom(recipe.seed);
    const shuffled = rows
      .map((row) => ({ row, key: random() }))
      .sort((left, right) => left.key - right.key)
      .map((entry) => entry.row);
    return { train: shuffled.slice(testCount), test: shuffled.slice(0, testCount) };
  }

  // Stratified: hold out the same fraction of every outcome, so a rare class survives.
  const column = recipe.target?.column;
  if (!column) return { train: rows.slice(testCount), test: rows.slice(0, testCount) };
  const random = seededRandom(recipe.seed);
  const groups = new Map<string, SampleRow[]>();
  for (const row of rows) {
    const key = String(row.values[column] ?? "missing");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const train: SampleRow[] = [];
  const test: SampleRow[] = [];
  for (const group of groups.values()) {
    const shuffled = group
      .map((row) => ({ row, key: random() }))
      .sort((left, right) => left.key - right.key)
      .map((entry) => entry.row);
    const take = Math.max(1, Math.round(shuffled.length * recipe.testFraction));
    test.push(...shuffled.slice(0, take));
    train.push(...shuffled.slice(take));
  }
  return { train, test };
}

function numericStatistics(rows: SampleRow[], column: string): NumericStatistics {
  const values: number[] = [];
  let missing = 0;
  for (const row of rows) {
    const raw = row.values[column];
    const numeric = typeof raw === "boolean" ? Number(raw) : Number(raw);
    if (raw === null || raw === undefined || raw === "" || !Number.isFinite(numeric)) missing += 1;
    else values.push(numeric);
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length || 1);
  return {
    mean,
    median: quantile(sorted, 0.5),
    standardDeviation: Math.sqrt(variance),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    missing,
  };
}

function categoricalStatistics(rows: SampleRow[], column: string): CategoricalStatistics {
  const frequencies: Record<string, number> = {};
  let missing = 0;
  for (const row of rows) {
    const raw = row.values[column];
    if (raw === null || raw === undefined || raw === "") {
      missing += 1;
      continue;
    }
    const key = String(raw);
    frequencies[key] = (frequencies[key] ?? 0) + 1;
  }
  const categories = Object.keys(frequencies).sort();
  const mode =
    categories.length === 0
      ? null
      : categories.reduce((best, key) => (frequencies[key] > frequencies[best] ? key : best), categories[0]);
  return { categories, frequencies, mode, missing };
}

function summarise(rows: SampleRow[], recipe: PreprocessingRecipe): PartitionSummary {
  const classCounts: Record<string, number> = {};
  if (recipe.target) {
    for (const row of rows) {
      const key = String(row.values[recipe.target.column] ?? "missing");
      classCounts[key] = (classCounts[key] ?? 0) + 1;
    }
  }
  const stamps = rows.map((row) => row.timestamp).sort();
  return {
    rowCount: rows.length,
    timeStart: stamps[0] ?? null,
    timeEnd: stamps[stamps.length - 1] ?? null,
    classCounts,
  };
}

type TransformContext = {
  numeric: Record<string, NumericStatistics>;
  categorical: Record<string, CategoricalStatistics>;
  affected: { missing: number; outliers: number; scaled: number };
};

function transformRow(
  row: SampleRow,
  recipe: PreprocessingRecipe,
  context: TransformContext,
  countEffects: boolean,
): PreviewRow {
  const transformed: Record<string, number | string | boolean | null> = {};

  for (const name of recipe.featureNames) {
    const statistics = context.numeric[name];
    const raw = row.values[name];
    let value: number | null =
      raw === null || raw === undefined || raw === "" ? null : Number(raw);
    if (value !== null && !Number.isFinite(value)) value = null;

    if (value === null && statistics) {
      if (recipe.missingStrategy === "mean") value = statistics.mean;
      else if (recipe.missingStrategy === "median") value = statistics.median;
      if (countEffects && recipe.missingStrategy !== "none") context.affected.missing += 1;
    }

    if (value !== null && statistics && recipe.outlierClipping) {
      const spread = statistics.q3 - statistics.q1;
      const low = statistics.q1 - recipe.iqrMultiplier * spread;
      const high = statistics.q3 + recipe.iqrMultiplier * spread;
      if (value < low || value > high) {
        value = Math.min(Math.max(value, low), high);
        if (countEffects) context.affected.outliers += 1;
      }
    }

    if (value !== null && statistics && recipe.scaler !== "none") {
      if (recipe.scaler === "standard") {
        value = statistics.standardDeviation === 0 ? 0 : (value - statistics.mean) / statistics.standardDeviation;
      } else if (recipe.scaler === "robust") {
        const spread = statistics.q3 - statistics.q1;
        value = spread === 0 ? 0 : (value - statistics.median) / spread;
      } else {
        const span = statistics.max - statistics.min;
        value = span === 0 ? 0 : (value - statistics.min) / span;
      }
      if (countEffects) context.affected.scaled += 1;
    }

    transformed[name] = value;
  }

  for (const feature of recipe.categoricalFeatures) {
    const statistics = context.categorical[feature.name];
    const raw = row.values[feature.name];
    let key = raw === null || raw === undefined || raw === "" ? null : String(raw);
    if (key === null && statistics) {
      if (recipe.categoricalMissingStrategy === "mode") key = statistics.mode;
      else if (recipe.categoricalMissingStrategy === "missing_category") key = "missing";
      if (countEffects && recipe.categoricalMissingStrategy !== "none") context.affected.missing += 1;
    }
    const known = statistics?.categories ?? [];
    if (feature.encoding === "one_hot") {
      for (const category of known) {
        transformed[`${feature.name}=${category}`] = key === category ? 1 : 0;
      }
      if (recipe.unknownCategoryPolicy === "unknown_bucket") {
        transformed[`${feature.name}=unknown`] = key !== null && !known.includes(key) ? 1 : 0;
      }
    } else if (feature.encoding === "frequency") {
      const total = Object.values(statistics?.frequencies ?? {}).reduce((sum, count) => sum + count, 0);
      const count = key === null ? 0 : (statistics?.frequencies[key] ?? 0);
      transformed[feature.name] = total === 0 ? 0 : Number((count / total).toFixed(4));
    } else {
      const order = feature.ordinalOrder.length > 0 ? feature.ordinalOrder : known;
      const position = key === null ? -1 : order.indexOf(key);
      transformed[feature.name] = position;
    }
  }

  const encodedTarget = recipe.target
    ? recipe.target.classes.indexOf(String(row.values[recipe.target.column] ?? ""))
    : null;

  return {
    timestamp: row.timestamp,
    sessionId: row.sessionId,
    rawValues: row.values,
    transformedValues: transformed,
    encodedTarget: encodedTarget === undefined ? null : encodedTarget,
  };
}

export function transformedFeatureNames(
  recipe: PreprocessingRecipe,
  context: { categorical: Record<string, CategoricalStatistics> },
): string[] {
  const names = [...recipe.featureNames];
  for (const feature of recipe.categoricalFeatures) {
    const known = context.categorical[feature.name]?.categories ?? [];
    if (feature.encoding === "one_hot") {
      names.push(...known.map((category) => `${feature.name}=${category}`));
      if (recipe.unknownCategoryPolicy === "unknown_bucket") names.push(`${feature.name}=unknown`);
    } else {
      names.push(feature.name);
    }
  }
  return names;
}

export function previewRecipe(machine: DemoMachine, recipe: PreprocessingRecipe): PreviewResult {
  const { rows, derivedColumns } = materialiseRows(machine, recipe);
  const { train, test } = splitRows(rows, recipe);

  const numeric: Record<string, NumericStatistics> = {};
  for (const name of recipe.featureNames) numeric[name] = numericStatistics(train, name);
  const categorical: Record<string, CategoricalStatistics> = {};
  for (const feature of recipe.categoricalFeatures) {
    categorical[feature.name] = categoricalStatistics(train, feature.name);
  }

  const context: TransformContext = { numeric, categorical, affected: { missing: 0, outliers: 0, scaled: 0 } };
  const trainRows = train.slice(0, PREVIEW_ROW_LIMIT).map((row) => transformRow(row, recipe, context, false));
  const testRows = test.slice(0, PREVIEW_ROW_LIMIT).map((row) => transformRow(row, recipe, context, false));
  const rawRows = rows.slice(0, PREVIEW_ROW_LIMIT).map((row) => transformRow(row, recipe, context, false));
  // Counted over every row, not only the ones the table shows.
  for (const row of rows) transformRow(row, recipe, context, true);

  const warnings = collectWarnings(machine, recipe, rows, train, test, numeric, categorical);

  const fittedStatistics: Record<string, unknown> = {
    fittedOn: `${train.length} Train rows`,
    numeric: Object.fromEntries(
      Object.entries(numeric).map(([name, statistics]) => [
        name,
        {
          mean: Number(statistics.mean.toFixed(4)),
          median: Number(statistics.median.toFixed(4)),
          std: Number(statistics.standardDeviation.toFixed(4)),
          q1: Number(statistics.q1.toFixed(4)),
          q3: Number(statistics.q3.toFixed(4)),
          min: Number(statistics.min.toFixed(4)),
          max: Number(statistics.max.toFixed(4)),
          missing: statistics.missing,
        },
      ]),
    ),
  };
  if (Object.keys(categorical).length > 0) {
    fittedStatistics.categorical = Object.fromEntries(
      Object.entries(categorical).map(([name, statistics]) => [
        name,
        { categories: statistics.categories, mode: statistics.mode, frequencies: statistics.frequencies },
      ]),
    );
  }

  return {
    recipe,
    recipeDigest: digestOf(recipe),
    sourceBoundaryDigest: digestOf({ machine: machine.id, rows: machine.sampleRows.length }),
    raw: summarise(rows, recipe),
    train: summarise(train, recipe),
    test: summarise(test, recipe),
    rawRows,
    trainRows,
    testRows,
    fittedStatistics,
    affectedRows: context.affected,
    warnings,
    transformedFeatureNames: transformedFeatureNames(recipe, { categorical }),
    derivedColumns,
    rowLimit: PREVIEW_ROW_LIMIT,
  };
}

function collectWarnings(
  machine: DemoMachine,
  recipe: PreprocessingRecipe,
  rows: SampleRow[],
  train: SampleRow[],
  test: SampleRow[],
  numeric: Record<string, NumericStatistics>,
  categorical: Record<string, CategoricalStatistics>,
): string[] {
  const warnings: string[] = [];

  if (recipe.splitStrategy === "none") {
    warnings.push(
      "No holdout: every row trains, so the score this produces is the model marking its own homework.",
    );
  }
  if (recipe.splitStrategy === "random" && recipe.objective === "forecast") {
    warnings.push(
      "A seeded random split scatters neighbouring readings across Train and Test. On a time series that leaks the future, and the score will look better than the model is.",
    );
  }
  if (recipe.splitStrategy === "random" && machine.id === "mach-packaging-drive") {
    warnings.push(
      "Rows 500 ms apart end up on both sides of this split. Prefer chronological for this machine.",
    );
  }
  if (recipe.objective === "failure_detection" && recipe.target) {
    const testCounts = summarise(test, recipe).classCounts;
    const present = Object.entries(testCounts).filter(([, count]) => count > 0);
    if (present.length < 2) {
      warnings.push(
        "The held-out rows contain fewer than two outcomes, so accuracy on them cannot mean anything.",
      );
    } else {
      const smallest = present.reduce((best, entry) => (entry[1] < best[1] ? entry : best), present[0]);
      if (smallest[1] < 10) {
        warnings.push(
          `Only ${smallest[1]} held-out examples of "${smallest[0]}". Per-class numbers on that outcome will be very noisy.`,
        );
      }
    }
  }
  const missingColumns = Object.entries(numeric).filter(([, statistics]) => statistics.missing > 0);
  if (missingColumns.length > 0 && recipe.missingStrategy === "none") {
    warnings.push(
      `${missingColumns.map(([name]) => name).join(", ")} still contains blank readings and the recipe does nothing about them.`,
    );
  }
  for (const feature of recipe.categoricalFeatures) {
    if (feature.encoding === "ordinal" && feature.ordinalOrder.length === 0) {
      warnings.push(
        `${feature.name} is set to ordinal but has no confirmed order, so the encoder falls back to alphabetical.`,
      );
    }
    const unseen = new Set<string>();
    for (const row of test) {
      const key = row.values[feature.name];
      if (key !== null && key !== undefined && !categorical[feature.name]?.categories.includes(String(key))) {
        unseen.add(String(key));
      }
    }
    if (unseen.size > 0 && recipe.unknownCategoryPolicy === "error") {
      warnings.push(
        `Test contains ${feature.name} values never seen in Train (${[...unseen].join(", ")}), and the recipe is set to reject them.`,
      );
    }
  }
  if (recipe.featureNames.length + recipe.categoricalFeatures.length < 2) {
    warnings.push("One model input is rarely enough for anything to beat the trivial answer.");
  }
  if (rows.length !== machine.sampleRows.length) {
    warnings.push("Calculated columns changed the row count, which should never happen.");
  }
  if (train.length === 0) warnings.push("The split left nothing to train on.");
  return warnings;
}
