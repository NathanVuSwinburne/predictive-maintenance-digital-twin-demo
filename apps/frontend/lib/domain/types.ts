export type MachineStatus = "healthy" | "watch" | "risk" | "offline";

export type Severity = "low" | "medium" | "high" | "critical";

export type UserRole = "admin" | "user";

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

export type UserPersona = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  shift: "Day" | "Swing" | "Night";
  plant: string;
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

export type Prediction = {
  id: string;
  machineId: string;
  generatedAt: string;
  horizonHours: number;
  failureMode: string;
  probability: number;
  confidence: number;
  severity: Severity;
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
  confidence: number;
  severity: Severity;
  failureType?: string | null;
  thresholdTriggered?: boolean | null;
  warnings: string[];
  breachedFields: string[];
  generatedAt: string;
};

export type MaintenanceRecommendation = {
  id: string;
  machineId: string;
  title: string;
  detail: string;
  actionType: "parameter" | "replace-part" | "inspect" | "dispatch-tech";
  priority: Severity;
  etaMinutes: number;
  estimatedDowntimeHours: number;
};

export type HistoryEventType =
  | "telemetry-anomaly"
  | "fault-prediction"
  | "maintenance-action"
  | "simulation-run"
  | "chat-insight";

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
  userId?: string;
  title: string;
  description: string;
  severity: Severity;
  metadata?: Record<string, JsonValue>;
};

export type ChatMessageRole = "user" | "assistant";

export type ChatChartSeriesPoint = {
  label: string;
  value: number;
};

export type ChatContentBlock =
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
    };

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
};

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
};

export type SimulationClassificationWindow = {
  windowStart: string;
  windowEnd: string;
  predictedLabel: string;
  failureProbability: number;
  confidence: number;
  probabilities: Record<string, number>;
};

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
};

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
  mfaToken: string;
  method: MfaMethod;
  code: string;
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

export type QueryMode =
  | "auto"
  | "data_lookup"
  | "prediction"
  | "simulation"
  | "maintenance"
  | "telemetry"
  | "general"
  | "recommendation";

export type LlmProvider = "openai" | "gemini" | "ollama" | "deepseek";

export type SendMessageInput = {
  threadId: string;
  userId: string;
  text: string;
  queryMode?: QueryMode;
  machineId?: string;
  apiKey?: string;
  llmProvider?: LlmProvider;
};
