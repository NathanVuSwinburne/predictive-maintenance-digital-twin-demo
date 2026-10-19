import type { DigitalTwinDataProvider, RequestOptions, TelemetryRequestOptions } from "@/lib/data/provider";
import type {
  ActivationDetails, ActivationResult, CanonicalMachine, ChatMessage, ChatStreamEvent, ChatThread,
  CmtkConnectInput, CmtkConnectResult, CmtkProbeInput, CmtkProbeResult, CmtkSetup, CsvInspectionResult,
  DatasetVersion, EntityCapability, EntityCollectionSummary, EntityDataPreview, EntityDataSource, EntityDetail,
  EntityDowntimeConfig, EntityIngestionSummary, EntityInferenceResult, EntityLiveStatus, EntityModelAlert,
  EntityRecording, EntitySummary, EntityTelemetryRecord, EntityVibrationThresholds, FailureLabel,
  FleetLiveHealth, GenericSimulationResult, HistoryEvent, HistoryQuery, KnowledgeCaptureInput, KnowledgeConfig,
  KnowledgeGraph, KnowledgeGraphQuery, KnowledgeHistoryEntry, KnowledgeIngestJob, KnowledgeLintReport,
  KnowledgeNoteDetail, KnowledgeNoteSummary, KnowledgeRawSource, KnowledgeSearchHit, LlmConfiguration,
  LoginInput, LoginResult, MachineDetail, MachineSummary, MachinesQuery, MaintenanceRecommendation,
  ManualPredictionInput, ManualPredictionResult, ModelDeployment, ModelPromotion, ModelReadiness,
  MqttConnectionTestResult, MqttHealth, MqttSubscription, Prediction, PredictionConfig,
  PreprocessingPreviewResult, SendMessageInput, Session, SetupStatus, SimulationConfig, SimulationRun,
  SimulationScenarioInput, SimulationSessionPreview, SimulatorEntityModel, SimulatorEntityOption,
  TelemetryCsvFilter, TelemetrySeries, TotpBackupCodesResult, TotpSetupResult, TotpStatus,
  TrainingArchitectureOption, TrainingConfigurationValidation, TrainingGroup, TrainingRun,
  UserAccessResult, UserInvitationResult, UserInvitationSummary, UserPersona, UserRole, VerifyMfaInput,
} from "@/lib/domain/types";
import { DemoUnavailableError } from "@/lib/data/demo-errors";
import { demoKnowledge } from "@/lib/data/demo-knowledge-adapter";
import { DEMO_ASSETS, getDemoAsset } from "@/lib/demo-engineering/assets";
import {
  canonicalMachine, canForecast, entityDetail, entitySummary, hasGenericModels, listEntityTelemetry,
  modelReadiness, runEntityInference, runGenericSimulation, simulatorEntities,
  simulatorEntityModels, telemetrySeries,
} from "@/lib/demo-engineering/catalog";
import { composeDemoAssistantResponse, DEMO_PROMPT_SUGGESTIONS } from "@/lib/demo-engineering/chat";
import { createDemoHistory } from "@/lib/demo-engineering/history";
import {
  cmtkSetupAt, DEMO_MQTT_SUBSCRIPTIONS, fleetLiveHealthAt, isLiveDemoMachine, liveStatusAt, mqttHealthAt,
  vibrationThresholdsFor,
} from "@/lib/demo-engineering/live";
import { createPredictionConfig, scorePrediction } from "@/lib/demo-engineering/prediction";
import { createSessionPreview, createSimulationConfig, createSimulationRun } from "@/lib/demo-engineering/sessions";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

const NOW = "2026-06-28T08:00:00.000Z";
export const DEMO_TOKEN = "portfolio-demo-session";
const DAY_MS = 86_400_000;

const users: UserPersona[] = [
  { id: "demo-admin", name: "Portfolio Visitor", email: "demo@portfolio.local", role: "admin", shift: "Day", plant: "Demo Works", status: "active" },
  { id: "demo-engineer", name: "Alex Rivera", email: "alex@example.test", role: "user", shift: "Swing", plant: "Demo Works", status: "active" },
  { id: "demo-technician", name: "Morgan Lee", email: "morgan@example.test", role: "user", shift: "Night", plant: "Demo Works", status: "active" },
];

const unavailable = (what: string) => new DemoUnavailableError(`${what} needs the production backend, so it is switched off in this portfolio demo. Everything you see here is simulated in your browser.`);

/** Service dates move with the clock so the fleet never reads as permanently overdue. */
function serviceDates(index: number, nowMs: number) {
  const day = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const overdue = DEMO_ASSETS[index].id === "machine-c-01";
  return {
    lastServiceDate: new Date(day - (24 + index * 3) * DAY_MS).toISOString(),
    nextServiceDate: new Date(day + (overdue ? -2 : 9 + index * 4) * DAY_MS).toISOString(),
  };
}

function machineSummary(index: number, nowMs: number): MachineSummary {
  const machine = canonicalMachine(DEMO_ASSETS[index].id, nowMs);
  const { id, name, line, model, machineType, simulationSchema, status, healthScore, riskScore, uptimePercent } = machine;
  return { id, name, line, model, machineType, simulationSchema, status, healthScore, riskScore, uptimePercent, ...serviceDates(index, nowMs) };
}

function hasDemoCookie() {
  return typeof document !== "undefined" && document.cookie.split("; ").some((part) => part === `${SESSION_COOKIE_NAME}=${DEMO_TOKEN}`);
}

function setDemoCookie(on: boolean) {
  if (typeof document === "undefined") return;
  // Not HttpOnly: there is no server to set it, and it carries no secret, only "the visitor clicked Enter".
  document.cookie = on
    ? `${SESSION_COOKIE_NAME}=${DEMO_TOKEN}; path=/; max-age=86400; samesite=lax`
    : `${SESSION_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class DemoDigitalTwinProvider implements DigitalTwinDataProvider {
  private access = new Map<string, string[]>([["demo-engineer", DEMO_ASSETS.slice(0, 7).map((m) => m.id)], ["demo-technician", DEMO_ASSETS.slice(7).map((m) => m.id)]]);
  private threads = new Map<string, ChatThread>();
  private messages = new Map<string, ChatMessage[]>();
  private runs: SimulationRun[] = [];
  private invitations: UserInvitationSummary[] = [
    { id: "demo-invite-1", email: "jordan@example.test", name: "Jordan Park", role: "user", expiresAt: "2026-12-01T00:00:00.000Z", createdAt: "2026-10-10T02:00:00.000Z", status: "pending" },
    { id: "demo-invite-2", email: "morgan@example.test", name: "Morgan Lee", role: "user", expiresAt: "2026-09-20T00:00:00.000Z", createdAt: "2026-09-13T02:00:00.000Z", status: "accepted" },
  ];
  private counter = 0;
  private signedOut = false;
  private readonly clock: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.clock = options.now ?? (() => Date.now());
  }

  private session(): Session {
    return { token: DEMO_TOKEN, userId: "demo-admin", activePersonaId: "demo-admin", authenticatedAt: NOW };
  }

  // --- authentication ------------------------------------------------------------------
  async login(input: LoginInput): Promise<LoginResult> {
    void input;
    this.signedOut = false;
    setDemoCookie(true);
    return { requiresMfa: false, session: this.session(), mfaToken: null, availableMethods: [] };
  }
  async verifyMfa(input: VerifyMfaInput): Promise<Session> { void input; throw unavailable("Multi-factor sign-in"); }
  async logout() { this.signedOut = true; setDemoCookie(false); }
  async getSession(token?: string) {
    if (token !== undefined) return token === DEMO_TOKEN ? this.session() : null;
    if (typeof document === "undefined") return this.signedOut ? null : this.session();
    return hasDemoCookie() ? this.session() : null;
  }
  async getCurrentUser(token?: string) { return (await this.getSession(token)) ? structuredClone(users[0]) : null; }
  async getSetupStatus(): Promise<SetupStatus> { return { setupRequired: false }; }
  async getActivationDetails(token: string): Promise<ActivationDetails> { void token; throw unavailable("Account activation"); }
  async activateInvitation(input: { token: string; password: string; totpCode?: string }): Promise<ActivationResult> { void input; throw unavailable("Account activation"); }
  async getTotpStatus(): Promise<TotpStatus> { return { enabled: false, backupCodeCount: 0, unusedBackupCodeCount: 0 }; }
  async setupTotp(input: { password: string }): Promise<TotpSetupResult> { void input; throw unavailable("Authenticator setup"); }
  async confirmTotp(input: { setupToken: string; code: string }): Promise<TotpBackupCodesResult> { void input; throw unavailable("Authenticator setup"); }
  async disableTotp(input: { password: string }): Promise<TotpStatus> { void input; return this.getTotpStatus(); }
  async regenerateTotpBackupCodes(input: { password: string }): Promise<TotpBackupCodesResult> { void input; throw unavailable("Backup code generation"); }
  async getLlmConfiguration(): Promise<LlmConfiguration> { return { provider: "openai", hasApiKey: false, updatedAt: null }; }
  async updateLlmConfiguration(): Promise<LlmConfiguration> { throw new DemoUnavailableError("The demo assistant is scripted, so no language model or API key is used. Nothing is sent anywhere."); }

  // --- MQTT operations -----------------------------------------------------------------
  async getMqttHealth(options?: RequestOptions): Promise<MqttHealth> { void options; return mqttHealthAt(this.clock()); }
  async listMqttSubscriptions(options?: RequestOptions): Promise<MqttSubscription[]> { void options; return structuredClone(DEMO_MQTT_SUBSCRIPTIONS); }
  async createMqttSubscription(): Promise<MqttSubscription> { throw unavailable("Adding a broker subscription"); }
  async updateMqttSubscription(): Promise<MqttSubscription> { throw unavailable("Changing a broker subscription"); }
  async deleteMqttSubscription(): Promise<void> { throw unavailable("Removing a broker subscription"); }

  // --- machine registry (entities) -----------------------------------------------------
  async listEntities(): Promise<EntitySummary[]> { return DEMO_ASSETS.map(entitySummary); }
  async createEntity(): Promise<EntityDetail> { throw unavailable("Registering a machine on the server"); }
  async deleteEntity(): Promise<void> { throw unavailable("Deleting a registered machine"); }
  async uploadEntityImage(): Promise<EntityDetail> { throw unavailable("Uploading a machine image"); }
  async getEntity(entityId: string): Promise<EntityDetail> { return entityDetail(entityId); }
  async appendEntityFeatures(): Promise<EntityDetail> { throw unavailable("Changing a machine's schema"); }
  async getEntityCollection(entityId: string): Promise<EntityCollectionSummary> {
    const machine = canonicalMachine(entityId, this.clock());
    return {
      entityId, totalRows: machine.telemetry.rows, totalSessions: machine.telemetry.sessions, earliestTimestamp: null, latestTimestamp: machine.telemetry.latestTimestamp ?? null,
      capabilityProgress: machine.capabilities.map((capability) => ({ capability, readyToTrain: true, progressPercent: 100, observedRows: machine.telemetry.rows, requiredRows: 500, observedSessions: machine.telemetry.sessions, requiredSessions: 2, observedLabelCounts: {}, requiredClasses: 2, requiredExamplesPerClass: 20, nextAction: "Ready to train." })),
      latestBatch: null,
    };
  }
  async listEntityTelemetry(entityId: string, input?: { sessionId?: string; limit?: number }): Promise<EntityTelemetryRecord[]> { return listEntityTelemetry(entityId, this.clock(), input); }
  async inspectEntityTelemetryCsv(): Promise<CsvInspectionResult> { throw unavailable("CSV upload"); }
  async createEntityCsvDataSource(): Promise<EntityIngestionSummary> { throw unavailable("CSV upload"); }
  async getEntityDataPreview(entityId: string, limit = 20): Promise<EntityDataPreview> {
    const records = listEntityTelemetry(entityId, this.clock(), { limit });
    return {
      entityId, totalRows: canonicalMachine(entityId, this.clock()).telemetry.rows, columns: Object.keys(records[0]?.payload ?? {}),
      rows: records.map((record) => ({ timestamp: record.timestamp, sessionId: record.sessionId, schemaVersion: record.schemaVersion, values: record.payload, dataSourceId: null, sourceName: "Demo replay", sourceType: isLiveDemoMachine(entityId) ? "mqtt" : "csv", ingestedAt: record.timestamp })),
      sources: [],
    };
  }
  async getEntityLiveStatus(entityId: string, options?: TelemetryRequestOptions): Promise<EntityLiveStatus> { getDemoAsset(entityId); return liveStatusAt(entityId, this.clock(), options?.limit ?? 60); }
  async getFleetLiveHealth(options?: RequestOptions): Promise<FleetLiveHealth> { void options; return fleetLiveHealthAt(DEMO_ASSETS.map((asset) => asset.id), this.clock()); }
  async getEntityVibrationThresholds(entityId: string): Promise<EntityVibrationThresholds> {
    if (!isLiveDemoMachine(entityId)) throw unavailable("Vibration baselines for a machine without a live vibration feed");
    return vibrationThresholdsFor(entityId, this.clock());
  }
  async getCmtkSetup(): Promise<CmtkSetup> { return cmtkSetupAt(this.clock()); }
  async connectCmtkMachine(input: CmtkConnectInput): Promise<CmtkConnectResult> { void input; throw unavailable("Connecting a machine to a real CMTK broker"); }
  async probeCmtkBroker(input: CmtkProbeInput): Promise<CmtkProbeResult> { void input; throw unavailable("Listening to a real MQTT broker"); }
  async createEntityMqttDataSource(): Promise<EntityDataSource> { throw unavailable("Adding an MQTT source"); }
  async deleteEntityMqttDataSource(): Promise<void> { throw unavailable("Removing an MQTT source"); }
  async testEntityMqttDataSource(): Promise<MqttConnectionTestResult> { throw unavailable("Testing an MQTT connection"); }
  async startEntityRecording(): Promise<EntityRecording> { throw unavailable("Recording MQTT data"); }
  async stopEntityRecording(): Promise<EntityRecording> { throw unavailable("Recording MQTT data"); }
  async listEntityRecordings(): Promise<EntityRecording[]> { return []; }
  async getEntityRecording(): Promise<EntityRecording> { throw unavailable("Recording MQTT data"); }
  entityTelemetryCsvUrl(entityId: string, filter: TelemetryCsvFilter): string {
    const records = listEntityTelemetry(entityId, this.clock(), { sessionId: filter.sessionId, limit: 500 });
    const columns = Object.keys(records[0]?.payload ?? {});
    const lines = [["timestamp", "session_id", ...columns].join(","), ...records.map((record) => [record.timestamp, record.sessionId, ...columns.map((column) => String(record.payload[column] ?? ""))].join(","))];
    return `data:text/csv;charset=utf-8,${encodeURIComponent(lines.join("\n"))}`;
  }
  async previewEntityPreprocessing(): Promise<PreprocessingPreviewResult> { throw unavailable("Server-side preprocessing"); }
  async ingestEntityTelemetry(): Promise<EntityIngestionSummary> { throw unavailable("Ingesting telemetry"); }
  async uploadEntityTelemetryCsv(): Promise<EntityIngestionSummary> { throw unavailable("CSV upload"); }
  async listEntityFailureLabels(): Promise<FailureLabel[]> { return []; }
  async createEntityFailureLabel(): Promise<FailureLabel> { throw unavailable("Recording a failure label"); }
  async deleteEntityFailureLabel(): Promise<void> { throw unavailable("Removing a failure label"); }
  async listEntityDatasetVersions(): Promise<DatasetVersion[]> { return []; }
  async createEntityDatasetVersion(): Promise<DatasetVersion> { throw unavailable("Building a dataset on the server"); }
  async createEntityPreparedDataset(): Promise<DatasetVersion> { throw unavailable("Building a dataset on the server"); }
  async listEntityTrainingArchitectures(): Promise<TrainingArchitectureOption[]> { return []; }
  async validateEntityTrainingConfiguration(): Promise<TrainingConfigurationValidation> { throw unavailable("Server-side training validation"); }
  async listEntityTrainingRuns(): Promise<TrainingRun[]> { return []; }
  async createEntityTrainingRun(): Promise<TrainingRun> { throw unavailable("The training worker"); }
  async createEntityTrainingGroup(): Promise<TrainingGroup> { throw unavailable("The training worker"); }
  async getEntityTrainingGroup(): Promise<TrainingGroup> { throw unavailable("The training worker"); }
  async retryEntityTrainingGroupChild(): Promise<TrainingGroup> { throw unavailable("The training worker"); }
  async cancelEntityTrainingRun(): Promise<void> { throw unavailable("The training worker"); }
  async importEntityOnnxModel(): Promise<TrainingRun> { throw unavailable("Importing an ONNX model"); }
  async promoteEntityTrainingRun(): Promise<ModelPromotion> { throw unavailable("Promoting a server-trained model"); }
  async listEntityModelDeployments(entityId: string): Promise<ModelDeployment[]> {
    const machine = canonicalMachine(entityId, this.clock());
    return (Object.entries(machine.productionModels) as Array<[EntityCapability, { modelName: string; modelVersion: string }]>).map(([capability, model]) => ({
      id: `demo-deployment-${entityId}-${capability}`, entityId, capability, trainingRunId: `demo-run-${entityId}-${capability}`, modelName: model.modelName, modelVersion: model.modelVersion,
      alias: "production", status: "confirmed", active: true, requestedByUserId: "demo-admin", requestedAt: "2026-10-02T03:00:00.000Z", confirmedAt: "2026-10-02T03:00:05.000Z", lastCheckedAt: new Date(this.clock()).toISOString(), errorMessage: null, overrideReason: null,
    }));
  }
  async reconcileModelDeployments() { return { checked: DEMO_ASSETS.filter(hasGenericModels).length, repaired: 0, failed: 0 }; }
  async runEntityInference(entityId: string, capability: "simulate" | "predict", input?: { sessionId?: string; limit?: number; values?: Record<string, unknown> }): Promise<EntityInferenceResult> {
    await wait(250);
    return runEntityInference(entityId, capability, this.clock(), input);
  }
  async listSimulatorEntityModels(): Promise<SimulatorEntityModel[]> { return simulatorEntityModels(); }
  async listSimulatorEntities(): Promise<SimulatorEntityOption[]> { return simulatorEntities(this.clock()); }
  async runGenericSimulation(entityId: string, input: { sessionId?: string; timeRange?: { start: string; end: string }; durationMinutes: 30 | 60 | 240 }): Promise<GenericSimulationResult> {
    if (!canForecast(getDemoAsset(entityId))) throw unavailable("Forecasting a machine with no active forecasting model");
    await wait(350);
    return runGenericSimulation(entityId, this.clock(), input);
  }
  async listEntityModelAlerts(): Promise<EntityModelAlert[]> { return []; }
  async resolveEntityModelAlert(): Promise<void> { throw unavailable("Resolving a model alert"); }
  async listEntityDowntimeConfig(): Promise<EntityDowntimeConfig[]> { return []; }
  async upsertEntityDowntimeConfig(): Promise<EntityDowntimeConfig> { throw unavailable("Changing downtime baselines"); }

  // --- users and access ---------------------------------------------------------------
  async listUsers() { return structuredClone(users); }
  private filterMachines<T extends MachineSummary>(items: T[], query: MachinesQuery): T[] {
    let result = [...items];
    if (query.authorizedForUserId && query.authorizedForUserId !== "demo-admin") result = result.filter((m) => (this.access.get(query.authorizedForUserId!) ?? []).includes(m.id));
    if (query.search) { const term = query.search.toLowerCase(); result = result.filter((m) => `${m.name} ${m.model} ${m.line}`.toLowerCase().includes(term)); }
    if (query.line) result = result.filter((m) => m.line === query.line);
    if (query.status && query.status !== "all") result = result.filter((m) => m.status === query.status);
    const direction = query.sortDirection === "asc" ? 1 : -1;
    const key = query.sortBy ?? "name";
    return result.sort((a, b) => {
      const left = key === "risk" ? a.riskScore : key === "health" ? a.healthScore : key === "uptime" ? a.uptimePercent : a.name;
      const right = key === "risk" ? b.riskScore : key === "health" ? b.healthScore : key === "uptime" ? b.uptimePercent : b.name;
      return (typeof left === "string" ? left.localeCompare(String(right)) : left - Number(right)) * direction;
    });
  }
  async listMachines(query: MachinesQuery = {}) { const now = this.clock(); return this.filterMachines(DEMO_ASSETS.map((_, index) => machineSummary(index, now)), query); }
  async listCanonicalMachines(query: MachinesQuery = {}): Promise<CanonicalMachine[]> {
    const now = this.clock();
    return this.filterMachines(DEMO_ASSETS.map((asset, index) => ({ ...canonicalMachine(asset.id, now), ...serviceDates(index, now) })), query);
  }
  async getCanonicalMachine(entityId: string): Promise<CanonicalMachine> { const now = this.clock(); return { ...canonicalMachine(entityId, now), ...serviceDates(DEMO_ASSETS.findIndex((asset) => asset.id === entityId), now) }; }
  async getUserMachineAccess(userId: string) { return userId === "demo-admin" ? DEMO_ASSETS.map((m) => m.id) : [...(this.access.get(userId) ?? [])]; }
  async updateUserMachineAccess(userId: string, machineIds: string[]) { this.access.set(userId, [...machineIds]); return [...machineIds]; }
  async getMachineAuthorizedUsers(machineId: string) { return users.filter((user) => user.role === "admin" || (this.access.get(user.id) ?? []).includes(machineId)); }
  async updateUserRole(userId: string, role: UserRole) { const user = users.find((item) => item.id === userId); if (!user) throw new Error("Unknown user"); if (userId === "demo-admin" && role !== "admin") throw new DemoUnavailableError("The demo visitor stays an administrator so every page remains open to explore."); user.role = role; return { ...user }; }
  async updateUserAccess(userId: string, input: { role: UserRole; machineIds: string[] }): Promise<UserAccessResult> {
    const user = await this.updateUserRole(userId, input.role);
    const entityIds = await this.updateUserMachineAccess(userId, input.machineIds);
    return { user, entityIds, sessionRevoked: false };
  }
  async createUserInvitation(): Promise<UserInvitationResult> { throw unavailable("Inviting a new account"); }
  async listUserInvitations() { return structuredClone(this.invitations); }
  async revokeUserInvitation(invitationId: string) {
    const invitation = this.invitations.find((item) => item.id === invitationId);
    if (!invitation) throw new Error("Unknown invitation");
    invitation.status = "revoked";
    return { ...invitation };
  }
  async replaceUserInvitation(): Promise<UserInvitationResult> { throw unavailable("Generating an activation link"); }
  async updateUserStatus(userId: string, status: NonNullable<UserPersona["status"]>) {
    const user = users.find((item) => item.id === userId);
    if (!user) throw new Error("Unknown user");
    if (userId === "demo-admin") throw new DemoUnavailableError("The demo visitor's own account cannot be suspended, or the demo would lock itself.");
    user.status = status;
    return { ...user };
  }
  async userHasMachineAccess(userId: string, machineId: string) { return (await this.getUserMachineAccess(userId)).includes(machineId); }

  // --- machines (legacy views) ---------------------------------------------------------
  async getMachineDetail(machineId: string): Promise<MachineDetail> {
    const machine = await this.getCanonicalMachine(machineId);
    const index = DEMO_ASSETS.findIndex((asset) => asset.id === machineId);
    return { ...machineSummary(index, this.clock()), location: machine.location, operatingHours: machine.operatingHours, primaryFailureModes: machine.primaryFailureModes, notes: "Fictional portfolio-demo asset. Metrics are deterministic simulations." };
  }
  async getMachineTelemetry(machineId: string, options?: TelemetryRequestOptions): Promise<TelemetrySeries> { getDemoAsset(machineId); return telemetrySeries(machineId, this.clock(), options?.limit ?? 120); }
  async getMachinePredictions(machineId: string): Promise<Prediction[]> {
    const asset = getDemoAsset(machineId);
    return [{ id: `prediction-${machineId}`, machineId, generatedAt: new Date(Math.floor(this.clock() / 3_600_000) * 3_600_000).toISOString(), horizonHours: 1, failureMode: asset.machineType === "real-sensor" ? "Bearing imbalance" : "Thermal overload", probability: asset.riskScore / 100, confidence: 0.89, severity: asset.riskScore > 70 ? "high" : asset.riskScore > 35 ? "medium" : "low", provenance: { outputSources: ["ml-prediction"], basisSources: ["historical-machine-data"], evidence: [{ source: "ml-prediction", label: "Demo risk model", reference: machineId, detail: "Deterministic demo score" }] } }];
  }
  async getModelReadiness(machineId: string): Promise<ModelReadiness> { return modelReadiness(machineId, this.clock()); }
  async getPredictionConfig(machineId: string): Promise<PredictionConfig> { return createPredictionConfig(machineId); }
  async predictMachine(machineId: string, input: ManualPredictionInput): Promise<ManualPredictionResult> { return { ...scorePrediction(machineId, input.values), generatedAt: new Date(this.clock()).toISOString() }; }
  async getSimulationConfig(machineId: string): Promise<SimulationConfig> { return createSimulationConfig(machineId); }
  async getSimulationSessionPreview(machineId: string, sessionId: number): Promise<SimulationSessionPreview> { return createSessionPreview(machineId, sessionId); }
  async getMaintenanceRecommendations(machineId: string): Promise<MaintenanceRecommendation[]> { const machine = getDemoAsset(machineId); return [{ id: `recommendation-${machineId}`, machineId, title: machine.riskScore > 70 ? "Inspect bearing assembly" : "Continue condition monitoring", detail: "Review the simulated vibration trend before the next planned service window.", actionType: machine.riskScore > 70 ? "inspect" : "parameter", priority: machine.riskScore > 70 ? "high" : "low", etaMinutes: 30, estimatedDowntimeHours: machine.riskScore > 70 ? 1.5 : 0 }]; }

  async listHistoryEvents(query: HistoryQuery = {}): Promise<HistoryEvent[]> { return createDemoHistory(Math.floor(this.clock() / 3_600_000) * 3_600_000).filter((event) => (!query.userId || event.userId === query.userId) && (!query.machineId || event.machineId === query.machineId) && (!query.machineIds || (event.machineId && query.machineIds.includes(event.machineId))) && (!query.type || query.type === "all" || event.type === query.type) && (!query.dateFrom || event.timestamp >= query.dateFrom) && (!query.dateTo || event.timestamp <= query.dateTo)); }

  // --- chat ---------------------------------------------------------------------------
  async listThreads(userId: string) { return [...this.threads.values()].filter((thread) => thread.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async createThread(input: { userId: string; title?: string }) { const id = `demo-thread-${++this.counter}`; const thread: ChatThread = { id, title: input.title ?? "Fleet briefing", updatedAt: new Date(this.clock()).toISOString(), userId: input.userId, promptSuggestions: [...DEMO_PROMPT_SUGGESTIONS], followUpSuggestions: ["Show latest Packaging Drive 01 values as a table", "Compare fleet risk"] }; this.threads.set(id, thread); this.messages.set(id, []); return { ...thread }; }
  async getThread(threadId: string) { const thread = this.threads.get(threadId); if (!thread) throw new Error("Unknown thread"); return { thread: { ...thread }, messages: [...(this.messages.get(threadId) ?? [])] }; }
  async renameThread(threadId: string, title: string) { const thread = this.threads.get(threadId); if (!thread) throw new Error("Unknown thread"); thread.title = title; return { ...thread }; }
  async deleteThread(threadId: string) { this.threads.delete(threadId); this.messages.delete(threadId); }
  async sendMessage(input: SendMessageInput) {
    return this.commitTurn(input, this.composeTurn(input));
  }
  private composeTurn(input: SendMessageInput) {
    return composeDemoAssistantResponse({ prompt: input.text, threadId: input.threadId, machineId: input.machineId, now: this.clock() });
  }
  /** Writes a finished turn to the thread. A streamed turn only does this once the stream ends. */
  private commitTurn(input: SendMessageInput, response: ReturnType<typeof composeDemoAssistantResponse>) {
    const thread = this.threads.get(input.threadId);
    if (!thread) throw new Error("Unknown thread");
    const at = new Date(this.clock()).toISOString();
    const history = this.messages.get(input.threadId) ?? [];
    const userMessage: ChatMessage = { id: `demo-message-${++this.counter}`, threadId: input.threadId, role: "user", createdAt: at, contentBlocks: [{ type: "text", content: input.text }] };
    const assistant: ChatMessage = { id: `demo-message-${++this.counter}`, threadId: input.threadId, role: "assistant", createdAt: at, ...response };
    const next = [...history, userMessage, assistant];
    this.messages.set(input.threadId, next);
    thread.updatedAt = at;
    if (thread.title === "New Conversation") thread.title = input.text.slice(0, 48);
    return { thread: { ...thread }, messages: next };
  }
  /** Replays the scripted turn as the production stream would: each tool, then the answer text. */
  async sendMessageStreamed(input: SendMessageInput, onEvent: (event: ChatStreamEvent) => void) {
    if (!this.threads.has(input.threadId)) throw new Error("Unknown thread");
    const assistant = this.composeTurn(input);
    for (const step of assistant.agentTrace ?? []) {
      onEvent({ type: "status", phase: "running", tool: step.tool, label: step.label });
      await wait(320);
      onEvent({ type: "status", phase: "finished", tool: step.tool, label: step.label });
    }
    const text = assistant.contentBlocks.find((block) => block.type === "text");
    if (text && text.type === "text") {
      for (const chunk of text.content.match(/.{1,24}(\s|$)/g) ?? [text.content]) {
        onEvent({ type: "delta", text: chunk });
        await wait(25);
      }
    }
    const result = this.commitTurn(input, assistant);
    onEvent({ type: "done", thread: result.thread, messages: result.messages });
    return result;
  }

  // --- simulation -----------------------------------------------------------------------
  async listSimulationRuns(userId?: string) { return this.runs.filter((run) => !userId || run.userId === userId); }
  async runSimulation(input: SimulationScenarioInput, userId: string): Promise<SimulationRun> { const run = createSimulationRun(createSessionPreview(input.machineId, input.sessionId), input.simulationHorizonMinutes ?? 30, userId, input.scenarioName); this.runs.unshift(run); return run; }

  // --- knowledge ----------------------------------------------------------------------
  async listKnowledgeNotes(namespace?: string): Promise<KnowledgeNoteSummary[]> { return demoKnowledge.listNotes(namespace); }
  async getKnowledgeNote(path: string): Promise<KnowledgeNoteDetail> { return demoKnowledge.getNote(path); }
  async saveKnowledgeNote(path: string, input: { content: string; expectedMtime?: number | null; reason?: string }) { return demoKnowledge.saveNote(path, input); }
  async createKnowledgeNote(input: { namespace: string; title: string; content?: string; reason?: string }) { return demoKnowledge.createNote(input); }
  async deleteKnowledgeNote(path: string, reason?: string) { demoKnowledge.deleteNote(path, reason); }
  async listKnowledgeNoteHistory(path: string): Promise<KnowledgeHistoryEntry[]> { return demoKnowledge.history(path); }
  async restoreKnowledgeNote(path: string, stamp: string) { return demoKnowledge.restore(path, stamp); }
  async getKnowledgeGraph(query?: KnowledgeGraphQuery): Promise<KnowledgeGraph> { return demoKnowledge.graph(query); }
  async searchKnowledge(query: string, options?: { namespace?: string; limit?: number }): Promise<KnowledgeSearchHit[]> { return demoKnowledge.search(query, options); }
  async getKnowledgeLint(): Promise<KnowledgeLintReport> { return demoKnowledge.lint(); }
  async getKnowledgeLog(limit?: number) { return demoKnowledge.log(limit); }
  async listKnowledgeSources(): Promise<KnowledgeRawSource[]> { return []; }
  async uploadKnowledgeSource(): Promise<KnowledgeRawSource> { throw unavailable("Uploading a source document"); }
  async getKnowledgeConfig(): Promise<KnowledgeConfig> { return { enabled: true, agentReadNamespaces: ["domain", "concepts", "sources", "fleet", "agent"], agentWriteNamespaces: ["fleet", "concepts"], autoCapture: false, maxNoteBytesInjected: 12_000 }; }
  async updateKnowledgeConfig(): Promise<KnowledgeConfig> { throw unavailable("Changing the assistant's knowledge settings"); }
  async resetKnowledgeVault() { return demoKnowledge.reset(); }
  async startKnowledgeIngest(): Promise<KnowledgeIngestJob> { throw unavailable("Turning an upload into a knowledge page"); }
  async getKnowledgeIngestJob(): Promise<KnowledgeIngestJob> { throw unavailable("Turning an upload into a knowledge page"); }
  async captureToKnowledge(input: KnowledgeCaptureInput): Promise<KnowledgeNoteDetail> { return demoKnowledge.capture(input); }
}

