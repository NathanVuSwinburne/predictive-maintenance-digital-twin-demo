export type MachineStatus = "healthy" | "watch" | "risk" | "offline";

export type Severity = "low" | "medium" | "high" | "critical";

export type UserRole = "admin" | "user";

export type EntityCapability = "simulate" | "predict";

export type InformationSource =
  | "live-machine-data"
  | "historical-machine-data"
  | "ml-prediction"
  | "simulated-data"
  | "knowledge-base"
  | "ai-interpretation";

export type ProvenanceEvidence = {
  source: InformationSource;
  label: string;
  reference?: string | null;
  timestamp?: string | null;
  detail?: string | null;
};

export type InformationProvenance = {
  outputSources: InformationSource[];
  basisSources: InformationSource[];
  evidence: ProvenanceEvidence[];
};

export type ProvenanceCarrier = {
  provenance?: InformationProvenance | null;
};

export type EntityFeatureDtype = "float" | "integer" | "boolean" | "string";

export type EntityFeatureInput = {
  name: string;
  unit?: string | null;
  dtype: EntityFeatureDtype;
  required: boolean;
};

export type EntityFeature = EntityFeatureInput & {
  id: string;
  schemaVersionAdded: number;
  deprecatedAtSchemaVersion?: number | null;
};

export type EntitySummary = {
  id: string;
  name: string;
  description: string;
  imageUrl?: string | null;
  capabilities: EntityCapability[];
  schemaVersion: number;
  createdAt: string;
};

export type EntityDetail = EntitySummary & {
  features: EntityFeature[];
};

export type EntityCreateInput = {
  name: string;
  description?: string;
  imageUrl?: string | null;
  capabilities?: EntityCapability[];
  features?: EntityFeatureInput[];
};

export type EntityTelemetryInput = {
  timestamp: string;
  sessionId: string;
  payload: Record<string, JsonValue>;
};

export type EntityIngestionError = {
  row: number;
  field?: string | null;
  code: string;
  message: string;
};

export type EntityIngestionSummary = {
  batchId: string;
  entityId: string;
  source: "live" | "csv" | "mqtt" | "migration";
  dataSourceId?: string | null;
  status: "completed" | "rejected";
  schemaVersion: number;
  submittedRows: number;
  insertedRows: number;
  duplicateRows: number;
  errors: EntityIngestionError[];
  createdAt: string;
  replayed: boolean;
} & ProvenanceCarrier;

export type CsvColumnInspection = {
  name: string;
  inferredType: "datetime" | "integer" | "float" | "boolean" | "string" | "empty";
  numeric: boolean;
  missingCount: number;
  nonMissingCount: number;
  distinctCount: number;
  uniquenessRatio: number;
  sampleValues: JsonValue[];
  distinctValues: JsonValue[];
  distinctValuesTruncated: boolean;
  suggestedRole: "timestamp" | "session" | "label" | "numeric_input" | "categorical_input" | "excluded";
  suggestedEncoding?: "one_hot" | "frequency" | "exclude_identifier" | null;
  suggestionReasonCode: string;
};

export type CsvInspectionResult = {
  fileName: string;
  rawFileDigest?: string | null;
  inspectionVersion: number;
  rowCount: number;
  columns: CsvColumnInspection[];
  suggestedTimestampColumn?: string | null;
  suggestedSessionColumn?: string | null;
  suggestedLabelColumn?: string | null;
  errors: EntityIngestionError[];
};

export type EntityDataSource = {
  id: string;
  entityId: string;
  name: string;
  type: "csv" | "mqtt";
  config: Record<string, JsonValue>;
  status: string;
  lastMessageAt?: string | null;
  lastError?: string | null;
  persistedRows: number;
  acceptedRows: number;
  rejectedRows: number;
  createdAt: string;
  updatedAt: string;
} & ProvenanceCarrier;

export type EntityRecordingStopReason = "user" | "time_limit" | "row_limit" | "source_deleted";

/** An operator Start/Stop capture over one MQTT source. Device session and label stay untouched. */
export type EntityRecording = {
  id: string;
  entityId: string;
  dataSourceId?: string | null;
  sourceName?: string | null;
  recordingName: string;
  /** Optional training label (normalized: trimmed, lower case). */
  recordingLabel?: string | null;
  status: "recording" | "stopped";
  stopReason?: EntityRecordingStopReason | null;
  startedAt: string;
  stopDeadlineAt: string;
  stoppedAt?: string | null;
  createdByUserId: string;
  stoppedByUserId?: string | null;
  rowCount: number;
  maxRows: number;
  firstTimestamp?: string | null;
  lastTimestamp?: string | null;
  /** Server receipt time of the last recorded row. */
  lastReceivedAt?: string | null;
  /** Server clock when the response was made; elapsed and idle times are measured from it. */
  serverTime: string;
};

export type EntityRecordingStartInput = {
  recordingName: string;
  recordingLabel?: string | null;
  maxMinutes?: number | null;
};

/** Filters for the streamed telemetry CSV download. A recording bounds its own range. */
export type TelemetryCsvFilter = {
  start?: string;
  end?: string;
  recordingId?: string;
  sessionId?: string;
  sourceId?: string;
};

export type EntityDataPreviewRow = {
  timestamp: string;
  sessionId: string;
  schemaVersion: number;
  values: Record<string, JsonValue>;
  dataSourceId?: string | null;
  sourceName?: string | null;
  sourceType?: string | null;
  ingestedAt: string;
} & ProvenanceCarrier;

export type EntityDataPreview = {
  entityId: string;
  totalRows: number;
  columns: string[];
  rows: EntityDataPreviewRow[];
  sources: EntityDataSource[];
};

export type MqttSourceInput = {
  name: string;
  brokerHost: string;
  brokerPort: number;
  topic: string;
  tls: boolean;
  username?: string;
  password?: string;
  timestampField: string;
  sessionField: string;
  featureMappings: Record<string, string>;
  /** Payload key carrying the machine's own low/medium/high status label; null when the payload has none. */
  labelField?: string | null;
};

export type MqttConnectionTestResult = {
  success: boolean;
  message: string;
  testedAt: string;
};

/**
 * Backend-owned live state for an entity's MQTT feed. `live` requires an accepted
 * message within `freshnessSeconds` and no known broker outage; `no-source` means
 * the entity has no MQTT source and live surfaces should render nothing.
 */
export type EntityLiveState =
  | "live"
  | "stale"
  | "reconnecting"
  | "disconnected"
  | "waiting"
  | "no-source";

export type EntityLiveSource = {
  id: string;
  name: string;
  status: string;
  lastMessageAt: string | null;
  lastError: string | null;
  acceptedRows: number;
  rejectedRows: number;
};

export type EntityLiveObservation = {
  timestamp: string;
  sessionId: string;
  values: Record<string, JsonValue>;
  receivedAt: string;
};

/** Ground-truth status reported by the machine itself (CMTK `mode`), never model output. */
export type EntityLiveLabel = {
  label: string;
  observedAt: string;
};

export type EntityLiveLabelSpan = {
  label: string;
  startedAt: string;
  endedAt: string;
};

export type LiveInferenceSummary = {
  id: string;
  generatedAt: string;
  sessionId: string | null;
  predictedLabel: string | null;
  probabilities: Record<string, number>;
  /** Timestamp of the live sample whose window this run scored. */
  basedOnTimestamp: string | null;
  modelName: string;
  modelVersion: string;
  inputRows: number;
};

export type LiveInferenceStatus =
  | "ok"
  | "waiting"
  | "unavailable"
  | "error"
  | "disabled";

export type EntityLiveInference = {
  enabled: boolean;
  status: LiveInferenceStatus;
  message: string | null;
  lastAttemptAt: string | null;
  latest: LiveInferenceSummary | null;
  /** Newest first, at most 10. */
  recent: LiveInferenceSummary[];
};

/** Next-step value per feature from the promoted simulate model, continuing from `basedOnTimestamp`. */
export type LiveForecastSummary = {
  id: string;
  generatedAt: string;
  sessionId: string | null;
  forecast: Record<string, number>;
  basedOnTimestamp: string | null;
  modelName: string;
  modelVersion: string;
  inputRows: number;
};

export type EntityLiveForecast = {
  enabled: boolean;
  status: LiveInferenceStatus;
  message: string | null;
  lastAttemptAt: string | null;
  latest: LiveForecastSummary | null;
  /** Newest first, at most 10. */
  recent: LiveForecastSummary[];
};

/** One-hour outlook continuing from the last measured reading; refreshed server-side about every 30 s. */
export type EntityLiveHorizon = {
  status: "ok" | "waiting" | "unavailable" | "error";
  message: string | null;
  attemptedAt: string | null;
  /** Last measured reading the outlook continues from. */
  basedOnTimestamp: string | null;
  horizonMinutes: number | null;
  cadenceSeconds: number | null;
  /** Chronological future points (≈121 at most over the next hour). */
  points: { timestamp: string; values: Record<string, number> }[];
  modelName: string | null;
  modelVersion: string | null;
};

export type EntityLiveStatus = {
  entityId: string;
  entityName: string;
  /** Server clock at response time; freshness maths must use this, not the browser clock. */
  serverTime: string;
  freshnessSeconds: number;
  subscriberEnabled: boolean;
  state: EntityLiveState;
  source: EntityLiveSource | null;
  features: string[];
  /** Declared unit per feature (e.g. "mm/s", "°C"); null when the machine declares none. */
  featureUnits?: Record<string, string | null>;
  /** Chronological (oldest first), MQTT-sourced rows only. */
  observations: EntityLiveObservation[];
  latestLabel: EntityLiveLabel | null;
  /** Newest first, at most 10. */
  labelHistory: EntityLiveLabelSpan[];
  inference: EntityLiveInference;
  forecast: EntityLiveForecast;
  /** Absent on older servers; null when no outlook has been attempted. */
  horizon?: EntityLiveHorizon | null;
} & ProvenanceCarrier;

/** One machine in the dashboard's fleet live summary. `inference.recent` is always empty. */
export type EntityLiveHealth = {
  entityId: string;
  entityName: string;
  state: EntityLiveState;
  source: EntityLiveSource | null;
  features: string[];
  inference: EntityLiveInference;
};

/** Feed health for every machine the user can see, judged with one server clock. */
export type FleetLiveHealth = {
  serverTime: string;
  freshnessSeconds: number;
  subscriberEnabled: boolean;
  machines: EntityLiveHealth[];
};

export type VibrationBaselineReliability = "ok" | "limited" | "insufficient";

/** Learned upper-normal boundary for one vibration level × feature. Not an ISO limit. */
export type VibrationBaselineValue = {
  level: string;
  feature: string;
  /** Null when the history is insufficient. */
  value: number | null;
  unit: string | null;
  reliability: VibrationBaselineReliability;
  sessions: number;
  windows: number;
  samples: number;
  median: number | null;
};

export type MachineVibrationBaselines = {
  method: "session-weighted-window-percentile";
  percentile: number;
  windowSeconds: number;
  windowAggregation: "rms";
  minSamplesPerWindow: number;
  minSessions: number;
  minWindows: number;
  reliableSessions: number;
  excludesLiveData: boolean;
  readings: number;
  sessions: number;
  computedAt: string;
  description: string;
  baselines: VibrationBaselineValue[];
};

export type EngineeringThresholdStatus =
  | "not-configured"
  | "provisional"
  | "confirmed"
  | "measurement-incompatible"
  | "unknown-profile";

/** A severity-zone reference; `zoneBC` is the engineering limit drawn on charts. */
export type EngineeringVibrationProfile = {
  id: string;
  standard: string;
  title: string;
  machineGroup: string;
  supportClass: string;
  measurement: string;
  frequencyBand: string;
  unit: string;
  zoneAB: number;
  zoneBC: number;
  zoneCD: number;
  scope: string;
  evaluation: string;
  references: string[];
};

export type EngineeringVibrationThreshold = {
  status: EngineeringThresholdStatus;
  message: string;
  profile: EngineeringVibrationProfile | null;
  /** Vibration features the profile may be compared with (empty unless usable). */
  applicableFeatures: string[];
  requiredMeasurement: string;
  note: string | null;
};

/** `GET /entities/{id}/vibration-thresholds`: the two independent vibration references. */
export type EntityVibrationThresholds = {
  entityId: string;
  features: string[];
  featureUnits: Record<string, string | null>;
  machineSpecific: MachineVibrationBaselines;
  engineering: EngineeringVibrationThreshold;
  availableProfiles: EngineeringVibrationProfile[];
};

/** A machine connected to the CMTK through the server-managed source. */
export type CmtkMachine = {
  entityId: string;
  name: string;
  description: string;
  sourceId: string;
  state: EntityLiveState;
  lastMessageAt: string | null;
  lastError: string | null;
};

export type CmtkCandidate = {
  entityId: string;
  name: string;
  compatible: boolean;
  missingFeatures: string[];
};

export type CmtkPreset = "compact" | "verbose" | "velocity" | "pd";

/** Prefill for the connection form. Passwords are never returned. */
export type CmtkConnection = {
  host: string | null;
  port: number;
  tls: boolean;
  username: string | null;
  hasPassword: boolean;
  topic: string | null;
  preset: CmtkPreset;
  /** "saved" = this machine's saved connection, "server" = from the server's env, "none" = nothing yet. */
  source: "server" | "saved" | "none";
};

/** Broker details typed in the app; omitted entirely to use the saved/server connection. */
export type CmtkBrokerInput = {
  host: string;
  port?: number;
  tls?: boolean;
  username?: string | null;
  /** null/omitted keeps the stored password; "" clears it. */
  password?: string | null;
  topic: string;
  preset?: CmtkPreset;
};

export type CmtkProbeInput = {
  broker?: CmtkBrokerInput;
  entityId?: string;
  /** 1–20, default 8. */
  seconds?: number;
};

export type CmtkProbeResult = {
  connected: boolean;
  /** Operator-friendly. */
  message: string;
  topics: { topic: string; messages: number }[];
  /** First message, parsed JSON or text. */
  sample: JsonValue;
  sampleTopic: string | null;
  detectedPreset: CmtkPreset | null;
  /** Missing paths per preset. */
  presetMatches: Record<string, string[]>;
};

export type CmtkSetup = {
  /** False when the server has no CMTK_MQTT_HOST. */
  configured: boolean;
  /** "host:port" */
  broker: string | null;
  topic: string | null;
  preset: CmtkPreset;
  presetDescription: string;
  /** True whenever a compatible machine exists; details can be typed in the app even when not configured. */
  canConnect: boolean;
  defaultEntityId: string | null;
  machines: CmtkMachine[];
  candidates: CmtkCandidate[];
  connection: CmtkConnection;
  presets: Record<CmtkPreset, string>;
};

export type CmtkConnectInput = {
  entityId: string;
  machineName?: string;
  description?: string;
  broker?: CmtkBrokerInput;
};

export type CmtkConnectResult = {
  machine: CmtkMachine;
  /** A failed connection is not fatal: the server keeps retrying. */
  connection: { success: boolean; message: string };
};

export type ResamplingAggregation =
  | "mean"
  | "median"
  | "last"
  | "first"
  | "min"
  | "max"
  | "sum";

/** A fixed time grid to collapse irregular readings onto, before anything is fitted. */
export type ResamplingRecipe = {
  intervalSeconds: number;
  defaultAggregation: ResamplingAggregation;
  columnAggregation: Record<string, ResamplingAggregation>;
  gapPolicy: "drop" | "forward_fill";
};

export type ResamplingSummary = {
  detectedCadenceSeconds: number | null;
  irregularFraction: number;
  sourceRowCount: number;
  resampledRowCount: number;
  emptyBins: number;
  forwardFilledRows: number;
};

/** A column the machine does not send, computed row-wise from ones it does. */
export type DerivedFeatureRecipe = {
  name: string;
  expression: string;
  dtype: "float" | "integer";
};

/** How one column's readings are read, independently of how the machine declared them. */
export type ColumnType = "number" | "integer" | "text" | "boolean";

export type PreprocessingRecipe = {
  objective: "forecast" | "failure_detection";
  featureNames: string[];
  splitStrategy: "none" | "chronological" | "random" | "stratified" | "session-chronological";
  testFraction: number;
  seed: number;
  missingStrategy: "none" | "drop" | "mean" | "median";
  outlierClipping: boolean;
  iqrMultiplier: number;
  scaler: "none" | "standard" | "robust" | "minmax";
  resampling?: ResamplingRecipe | null;
  derivedFeatures: DerivedFeatureRecipe[];
  categoricalFeatures: Array<{
    name: string;
    encoding: "one_hot" | "frequency" | "ordinal";
    ordinalOrder: string[];
  }>;
  categoricalMissingStrategy: "none" | "mode" | "missing_category";
  unknownCategoryPolicy: "error" | "unknown_bucket";
  /** How to read a column whose registered type is wrong for this recipe. */
  columnTypes: Record<string, ColumnType>;
  target?: {
    column: string;
    taskType: "binary" | "multiclass";
    classes: string[];
    positiveClass?: string | null;
  } | null;
  /** Leave out telemetry streamed live over MQTT or the live API (e.g. demo data). */
  excludeLiveSources?: boolean;
  /** Train only from these recordings' rows (kept even when live data is excluded). */
  recordingIds?: string[];
  /** Failure-detection labels from the device (default) or from each recording's label. */
  labelSource?: "device" | "recording";
  /** What the session-based split holds out whole: device sessions (default) or recordings. */
  splitGroup?: "session" | "recording";
};

export type PreprocessingPreviewRow = {
  timestamp: string;
  sessionId: string;
  label?: string | null;
  rawValues: Record<string, JsonValue>;
  transformedValues: Record<string, JsonValue>;
  encodedTarget?: number | null;
};

export type PreprocessingPartitionSummary = {
  rowCount: number;
  timeStart?: string | null;
  timeEnd?: string | null;
  classCounts: Record<string, number>;
};

/** What one formula produced, measured before any transform covers the blanks up. */
export type DerivedColumnSummary = {
  rowCount: number;
  blankCount: number;
  sampleValues: Array<number | null>;
};

export type PreprocessingPreviewResult = {
  recipe: PreprocessingRecipe;
  recipeDigest: string;
  raw: PreprocessingPartitionSummary;
  train: PreprocessingPartitionSummary;
  test: PreprocessingPartitionSummary;
  rawRows: PreprocessingPreviewRow[];
  trainRows: PreprocessingPreviewRow[];
  testRows: PreprocessingPreviewRow[];
  fittedStatistics: Record<string, JsonValue>;
  affectedRows: Record<string, number>;
  warnings: string[];
  sourceBoundaryDigest: string;
  fullSummary: Record<"raw" | "train" | "test", PreprocessingPartitionSummary>;
  resamplingSummary?: ResamplingSummary | null;
  preview: { rowLimit: number; rowsReturned: number };
  transformedFeatureNames: string[];
  derivedColumns?: Record<string, DerivedColumnSummary>;
};

export type PreprocessingAnalysis = {
  id: string;
  entityId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  sourceRowCount: number;
  backendJobId?: string | null;
  result?: PreprocessingPreviewResult | null;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type EntityTelemetryRecord = {
  id: string;
  timestamp: string;
  sessionId: string;
  schemaVersion: number;
  payload: Record<string, JsonValue>;
} & ProvenanceCarrier;

export type EntityCollectionSummary = {
  entityId: string;
  totalRows: number;
  totalSessions: number;
  earliestTimestamp?: string | null;
  latestTimestamp?: string | null;
  capabilityProgress: EntityCapabilityProgress[];
  latestBatch?: EntityIngestionSummary | null;
} & ProvenanceCarrier;

export type EntityCapabilityProgress = {
  capability: EntityCapability;
  readyToTrain: boolean;
  progressPercent: number;
  observedRows: number;
  requiredRows: number;
  observedSessions: number;
  requiredSessions: number;
  observedLabelCounts: Record<string, number>;
  requiredClasses: number;
  requiredExamplesPerClass: number;
  nextAction: string;
};

export type FailureLabelInput = {
  occurredAt: string;
  label: string;
  severity: Severity;
  description?: string;
  windowStart?: string;
  windowEnd?: string;
};

export type FailureLabel = {
  id: string;
  entityId: string;
  occurredAt: string;
  label: string;
  severity: Severity;
  description: string;
  windowStart?: string | null;
  windowEnd?: string | null;
  createdByUserId: string;
  createdAt: string;
};

export type DatasetWindowConfig = {
  samplingIntervalSeconds: number;
  contextWindowSeconds: number;
};

export type DatasetVersionCreateInput = {
  capability: EntityCapability;
  selectedSessions?: string[];
  timeRange?: { start: string; end: string };
  labelIds?: string[];
  windowConfig: DatasetWindowConfig;
};

export type DatasetVersion = {
  id: string;
  entityId: string;
  datasetVersion: number;
  capability: EntityCapability;
  schemaVersion: number;
  selectedSessions: string[];
  timeRange?: { start: string; end: string } | null;
  labelSelection: string[];
  windowConfig: DatasetWindowConfig;
  status: "building" | "ready" | "failed";
  rowCount: number;
  labelClassCounts: Record<string, number>;
  preprocessingRecipe?: PreprocessingRecipe | null;
  recipeDigest?: string | null;
  sourceBoundaryDigest?: string | null;
  splitSummary?: Record<string, JsonValue> | null;
  fittedStatistics?: Record<string, JsonValue> | null;
  featureSignature?: string[];
  sourceLineage?: Array<Record<string, JsonValue>>;
  contentDigest?: string | null;
  artifactUri?: string | null;
  artifactFormat?: string | null;
  artifactDigest?: string | null;
  artifactSizeBytes?: number | null;
  materializationStatus?: "pending" | "queued" | "running" | "ready" | "failed";
  buildJobId?: string | null;
  buildAttempts?: number;
  buildStartedAt?: string | null;
  buildCompletedAt?: string | null;
  errorMessage?: string | null;
  createdByUserId: string;
  createdAt: string;
  lockedAt?: string | null;
} & ProvenanceCarrier;

export type TrainingArchitecture =
  | "logistic-regression"
  | "random-forest"
  | "xgboost"
  | "lightgbm"
  | "mlp"
  | "lstm"
  | "gru"
  | "tcn"
  | "onnx-import";

export type TrainingArchitectureOption = {
  id: Exclude<TrainingArchitecture, "onnx-import">;
  label: string;
  capability: EntityCapability;
  description: string;
  parameters: TrainingParameterOption[];
};

export type TrainingParameterOption = {
  key: string;
  label: string;
  description: string;
  type: "integer" | "number" | "boolean" | "select";
  default: JsonValue;
  minimum?: number | null;
  maximum?: number | null;
  step?: number | null;
  unit?: string | null;
  choices: string[];
};

export type TrainingConfiguration = {
  schemaVersion: 1;
  architecture: TrainingArchitectureOption["id"];
  hyperparameters: Record<string, JsonValue>;
};

export type TrainingConfigurationValidation = {
  valid: boolean;
  configuration?: TrainingConfiguration | null;
  errors: Record<string, string>;
};

export type TrainingRun = {
  id: string;
  entityId: string;
  trainingGroupId?: string | null;
  datasetVersionId?: string | null;
  datasetVersion?: number | null;
  datasetContentDigest?: string | null;
  capability: EntityCapability;
  architecture: TrainingArchitecture;
  hyperparameters: Record<string, unknown>;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  backendJobId?: string | null;
  backendName?: string;
  attemptCount?: number;
  heartbeatAt?: string | null;
  workerId?: string | null;
  cancelRequestedAt?: string | null;
  cancellationStatus?: string | null;
  trainingSpecUri?: string | null;
  resultManifestUri?: string | null;
  inputContract?: Record<string, JsonValue> | null;
  outputContract?: Record<string, JsonValue> | null;
  metrics: Record<string, number>;
  artifacts: Array<{ name: string; kind: string }>;
  errorMessage?: string | null;
  mlflowRunId?: string | null;
  modelName?: string | null;
  modelVersion?: string | null;
  createdByUserId: string;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  promotedAt?: string | null;
  promotedByUserId?: string | null;
};

export type ModelPromotion = {
  entityId: string;
  capability: EntityCapability;
  modelName: string;
  modelVersion: string;
  alias: "production";
  promotedAt: string;
  promotedByUserId: string;
};

export type EntityInferenceResult = {
  id?: string | null;
  entityId: string;
  capability: EntityCapability;
  sessionId: string;
  modelName: string;
  modelVersion: string;
  mlflowRunId?: string | null;
  schemaVersion?: number | null;
  inputRows: number;
  inputFeatures: string[];
  inputValues: Record<string, JsonValue>;
  overriddenFeatures: string[];
  generatedAt: string;
  predictedLabel?: string | null;
  probabilities: Record<string, number>;
  forecast: Record<string, number>;
  estimatedDowntimeHours?: number | null;
  uncertainty: Record<string, JsonValue>;
  rawOutputs: Record<string, JsonValue>;
} & ProvenanceCarrier;

export type SimulatorEntityModel = {
  entityId: string;
  machineName: string;
  imageUrl?: string | null;
  objectives: EntityCapability[];
  currentVersions: Partial<Record<EntityCapability, string>>;
  inputFeatures: Partial<Record<EntityCapability, string[]>>;
};

export type TrainingGroup = {
  id: string;
  entityId: string;
  status: "queued" | "running" | "partial" | "succeeded" | "failed" | "cancelled";
  runs: TrainingRun[];
  createdByUserId: string;
  createdAt: string;
};

export type ModelDeployment = {
  id: string;
  entityId: string;
  capability: EntityCapability;
  trainingRunId: string;
  modelName: string;
  modelVersion: string;
  alias: string;
  status: string;
  active: boolean;
  requestedByUserId: string;
  requestedAt: string;
  confirmedAt?: string | null;
  lastCheckedAt?: string | null;
  errorMessage?: string | null;
  overrideReason?: string | null;
};

export type SimulatorEntityOption = {
  entityId: string;
  machineName: string;
  imageUrl?: string | null;
  schemaVersion: number;
  eligible: boolean;
  reasonCodes: string[];
  readiness: Record<string, JsonValue>;
  inputFeatures: Array<{
    name: string;
    unit?: string | null;
    dtype: EntityFeatureDtype;
    required: boolean;
  }>;
  outputFeatures: string[];
  sessionIds: string[];
  productionModel?: {
    modelName: string;
    modelVersion: string;
    runId: string;
    promotedAt?: string | null;
    inputContract: Record<string, JsonValue>;
    outputContract: Record<string, JsonValue>;
  } | null;
  horizonMin: number;
  horizonMax: number;
  uncertaintySupported: boolean;
};

export type GenericSimulationResult = ProvenanceCarrier & {
  id: string;
  entityId: string;
  sessionId?: string | null;
  sourceTimeRange?: { start: string; end: string } | null;
  schemaVersion: number;
  createdAt: string;
  modelName: string;
  modelVersion: string;
  mlflowRunId: string;
  durationMinutes: 30 | 60 | 240;
  horizonSteps: number;
  forecastCadenceSeconds?: number | null;
  forecastTimestamps: string[];
  inputFeatures: string[];
  forecasts: Array<Record<string, number>>;
  uncertainty: Record<string, JsonValue>;
  warnings: string[];
};

export type EntityModelAlert = {
  id: string;
  entityId: string;
  capability: EntityCapability;
  code: string;
  severity: Severity;
  status: "open" | "resolved";
  detail: string;
  requiredFeatures: string[];
  missingFeatures: string[];
  modelName: string;
  modelVersion: string;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedByUserId?: string | null;
};

export type EntityDowntimeConfig = {
  id: string;
  entityId: string;
  label: string;
  baseHours: number;
  updatedAt: string;
  updatedByUserId: string;
};

export type MachineTypeId =
  | "ai4i"
  | "sensor"
  | "real-sensor"
  | "kaggle"
  | "vibration-motor"
  | "electric-motor"
  | "packaging-drive"
  | (string & {});

export type SimulationParameterType = "number" | "text" | "select" | "boolean";

export type SimulationParameterValue = string | number | boolean;

export type SimulationParameterOption = {
  label: string;
  value: string;
  description?: string;
};

export type SimulationParameterDefinition = {
  key: string;
  label?: string;
  type: SimulationParameterType;
  unit?: string;
  defaultValue?: SimulationParameterValue;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  description?: string;
  category?: string;
  options?: SimulationParameterOption[];
  placeholder?: string;
  displayOrder?: number;
  advanced?: boolean;
};

export type MachineSimulationSchema = {
  machineType: MachineTypeId;
  title?: string;
  description?: string;
  parameters: SimulationParameterDefinition[];
};

export type TelemetryMetric =
  | "temperature"
  | "vibration"
  | "pressure"
  | "power";

export type TelemetryPoint = {
  timestamp: string;
  temperature: number;
  vibration: number;
  pressure: number;
  power: number;
};

export type TelemetrySeries = ProvenanceCarrier & {
  points: TelemetryPoint[];
};

export type MqttPipelineStatus =
  | "not-configured"
  | "starting"
  | "healthy"
  | "degraded"
  | "unhealthy";

export type MqttHealth = {
  pipelineId: string;
  targetMachineId: string;
  observedAt: string;
  processStartedAt: string;
  lastEventAt?: string | null;
  status: MqttPipelineStatus;
  summary: string;
  broker: {
    state: "not-configured" | "connecting" | "connected" | "disconnected";
    connectedAt?: string | null;
    disconnectedAt?: string | null;
    lastError?: string | null;
  };
  subscription: {
    state: "not-configured" | "subscribing" | "subscribed" | "failed";
    topic?: string | null;
    qos?: number | null;
    subscribedAt?: string | null;
    lastError?: string | null;
  };
  messages: {
    flowState:
      | "not-configured"
      | "waiting"
      | "healthy"
      | "stale"
      | "below-expected"
      | "problematic";
    receivedTotal: number;
    acceptedTotal: number;
    invalidTotal: number;
    rejectedTotal: number;
    receivedPerMinute: number;
    acceptedPerMinute: number;
    expectedPerMinute?: number | null;
    problemRatio: number;
    lastReceivedAt?: string | null;
    lastAcceptedAt?: string | null;
    lastProblemAt?: string | null;
    lastProblemReason?: string | null;
  };
  reconnect: {
    attemptsTotal: number;
    attemptsInWindow: number;
    consecutiveFailures: number;
    abnormal: boolean;
    lastAttemptAt?: string | null;
    lastError?: string | null;
  };
};

export type MqttSubscriptionInput = {
  name: string;
  brokerHost: string;
  port: number;
  topic: string;
  qos: 0 | 1 | 2;
  enabled: boolean;
};

export type MqttSubscription = MqttSubscriptionInput & {
  id: string;
  targetMachineId: "machine-c";
  createdAt: string;
  updatedAt: string;
};

export type UserPersona = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  shift: string;
  plant: string;
  status?: "active" | "suspended" | "deactivated";
};

export type MachineSummary = {
  id: string;
  name: string;
  line: string;
  model: string;
  machineType?: MachineTypeId;
  simulationSchema?: MachineSimulationSchema | null;
  status: MachineStatus;
  healthScore: number;
  riskScore: number;
  lastServiceDate: string;
  nextServiceDate: string;
  uptimePercent: number;
};

export type MachineDetail = MachineSummary & {
  location: string;
  operatingHours: number;
  primaryFailureModes: string[];
  notes: string;
};

export type CanonicalMachine = MachineDetail & {
  legacyMachineId?: string | null;
  description: string;
  imageUrl?: string | null;
  location: string;
  capabilities: EntityCapability[];
  schemaVersion: number;
  accessRole: string;
  telemetry: {
    rows: number;
    sessions: number;
    latestTimestamp?: string | null;
  };
  readiness: Partial<Record<EntityCapability, Record<string, JsonValue>>>;
  productionModels: Partial<
    Record<EntityCapability, { modelName: string; modelVersion: string }>
  >;
  legacyCompatible: boolean;
};

export type Prediction = {
  id: string;
  machineId: string;
  generatedAt: string;
  horizonHours: number;
  failureMode: string;
  probability: number;
  confidence: number;
  severity: Severity;
} & ProvenanceCarrier;

export type ModelReadinessState =
  | "collecting-data"
  | "ready"
  | "stale"
  | "missing-sensor"
  | "invalid-window"
  | "prediction-unavailable";

export type ModelReadinessProgress = {
  observedRows: number;
  requiredRows: number;
  percent: number;
  observedDurationSeconds: number;
  requiredDurationSeconds: number;
  estimatedRemainingSeconds?: number | null;
};

export type ModelReadinessSensor = {
  name: string;
  label: string;
  unit?: string | null;
  status: "receiving" | "missing" | "invalid";
  validRows: number;
  requiredRows: number;
  detail: string;
};

export type ModelReadinessCheck = {
  status: "pass" | "in-progress" | "fail" | "not-applicable";
  label: string;
  detail: string;
};

export type ModelReadiness = {
  machineId: string;
  profileId?: string | null;
  state: ModelReadinessState;
  canInfer: boolean;
  summary: string;
  reason: string;
  nextAction: string;
  evaluatedAt: string;
  latestSampleAt?: string | null;
  progress?: ModelReadinessProgress | null;
  sensors: ModelReadinessSensor[];
  checks?: {
    windowLength: ModelReadinessCheck;
    cadence: ModelReadinessCheck;
    freshness: ModelReadinessCheck;
  } | null;
};

export type PredictionRange = {
  observedMin: number;
  observedMax: number;
  recommendedMin: number;
  recommendedMax: number;
  typicalValue: number;
};

export type PredictionInputField = {
  key: string;
  label: string;
  type: "number" | "select";
  unit?: string;
  description?: string;
  required: boolean;
  step?: number;
  range?: PredictionRange | null;
  options?: Array<{
    label: string;
    value: string;
  }> | null;
};

export type PredictionConfig = {
  machineId: string;
  machineType: MachineTypeId;
  title: string;
  description: string;
  fields: PredictionInputField[];
  failureThreshold?: number | null;
  warnings: string[];
};

export type ManualPredictionInput = {
  values: Record<string, number | string>;
};

export type ManualPredictionResult = {
  machineId: string;
  machineType: MachineTypeId;
  predictedLabel: string;
  failureProbability: number;
  /** AI4I: failure-type classifier score; real-sensor: returned-label probability. */
  confidence: number;
  severity: Severity;
  failureType?: string | null;
  thresholdTriggered?: boolean | null;
  warnings: string[];
  breachedFields: string[];
  generatedAt: string;
} & ProvenanceCarrier;

export type MaintenanceRecommendation = {
  id: string;
  machineId: string;
  title: string;
  detail: string;
  actionType: "parameter" | "replace-part" | "inspect" | "dispatch-tech";
  priority: Severity;
  etaMinutes: number;
  estimatedDowntimeHours: number;
} & ProvenanceCarrier;

export type HistoryEventType =
  | "telemetry-anomaly"
  | "fault-prediction"
  | "maintenance-action"
  | "simulation-run"
  | "chat-insight"
  | "failure-label"
  | "training-run"
  | "model-import"
  | "model-promotion";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type HistoryEvent = {
  id: string;
  timestamp: string;
  type: HistoryEventType;
  machineId?: string;
  entityId?: string;
  userId?: string;
  title: string;
  description: string;
  severity: Severity;
  metadata?: Record<string, JsonValue>;
} & ProvenanceCarrier;

export type ChatMessageRole = "user" | "assistant";

export type ChatChartSeriesPoint = {
  label: string;
  value: number;
};

export type ChatContentBlock = ProvenanceCarrier & (
  | {
      type: "text";
      content: string;
    }
  | {
      type: "status-card";
      title: string;
      machineName: string;
      machineId: string;
      intent: "diagnosis" | "prediction" | "simulation";
      status: string;
      severity: Severity;
      summary: string;
      metrics: Array<{
        label: string;
        value: string;
        detail?: string;
      }>;
    }
  | {
      type: "comparison";
      title: string;
      baselineLabel: string;
      scenarioLabel: string;
      rows: Array<{
        label: string;
        baseline: string;
        scenario: string;
        delta?: string;
      }>;
    }
  | {
      type: "chart";
      title: string;
      unit: string;
      data: ChatChartSeriesPoint[];
    }
  | {
      type: "links";
      links: Array<{
        label: string;
        href: string;
        description: string;
      }>;
    }
  | {
      type: "table";
      columns: string[];
      rows: string[][];
    }
);

export type AgentTraceStep = {
  step: number;
  tool: string;
  label: string;
  summary: string;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  role: ChatMessageRole;
  createdAt: string;
  contentBlocks: ChatContentBlock[];
  agentTrace?: AgentTraceStep[];
};

export type ChatThread = {
  id: string;
  title: string;
  machineId?: string;
  entityId?: string;
  updatedAt: string;
  userId: string;
  promptSuggestions: string[];
  followUpSuggestions: string[];
};

export type SimulationScenarioInput = {
  machineId: string;
  scenarioName: string;
  sessionId: number;
  machineType?: MachineTypeId;
  simulationHorizonMinutes?: number;
  parameters?: Record<string, SimulationParameterValue>;
};

export type SimulationGeneratedReading = {
  timestamp: string;
  values: Record<string, number>;
  synthetic?: boolean | null;
} & ProvenanceCarrier;

export type SimulationSourceWindow = {
  start: string;
  end: string;
  points: number;
  sessionId?: number | null;
  realPoints?: number | null;
  syntheticPoints?: number | null;
};

export type SimulationSessionOption = {
  sessionId: number;
  start: string;
  end: string;
  totalRows: number;
  realRows: number;
  syntheticRows: number;
  durationMinutes: number;
  usesSyntheticContinuation: boolean;
  label?: string | null;
  /** Demo-only session metadata, shown by `SimulationSessionMetadata`. */
  sampleIntervalMs?: number | null;
  gapFromPreviousMinutes?: number | null;
  provenance?: "observed" | "curated-observed-fixture" | "synthetic" | null;
};

export type SimulationSensorChartGroup = {
  id: string;
  label: string;
  unit?: string | null;
  fields: string[];
};

export type SimulationConfig = {
  machineId: string;
  machineType: MachineTypeId;
  title: string;
  description: string;
  contextWindowMinutes: number;
  contextWindowRows: number;
  forecastChunkMinutes: number;
  sampleIntervalMs: number;
  warnings: string[];
  sessions: SimulationSessionOption[];
  sensorChartGroups: SimulationSensorChartGroup[];
};

export type SimulationSessionPreview = {
  machineId: string;
  machineType: MachineTypeId;
  sessionId: number;
  sensorFields: string[];
  sensorChartGroups: SimulationSensorChartGroup[];
  sourceWindow: SimulationSourceWindow;
  readings: SimulationGeneratedReading[];
} & ProvenanceCarrier;

export type SimulationClassificationWindow = {
  windowStart: string;
  windowEnd: string;
  predictedLabel: string;
  failureProbability: number;
  confidence: number;
  probabilities: Record<string, number>;
} & ProvenanceCarrier;

export type SimulationRun = {
  id: string;
  machineId: string;
  userId: string;
  createdAt: string;
  scenarioName: string;
  projectedRisk: number;
  projectedDowntimeHours: number;
  summary: string;
  recommendations: string[];
  projectedLabel?: string | null;
  failureProbability?: number | null;
  selectedSessionId?: number | null;
  syntheticContinuationUsed?: boolean | null;
  generatedReadings?: SimulationGeneratedReading[] | null;
  sourceReadings?: SimulationGeneratedReading[] | null;
  sourceWindow?: SimulationSourceWindow | null;
  sensorFields?: string[] | null;
  sensorChartGroups?: SimulationSensorChartGroup[] | null;
  simulationHorizonMinutes?: number | null;
  simulationStatus?: "completed" | "insufficient-data" | null;
  simulationMessage?: string | null;
  classificationWindows?: SimulationClassificationWindow[] | null;
} & ProvenanceCarrier;

export type Session = {
  token: string;
  userId: string;
  activePersonaId: string;
  authenticatedAt: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type MfaMethod = "totp" | "backup-code";

export type LoginResult =
  | {
      requiresMfa: false;
      session: Session;
      mfaToken: null;
      availableMethods: [];
    }
  | {
      requiresMfa: true;
      session: null;
      mfaToken: string;
      availableMethods: MfaMethod[];
    };

export type VerifyMfaInput = {
  mfaToken?: string;
  method: MfaMethod;
  code: string;
};

export type SetupStatus = { setupRequired: boolean };

export type ActivationDetails = {
  email: string;
  name: string;
  role: UserRole;
  operationalRole: string;
  shift: string;
  plant: string;
  requiresMfa: boolean;
  totpSecret?: string | null;
  otpauthUri?: string | null;
  expiresAt: string;
};

export type ActivationResult = {
  session: Session;
  backupCodes: string[];
};

export type UserAccessResult = {
  user: UserPersona;
  entityIds: string[];
  sessionRevoked: boolean;
};

export type UserInvitationInput = {
  email: string;
  name: string;
  role: UserRole;
  operationalRole: string;
  shift: string;
  plant: string;
  machineIds: string[];
  stepUpCode?: string;
};

export type UserInvitationResult = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  activationUrl: string;
  expiresAt: string;
};

export type UserInvitationSummary = Omit<UserInvitationResult, "activationUrl"> & {
  createdAt: string;
  status: "pending" | "expired" | "accepted" | "revoked";
};

export type TotpStatus = {
  enabled: boolean;
  backupCodeCount: number;
  unusedBackupCodeCount: number;
};

export type TotpSetupResult = {
  setupToken: string;
  secret: string;
  otpauthUri: string;
};

export type TotpBackupCodesResult = {
  backupCodes: string[];
  backupCodeCount: number;
  unusedBackupCodeCount: number;
};

export type MachinesQuery = {
  search?: string;
  line?: string;
  status?: MachineStatus | "all";
  sortBy?: "risk" | "health" | "name" | "uptime";
  sortDirection?: "asc" | "desc";
  authorizedForUserId?: string;
};

export type HistoryQuery = {
  userId?: string;
  machineId?: string;
  machineIds?: string[];
  type?: HistoryEventType | "all";
  dateFrom?: string;
  dateTo?: string;
};

export type UserMachineAccess = {
  userId: string;
  machineIds: string[];
};

export type LlmProvider = "openai" | "gemini" | "ollama" | "deepseek";

export type LlmConfiguration = {
  provider: LlmProvider;
  hasApiKey: boolean;
  updatedAt?: string | null;
};

export type UpdateLlmConfigurationInput = {
  provider: LlmProvider;
  apiKey?: string;
  clearApiKey?: boolean;
};

/**
 * What the client is told while a turn is running.
 *
 * `status` is one tool starting or finishing, carrying the same label the
 * finished trace panel uses for that call. `delta` is the next piece of the
 * answer text. `done` is the persisted conversation.
 *
 * There is deliberately no event for the model's reasoning. The server
 * forwards an allowlist of two SDK event kinds, so hidden chain-of-thought
 * never reaches this type in the first place — it is not filtered here.
 */
export type ChatStreamEvent =
  | { type: "status"; phase: "running" | "finished"; tool: string; label: string }
  | { type: "delta"; text: string }
  | { type: "done"; thread: ChatThread; messages: ChatMessage[] }
  | { type: "error"; detail: string };

export type SendMessageInput = {
  threadId: string;
  userId: string;
  text: string;
  machineId?: string;
};

// ---------------------------------------------------------------------------
// Knowledge vault
// ---------------------------------------------------------------------------

export type KnowledgeNoteSummary = {
  id: string;
  path: string;
  title: string;
  namespace: string;
  type: string | null;
  tags: string[];
  updated: string | null;
  updatedBy: string | null;
  confidence: string | null;
  excerpt: string;
  mtime: number;
  size: number;
  inDegree: number;
  outDegree: number;
};

export type KnowledgeLink = {
  id: string;
  title: string;
  relation: string;
  namespace?: string | null;
  exists: boolean;
};

export type KnowledgeNoteDetail = KnowledgeNoteSummary & {
  content: string;
  body: string;
  frontmatter: Record<string, unknown>;
  backlinks: KnowledgeLink[];
  outbound: KnowledgeLink[];
};

export type KnowledgeGraphNode = {
  id: string;
  path: string | null;
  title: string;
  namespace: string | null;
  type: string | null;
  tags: string[];
  updated: string | null;
  updatedBy: string | null;
  confidence: string | null;
  size: number;
  exists: boolean;
  inDegree: number;
  outDegree: number;
};

export type KnowledgeGraphEdge = {
  source: string;
  target: string;
  type: string;
};

export type KnowledgeGraph = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  stats: {
    notes?: number;
    edges?: number;
    wanted?: number;
    tags?: number;
    namespaces?: Record<string, number>;
  };
  truncated: number;
};

export type KnowledgeSearchHit = {
  id: string;
  path: string | null;
  title: string;
  namespace: string;
  score: number;
  why: string;
  snippet: string;
  updated: string | null;
};

export type KnowledgeConfig = {
  enabled: boolean;
  agentReadNamespaces: string[];
  agentWriteNamespaces: string[];
  autoCapture: boolean;
  maxNoteBytesInjected: number;
};

export type KnowledgeHistoryEntry = {
  stamp: string;
  mtime: number;
  size: number;
};

export type KnowledgeRawSource = {
  path: string;
  name: string;
  size: number;
  mtime: number;
};

export type KnowledgeLintFinding = Record<string, unknown>;

export type KnowledgeLintReport = {
  stats: KnowledgeGraph["stats"];
  counts: Record<string, number>;
  healthy: boolean;
  findings: {
    duplicates: KnowledgeLintFinding[];
    orphans: KnowledgeLintFinding[];
    wanted: KnowledgeLintFinding[];
    broken_links: KnowledgeLintFinding[];
    unsourced_claims: KnowledgeLintFinding[];
    conflicts: KnowledgeLintFinding[];
    stale: KnowledgeLintFinding[];
    missing_frontmatter: KnowledgeLintFinding[];
  };
};

export type KnowledgeGraphQuery = {
  namespace?: string;
  around?: string;
  depth?: number;
  includeTags?: boolean;
  includeWanted?: boolean;
  limit?: number;
};

/** A save rejected because the note changed on disk since it was loaded. */
export type KnowledgeSaveConflict = {
  message: string;
  current: KnowledgeNoteDetail;
};

export type KnowledgeIngestJob = {
  id: string;
  source: string;
  status: "queued" | "running" | "succeeded" | "failed";
  message: string;
  changed: string[];
  error: string | null;
  startedAt: string;
  finishedAt: string;
};

export type KnowledgeCaptureInput = {
  title: string;
  content: string;
  namespace?: string;
  section?: string;
  reason?: string;
};
