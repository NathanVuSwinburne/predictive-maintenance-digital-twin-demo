/**
 * Frontend-only MLOps types.
 *
 * These mirror the shapes the production FastAPI service returns, trimmed to what the
 * demo can honestly compute in a browser. Nothing here talks to a backend: every value
 * on screen is derived from the bundled public sample rows in `datasets.ts`.
 */

export type Capability = "simulate" | "predict";

export type FeatureDtype = "float" | "integer" | "boolean" | "string";

/** How one column is read for a recipe, independently of how the machine registered it. */
export type ColumnType = "number" | "integer" | "text" | "boolean";

export type MachineFeature = {
  name: string;
  unit: string | null;
  dtype: FeatureDtype;
  /** Short note shown in the data stage, so a column is more than a header string. */
  note?: string;
};

export type DataSource = {
  id: string;
  label: string;
  kind: "public-dataset" | "synthetic-fixture" | "mqtt-stream";
  origin: string;
  licence: string;
  rowCount: number;
  sessionCount: number;
  connectedAt: string;
};

export type SchemaMigrationEntry = {
  schemaVersion: number;
  at: string;
  summary: string;
};

export type DemoMachine = {
  id: string;
  name: string;
  description: string;
  capabilities: Capability[];
  schemaVersion: number;
  createdAt: string;
  features: MachineFeature[];
  /** Columns that are metadata, never model inputs. */
  timeColumn: string | null;
  sessionColumn: string | null;
  target: TargetContract | null;
  sources: DataSource[];
  /** How this machine's schema got to where it is — the generalisation story. */
  migrations: SchemaMigrationEntry[];
  sampleRows: SampleRow[];
  /** Full population figures the bundled sample stands in for. */
  population: { rows: number; sessions: number; span: string };
};

export type TargetContract = {
  column: string;
  taskType: "binary" | "multiclass";
  classes: string[];
  positiveClass: string | null;
};

export type SampleRow = {
  timestamp: string;
  sessionId: string;
  values: Record<string, number | string | boolean | null>;
};

export type DerivedFeatureRecipe = {
  name: string;
  expression: string;
  dtype: "float" | "integer";
};

export type CategoricalRecipe = {
  name: string;
  encoding: "one_hot" | "frequency" | "ordinal";
  ordinalOrder: string[];
};

export type PreprocessingRecipe = {
  objective: "forecast" | "failure_detection";
  featureNames: string[];
  derivedFeatures: DerivedFeatureRecipe[];
  categoricalFeatures: CategoricalRecipe[];
  columnTypes: Record<string, ColumnType>;
  splitStrategy: "none" | "chronological" | "random" | "stratified";
  testFraction: number;
  seed: number;
  missingStrategy: "none" | "drop" | "mean" | "median";
  categoricalMissingStrategy: "none" | "mode" | "missing_category";
  unknownCategoryPolicy: "error" | "unknown_bucket";
  outlierClipping: boolean;
  iqrMultiplier: number;
  scaler: "none" | "standard" | "robust" | "minmax";
  target: TargetContract | null;
};

export type PartitionSummary = {
  rowCount: number;
  timeStart: string | null;
  timeEnd: string | null;
  classCounts: Record<string, number>;
};

export type PreviewRow = {
  timestamp: string;
  sessionId: string;
  rawValues: Record<string, number | string | boolean | null>;
  transformedValues: Record<string, number | string | boolean | null>;
  encodedTarget: number | null;
};

/** What one formula produced, measured before any transform covers the blanks up. */
export type DerivedColumnSummary = {
  rowCount: number;
  blankCount: number;
  sampleValues: Array<number | null>;
};

export type PreviewResult = {
  recipe: PreprocessingRecipe;
  recipeDigest: string;
  sourceBoundaryDigest: string;
  raw: PartitionSummary;
  train: PartitionSummary;
  test: PartitionSummary;
  rawRows: PreviewRow[];
  trainRows: PreviewRow[];
  testRows: PreviewRow[];
  fittedStatistics: Record<string, unknown>;
  affectedRows: { missing: number; outliers: number; scaled: number };
  warnings: string[];
  transformedFeatureNames: string[];
  derivedColumns: Record<string, DerivedColumnSummary>;
  rowLimit: number;
};

export type DatasetVersion = {
  id: string;
  machineId: string;
  datasetVersion: number;
  capability: Capability;
  status: "building" | "ready" | "failed";
  rowCount: number;
  featureSignature: string[];
  recipe: PreprocessingRecipe;
  recipeDigest: string;
  contentDigest: string;
  splitSummary: { train: number; test: number };
  fittedStatistics: Record<string, unknown>;
  createdAt: string;
  lockedAt: string | null;
};

export type TrainingParameterOption = {
  key: string;
  label: string;
  description: string;
  type: "integer" | "number" | "boolean" | "select";
  default: string | number | boolean;
  minimum?: number;
  maximum?: number;
  unit?: string;
  choices?: string[];
};

export type ArchitectureOption = {
  id: string;
  label: string;
  capability: Capability;
  description: string;
  parameters: TrainingParameterOption[];
};

export type QualityStatus = "recommended" | "borderline" | "not_recommended" | "incompatible";

export type TrainingRun = {
  id: string;
  machineId: string;
  datasetVersionId: string;
  datasetVersion: number;
  datasetContentDigest: string;
  capability: Capability;
  architecture: string;
  architectureLabel: string;
  hyperparameters: Record<string, string | number | boolean>;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: number;
  metrics: Record<string, number>;
  outputContract: {
    labels?: string[];
    confusionMatrix?: number[][];
    baselineLabel?: string;
    qualityStatus?: QualityStatus;
    qualityNote?: string;
  } | null;
  modelName: string | null;
  modelVersion: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  promotedAt: string | null;
};

export type ModelDeployment = {
  id: string;
  machineId: string;
  capability: Capability;
  trainingRunId: string;
  modelName: string;
  modelVersion: string;
  alias: "production";
  active: boolean;
  requestedAt: string;
  overrideReason: string | null;
};

export type Stage = "machine" | "data" | "prepare" | "train";
