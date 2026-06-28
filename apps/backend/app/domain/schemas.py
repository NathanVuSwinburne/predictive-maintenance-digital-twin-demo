"""Pydantic schemas mirroring the TypeScript domain types in apps/frontend/lib/domain/types.ts."""

from __future__ import annotations

from typing import Annotated, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, JsonValue


# ---------------------------------------------------------------------------
# Enums / literals
# ---------------------------------------------------------------------------

MachineStatus = Literal["healthy", "watch", "risk", "offline"]
Severity = Literal["low", "medium", "high", "critical"]
UserRole = Literal["admin", "user"]
ActionType = Literal["parameter", "replace-part", "inspect", "dispatch-tech"]
ChatMessageRole = Literal["user", "assistant"]
HistoryEventType = Literal[
    "telemetry-anomaly",
    "fault-prediction",
    "maintenance-action",
    "simulation-run",
    "chat-insight",
]


# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------


class TelemetryPoint(BaseModel):
    timestamp: str
    temperature: float
    vibration: float
    pressure: float
    power: float


# ---------------------------------------------------------------------------
# Users / Personas
# ---------------------------------------------------------------------------


class UserPersona(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    shift: Literal["Day", "Swing", "Night"]
    plant: str


# ---------------------------------------------------------------------------
# Machines
# ---------------------------------------------------------------------------


class MachineSummary(BaseModel):
    id: str
    name: str
    line: str
    model: str
    machineType: Optional[str] = None
    status: MachineStatus
    healthScore: float
    riskScore: float
    lastServiceDate: str
    nextServiceDate: str
    uptimePercent: float


class MachineDetail(MachineSummary):
    location: str
    operatingHours: float
    primaryFailureModes: List[str]
    notes: str


# ---------------------------------------------------------------------------
# Predictions & Recommendations
# ---------------------------------------------------------------------------


class Prediction(BaseModel):
    id: str
    machineId: str
    generatedAt: str
    horizonHours: int
    failureMode: str
    probability: float
    confidence: float
    severity: Severity


class PredictionRange(BaseModel):
    observedMin: float
    observedMax: float
    recommendedMin: float
    recommendedMax: float
    typicalValue: float


class PredictionInputField(BaseModel):
    key: str
    label: str
    type: Literal["number", "select"]
    unit: Optional[str] = None
    description: Optional[str] = None
    required: bool = True
    step: Optional[float] = None
    range: Optional[PredictionRange] = None
    options: Optional[List[Dict[str, str]]] = None


class PredictionConfig(BaseModel):
    machineId: str
    machineType: str
    title: str
    description: str
    fields: List[PredictionInputField]
    failureThreshold: Optional[float] = None
    warnings: List[str] = Field(default_factory=list)


class ManualPredictionInput(BaseModel):
    values: Dict[str, Union[float, str]]


class ManualPredictionResult(BaseModel):
    machineId: str
    machineType: str
    predictedLabel: str
    failureProbability: float
    confidence: float
    severity: Severity
    failureType: Optional[str] = None
    thresholdTriggered: Optional[bool] = None
    warnings: List[str] = Field(default_factory=list)
    breachedFields: List[str] = Field(default_factory=list)
    generatedAt: str


class MaintenanceRecommendation(BaseModel):
    id: str
    machineId: str
    title: str
    detail: str
    actionType: ActionType
    priority: Severity
    etaMinutes: int
    estimatedDowntimeHours: float


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


class HistoryEvent(BaseModel):
    id: str
    timestamp: str
    type: HistoryEventType
    machineId: Optional[str] = None
    userId: Optional[str] = None
    title: str
    description: str
    severity: Severity
    metadata: Optional[Dict[str, JsonValue]] = None


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


class ChatChartSeriesPoint(BaseModel):
    label: str
    value: float


class TextBlock(BaseModel):
    type: Literal["text"]
    content: str


class ChartBlock(BaseModel):
    type: Literal["chart"]
    title: str
    unit: str
    data: List[ChatChartSeriesPoint]


class LinkItem(BaseModel):
    label: str
    href: str = "#"
    description: str = ""


class LinksBlock(BaseModel):
    type: Literal["links"]
    links: List[LinkItem]


class TableBlock(BaseModel):
    type: Literal["table"]
    columns: List[str]
    rows: List[List[str]]


class StatusMetric(BaseModel):
    label: str
    value: str
    detail: Optional[str] = None


class StatusCardBlock(BaseModel):
    type: Literal["status-card"]
    title: str
    machineName: str
    machineId: str
    intent: Literal["diagnosis", "prediction", "simulation"]
    status: str
    severity: Severity
    summary: str
    metrics: List[StatusMetric]


class ComparisonRow(BaseModel):
    label: str
    baseline: str
    scenario: str
    delta: Optional[str] = None


class ComparisonBlock(BaseModel):
    type: Literal["comparison"]
    title: str
    baselineLabel: str
    scenarioLabel: str
    rows: List[ComparisonRow]


ChatContentBlock = Annotated[
    Union[TextBlock, ChartBlock, LinksBlock, TableBlock, StatusCardBlock, ComparisonBlock],
    Field(discriminator="type"),
]


class ChatMessage(BaseModel):
    id: str
    threadId: str
    role: ChatMessageRole
    createdAt: str
    contentBlocks: List[ChatContentBlock]
    agentTrace: Optional[List[Dict]] = None


class ChatThread(BaseModel):
    id: str
    title: str
    machineId: Optional[str] = None
    updatedAt: str
    userId: str
    promptSuggestions: List[str]
    followUpSuggestions: List[str]


# ---------------------------------------------------------------------------
# Simulations
# ---------------------------------------------------------------------------


class SimulationScenarioInput(BaseModel):
    machineId: str
    scenarioName: str
    sessionId: int
    simulationHorizonMinutes: Optional[int] = None
    userId: Optional[str] = None


class SimulationGeneratedReading(BaseModel):
    timestamp: str
    values: Dict[str, float]
    synthetic: Optional[bool] = None


class SimulationSourceWindow(BaseModel):
    start: str
    end: str
    points: int
    sessionId: Optional[int] = None
    realPoints: Optional[int] = None
    syntheticPoints: Optional[int] = None


class SimulationSessionOption(BaseModel):
    sessionId: int
    start: str
    end: str
    totalRows: int
    realRows: int
    syntheticRows: int
    durationMinutes: float
    usesSyntheticContinuation: bool
    label: Optional[str] = None


class SimulationSensorChartGroup(BaseModel):
    id: str
    label: str
    unit: Optional[str] = None
    fields: List[str]


class SimulationConfig(BaseModel):
    machineId: str
    machineType: str
    title: str
    description: str
    contextWindowMinutes: int
    contextWindowRows: int
    forecastChunkMinutes: int
    sampleIntervalMs: int
    warnings: List[str] = Field(default_factory=list)
    sessions: List[SimulationSessionOption]
    sensorChartGroups: List[SimulationSensorChartGroup] = Field(default_factory=list)


class SimulationSessionPreview(BaseModel):
    machineId: str
    machineType: str
    sessionId: int
    sensorFields: List[str]
    sensorChartGroups: List[SimulationSensorChartGroup] = Field(default_factory=list)
    sourceWindow: SimulationSourceWindow
    readings: List[SimulationGeneratedReading]


class SimulationClassificationWindow(BaseModel):
    windowStart: str
    windowEnd: str
    predictedLabel: str
    failureProbability: float
    confidence: float
    probabilities: Dict[str, float]


class SimulationRun(BaseModel):
    id: str
    machineId: str
    userId: str
    createdAt: str
    scenarioName: str
    projectedRisk: float
    projectedDowntimeHours: float
    summary: str
    recommendations: List[str]
    projectedLabel: Optional[str] = None
    failureProbability: Optional[float] = None
    selectedSessionId: Optional[int] = None
    syntheticContinuationUsed: Optional[bool] = None
    generatedReadings: Optional[List[SimulationGeneratedReading]] = None
    sourceReadings: Optional[List[SimulationGeneratedReading]] = None
    sourceWindow: Optional[SimulationSourceWindow] = None
    sensorFields: Optional[List[str]] = None
    sensorChartGroups: Optional[List[SimulationSensorChartGroup]] = None
    simulationHorizonMinutes: Optional[int] = None
    simulationStatus: Optional[Literal["completed", "insufficient-data"]] = None
    simulationMessage: Optional[str] = None
    classificationWindows: Optional[List[SimulationClassificationWindow]] = None


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class LoginInput(BaseModel):
    email: str
    password: str


class Session(BaseModel):
    token: str
    userId: str
    activePersonaId: str
    authenticatedAt: str


class LoginResult(BaseModel):
    requiresMfa: bool
    session: Optional[Session] = None
    mfaToken: Optional[str] = None
    availableMethods: List[Literal["totp", "backup-code"]] = Field(default_factory=list)


class VerifyMfaInput(BaseModel):
    mfaToken: str
    method: Literal["totp", "backup-code"]
    code: str


class LogoutInput(BaseModel):
    token: str


class TotpStatus(BaseModel):
    enabled: bool
    backupCodeCount: int
    unusedBackupCodeCount: int


class TotpPasswordInput(BaseModel):
    password: str


class TotpSetupResult(BaseModel):
    setupToken: str
    secret: str
    otpauthUri: str


class TotpConfirmInput(BaseModel):
    setupToken: str
    code: str


class TotpBackupCodesResult(BaseModel):
    backupCodes: List[str]
    backupCodeCount: int
    unusedBackupCodeCount: int


class MachineAccessResponse(BaseModel):
    machineIds: List[str]


class UpdateMachineAccessInput(BaseModel):
    machineIds: List[str]


class UpdateUserRoleInput(BaseModel):
    role: UserRole


# ---------------------------------------------------------------------------
# Chat message input
# ---------------------------------------------------------------------------


class SendMessageInput(BaseModel):
    threadId: str
    userId: str
    text: str
    queryMode: Optional[str] = "auto"
    machineId: Optional[str] = None  # override thread.machine_id for prediction mode


class CreateThreadInput(BaseModel):
    user_id: str
    title: Optional[str] = None


class RenameThreadInput(BaseModel):
    title: str
