import type {
  ChatMessage,
  ChatThread,
  HistoryEvent,
  MachineDetail,
  MachineSummary,
  MaintenanceRecommendation,
  ManualPredictionResult,
  Prediction,
  PredictionConfig,
  Session,
  SimulationConfig,
  SimulationRun,
  SimulationSessionPreview,
  TelemetryPoint,
  TotpBackupCodesResult,
  TotpSetupResult,
  TotpStatus,
  UserPersona,
} from "@/lib/domain/types";

const now = "2026-05-30T00:00:00.000Z";

export const testUsers = [
  {
    id: "user-001",
    name: "Admin Operator",
    email: "test1@test.com",
    role: "admin",
    shift: "Day",
    plant: "Plant 1",
  },
  {
    id: "user-002",
    name: "Line Supervisor",
    email: "test2@test.com",
    role: "user",
    shift: "Swing",
    plant: "Plant 1",
  },
  {
    id: "user-003",
    name: "Night Technician",
    email: "test3@test.com",
    role: "user",
    shift: "Night",
    plant: "Plant 1",
  },
] satisfies UserPersona[];

export const testSessions = {
  admin: {
    token: "token-admin",
    userId: "user-001",
    activePersonaId: "user-001",
    authenticatedAt: now,
  },
  user: {
    token: "token-user",
    userId: "user-002",
    activePersonaId: "user-002",
    authenticatedAt: now,
  },
  night: {
    token: "token-night",
    userId: "user-003",
    activePersonaId: "user-003",
    authenticatedAt: now,
  },
} satisfies Record<string, Session>;

export const testMachines = [
  {
    id: "machine-a",
    name: "Machine A",
    line: "Line 1",
    model: "AI4I-2020",
    machineType: "ai4i",
    status: "healthy",
    healthScore: 94,
    riskScore: 11,
    lastServiceDate: "2026-05-01T00:00:00.000Z",
    nextServiceDate: "2026-06-15T00:00:00.000Z",
    uptimePercent: 99,
    simulationSchema: null,
  },
  {
    id: "machine-b",
    name: "Machine B",
    line: "Line 2",
    model: "Client Sensor Dataset",
    machineType: "sensor",
    status: "watch",
    healthScore: 78,
    riskScore: 42,
    lastServiceDate: "2026-04-15T00:00:00.000Z",
    nextServiceDate: "2026-06-03T00:00:00.000Z",
    uptimePercent: 95,
    simulationSchema: null,
  },
  {
    id: "machine-c",
    name: "Machine C",
    line: "Line 3",
    model: "Kaggle 3-Axis Vibration",
    machineType: "real-sensor",
    status: "risk",
    healthScore: 61,
    riskScore: 82,
    lastServiceDate: "2026-03-20T00:00:00.000Z",
    nextServiceDate: "2026-05-31T00:00:00.000Z",
    uptimePercent: 89,
    simulationSchema: null,
  },
] satisfies MachineSummary[];

export const machineAccessByUserId: Record<string, string[]> = {
  "user-001": ["machine-a", "machine-b", "machine-c"],
  "user-002": ["machine-a", "machine-c"],
  "user-003": [],
};

export const testMachineDetails = Object.fromEntries(
  testMachines.map((machine) => [
    machine.id,
    {
      ...machine,
      location: `${machine.line} Bay`,
      operatingHours: 1240,
      primaryFailureModes: ["Bearing wear", "Thermal drift"],
      notes: `${machine.name} is seeded for frontend tests.`,
    },
  ]),
) as Record<string, MachineDetail>;

export const testTelemetry = Array.from({ length: 18 }, (_, index) => ({
  timestamp: new Date(Date.UTC(2026, 4, 30, 0, index * 5)).toISOString(),
  temperature: 68 + index,
  vibration: 0.4 + index / 100,
  pressure: 31 + index / 4,
  power: 12 + index / 3,
})) satisfies TelemetryPoint[];

export const testPredictions = [
  {
    id: "prediction-c-1",
    machineId: "machine-c",
    generatedAt: now,
    horizonHours: 4,
    failureMode: "Bearing imbalance",
    probability: 0.82,
    confidence: 0.88,
    severity: "high",
  },
] satisfies Prediction[];

export const testRecommendations = [
  {
    id: "recommendation-c-1",
    machineId: "machine-c",
    title: "Inspect vibration mounts",
    detail: "Check mounting bolts and bearing alignment before the next shift.",
    actionType: "inspect",
    priority: "high",
    etaMinutes: 45,
    estimatedDowntimeHours: 1.5,
  },
] satisfies MaintenanceRecommendation[];

export const testHistory = [
  {
    id: "event-1",
    timestamp: now,
    type: "fault-prediction",
    machineId: "machine-c",
    userId: "user-002",
    title: "High vibration risk detected",
    description: "Machine C exceeded the vibration risk threshold.",
    severity: "high",
  },
  {
    id: "event-2",
    timestamp: "2026-05-29T20:00:00.000Z",
    type: "maintenance-action",
    machineId: "machine-a",
    userId: "user-001",
    title: "Preventive service completed",
    description: "Machine A completed scheduled maintenance.",
    severity: "low",
  },
] satisfies HistoryEvent[];

export const testChatThread = {
  id: "thread-1",
  title: "Machine C vibration",
  machineId: "machine-c",
  updatedAt: now,
  userId: "user-002",
  promptSuggestions: ["Summarize Machine C risk"],
  followUpSuggestions: ["Open simulator"],
} satisfies ChatThread;

export const testChatMessages = [
  {
    id: "message-1",
    threadId: "thread-1",
    role: "assistant",
    createdAt: now,
    contentBlocks: [
      {
        type: "text",
        content: "Machine C is trending toward elevated vibration risk.",
      },
    ],
  },
] satisfies ChatMessage[];

export const testSimulationConfig = {
  machineId: "machine-c",
  machineType: "real-sensor",
  title: "Machine C session simulation",
  description: "Forecast vibration and temperature from a selected session.",
  contextWindowMinutes: 20,
  contextWindowRows: 40,
  forecastChunkMinutes: 15,
  sampleIntervalMs: 500,
  warnings: [],
  sessions: [
    {
      sessionId: 101,
      start: "2026-05-30T01:00:00.000Z",
      end: "2026-05-30T01:20:00.000Z",
      totalRows: 40,
      realRows: 40,
      syntheticRows: 0,
      durationMinutes: 20,
      usesSyntheticContinuation: false,
      label: "Session 101",
    },
  ],
  sensorChartGroups: [
    {
      id: "vibration",
      label: "Vibration Sensors (g)",
      unit: "g",
      fields: ["vibrationX", "vibrationY", "vibrationZ"],
    },
    {
      id: "temperature",
      label: "Temperature (C)",
      unit: "C",
      fields: ["temperature"],
    },
  ],
} satisfies SimulationConfig;

export const testSimulationPreview = {
  machineId: "machine-c",
  machineType: "real-sensor",
  sessionId: 101,
  sensorFields: ["vibrationX", "vibrationY", "vibrationZ", "temperature"],
  sensorChartGroups: testSimulationConfig.sensorChartGroups,
  sourceWindow: {
    start: "2026-05-30T01:00:00.000Z",
    end: "2026-05-30T01:20:00.000Z",
    points: 40,
    sessionId: 101,
    realPoints: 40,
    syntheticPoints: 0,
  },
  readings: [
    {
      timestamp: "2026-05-30T01:20:00.000Z",
      values: {
        vibrationX: 0.41,
        vibrationY: 0.38,
        vibrationZ: 0.44,
        temperature: 72,
      },
    },
  ],
} satisfies SimulationSessionPreview;

export const testSimulationRun = {
  id: "run-1",
  machineId: "machine-c",
  userId: "user-002",
  createdAt: now,
  scenarioName: "Bearing load test",
  projectedRisk: 72,
  projectedDowntimeHours: 2.4,
  summary: "Machine C remains elevated risk over the selected horizon.",
  recommendations: ["Inspect the bearing assembly."],
  projectedLabel: "high",
  failureProbability: 0.72,
  selectedSessionId: 101,
  syntheticContinuationUsed: false,
  generatedReadings: testSimulationPreview.readings,
  sourceReadings: testSimulationPreview.readings,
  sourceWindow: testSimulationPreview.sourceWindow,
  sensorFields: testSimulationPreview.sensorFields,
  sensorChartGroups: testSimulationPreview.sensorChartGroups,
  simulationHorizonMinutes: 30,
  simulationStatus: "completed",
  simulationMessage: null,
  classificationWindows: [],
} satisfies SimulationRun;

export const testPredictionConfig = {
  machineId: "machine-a",
  machineType: "ai4i",
  title: "Machine A prediction",
  description: "Manual AI4I prediction inputs.",
  failureThreshold: 0.5,
  warnings: [],
  fields: [
    {
      key: "air_temperature",
      label: "Air temperature",
      type: "number",
      unit: "K",
      required: true,
      step: 0.1,
      range: {
        observedMin: 295,
        observedMax: 305,
        recommendedMin: 297,
        recommendedMax: 302,
        typicalValue: 300,
      },
      options: null,
    },
    {
      key: "process_temperature",
      label: "Process temperature",
      type: "number",
      unit: "K",
      required: true,
      step: 0.1,
      range: {
        observedMin: 305,
        observedMax: 315,
        recommendedMin: 307,
        recommendedMax: 312,
        typicalValue: 310,
      },
      options: null,
    },
  ],
} satisfies PredictionConfig;

export const testManualPredictionResult = {
  machineId: "machine-a",
  machineType: "ai4i",
  predictedLabel: "No Failure",
  failureProbability: 0.12,
  confidence: 0.93,
  severity: "low",
  failureType: null,
  thresholdTriggered: false,
  warnings: [],
  breachedFields: [],
  generatedAt: now,
} satisfies ManualPredictionResult;

export const testTotpStatus = {
  enabled: false,
  backupCodeCount: 0,
  unusedBackupCodeCount: 0,
} satisfies TotpStatus;

export const testTotpSetup = {
  setupToken: "totp-setup-token",
  secret: "JBSWY3DPEHPK3PXP",
  otpauthUri:
    "otpauth://totp/Predictive%20Maintenance:test2@test.com?secret=JBSWY3DPEHPK3PXP&issuer=Predictive%20Maintenance",
} satisfies TotpSetupResult;

export const testTotpBackupCodes = {
  backupCodes: ["BACKUP-001", "BACKUP-002"],
  backupCodeCount: 2,
  unusedBackupCodeCount: 2,
} satisfies TotpBackupCodesResult;
