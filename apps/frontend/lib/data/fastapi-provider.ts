import type {
  CmtkConnectInput,
  CmtkConnectResult,
  CmtkProbeInput,
  CmtkProbeResult,
  CmtkSetup,
  ChatMessage,
  ChatThread,
  CanonicalMachine,
  CsvInspectionResult,
  DatasetVersion,
  DatasetVersionCreateInput,
  EntityCreateInput,
  EntityCapability,
  EntityCollectionSummary,
  EntityDataPreview,
  EntityDataSource,
  EntityRecording,
  EntityRecordingStartInput,
  EntityDetail,
  EntityDowntimeConfig,
  EntityFeatureInput,
  EntityInferenceResult,
  EntityLiveStatus,
  FleetLiveHealth,
  EntityVibrationThresholds,
  GenericSimulationResult,
  SimulatorEntityModel,
  SimulatorEntityOption,
  EntityIngestionSummary,
  EntityModelAlert,
  EntitySummary,
  EntityTelemetryInput,
  EntityTelemetryRecord,
  FailureLabel,
  FailureLabelInput,
  HistoryEvent,
  HistoryQuery,
  KnowledgeCaptureInput,
  KnowledgeConfig,
  KnowledgeGraph,
  KnowledgeGraphQuery,
  KnowledgeHistoryEntry,
  KnowledgeIngestJob,
  KnowledgeLintReport,
  KnowledgeNoteDetail,
  KnowledgeNoteSummary,
  KnowledgeRawSource,
  KnowledgeSearchHit,
  LoginInput,
  LoginResult,
  LlmConfiguration,
  MachineDetail,
  MachineSummary,
  MachinesQuery,
  ManualPredictionInput,
  ManualPredictionResult,
  MaintenanceRecommendation,
  ModelReadiness,
  MqttConnectionTestResult,
  MqttHealth,
  MqttSourceInput,
  MqttSubscription,
  MqttSubscriptionInput,
  ModelPromotion,
  ModelDeployment,
  Prediction,
  PredictionConfig,
  PreprocessingPreviewResult,
  PreprocessingAnalysis,
  PreprocessingRecipe,
  Session,
  ChatStreamEvent,
  SendMessageInput,
  SimulationConfig,
  SimulationSessionPreview,
  SimulationRun,
  SimulationScenarioInput,
  TelemetryCsvFilter,
  TelemetryPoint,
  TelemetrySeries,
  TotpBackupCodesResult,
  TotpSetupResult,
  TotpStatus,
  TrainingArchitectureOption,
  TrainingConfiguration,
  TrainingConfigurationValidation,
  TrainingGroup,
  TrainingRun,
  UpdateLlmConfigurationInput,
  UserPersona,
  UserRole,
  VerifyMfaInput,
  SetupStatus,
  ActivationDetails,
  ActivationResult,
  UserInvitationInput,
  UserInvitationResult,
  UserInvitationSummary,
  UserAccessResult,
} from "@/lib/domain/types";
import type {
  DigitalTwinDataProvider,
  ModelReadinessRequestOptions,
  RequestOptions,
  TelemetryRequestOptions,
} from "@/lib/data/provider";

function toQueryString(
  params: Record<string, string | number | boolean | undefined | null>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // Only absent and empty values are dropped. `false` and `0` are real
    // arguments — omitting `include_wanted=false` would silently fall back to
    // the server's default of true and the filter would appear not to work.
    if (value === undefined || value === null || value === "") {
      continue;
    }
    query.set(key, String(value));
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

/**
 * Carries the API's own `detail` alongside the message, so a caller that knows how to
 * act on a structured rejection can, while everything else keeps reading `.message`.
 */
export class ApiError extends Error {
  status: number;
  path: string;
  detail?: unknown;
  rawBody?: string;

  constructor({
    status,
    path = "",
    detail,
    rawBody,
  }: {
    status: number;
    path?: string;
    detail?: unknown;
    rawBody?: string;
  }) {
    super("The service could not complete the request.");
    this.name = "ApiError";
    this.status = status;
    this.path = path;
    this.detail = detail;
    this.rawBody = rawBody;
  }
}

/**
 * Did the backend refuse this send because the thread is already answering?
 *
 * A thread runs one turn at a time — two at once cannot see each other's
 * question and their replies land in wall-clock order rather than the order
 * they were asked — so the API answers an overlapping send with 409. It is a
 * "not now", not a failure, and the UI says so differently.
 */
export function isThreadBusy(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

export class FastApiDigitalTwinProvider implements DigitalTwinDataProvider {
  constructor(private readonly baseUrl: string) {}

  private async resolveSessionToken() {
    if (typeof window !== "undefined") return null;

    try {
      const { cookies } = await import("next/headers");
      return (await cookies()).get("pmdt_session")?.value ?? null;
    } catch {
      return null;
    }
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    options?: { requiresAuth?: boolean; authToken?: string | null },
  ): Promise<T> {
    const headers = new Headers(init?.headers ?? {});
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (options?.requiresAuth) {
      const authToken = options.authToken ?? (await this.resolveSessionToken());
      if (authToken) {
        headers.set("Authorization", `Bearer ${authToken}`);
      }
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) {
      const text = await response.text();
      let detail: unknown;
      try {
        detail = (JSON.parse(text) as { detail?: unknown }).detail;
      } catch {
        detail = undefined;
      }
      throw new ApiError({ status: response.status, path, detail, rawBody: text });
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async login(input: LoginInput): Promise<LoginResult> {
    return this.request<LoginResult>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async verifyMfa(input: VerifyMfaInput): Promise<Session> {
    return this.request<Session>("/api/v1/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async logout(token?: string): Promise<void> {
    return this.request<void>("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify(token ? { token } : {}),
    });
  }

  async getSession(token?: string): Promise<Session | null> {
    return this.request<Session | null>(
      `/api/v1/auth/session${toQueryString({ token })}`,
    );
  }

  async getCurrentUser(token?: string): Promise<UserPersona | null> {
    return this.request<UserPersona | null>("/api/v1/auth/me", undefined, {
      requiresAuth: true,
      authToken: token,
    });
  }

  async getSetupStatus(): Promise<SetupStatus> {
    return this.request<SetupStatus>("/api/v1/setup/status");
  }

  async getActivationDetails(token: string): Promise<ActivationDetails> {
    return this.request<ActivationDetails>(`/api/v1/setup/activation${toQueryString({ token })}`);
  }

  async activateInvitation(input: { token: string; password: string; totpCode?: string }): Promise<ActivationResult> {
    return this.request<ActivationResult>("/api/v1/setup/activate", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async getTotpStatus(): Promise<TotpStatus> {
    return this.request<TotpStatus>("/api/v1/auth/totp", undefined, {
      requiresAuth: true,
    });
  }

  async setupTotp(input: { password: string }): Promise<TotpSetupResult> {
    return this.request<TotpSetupResult>(
      "/api/v1/auth/totp/setup",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      { requiresAuth: true },
    );
  }

  async confirmTotp(input: {
    setupToken: string;
    code: string;
  }): Promise<TotpBackupCodesResult> {
    return this.request<TotpBackupCodesResult>(
      "/api/v1/auth/totp/confirm",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      { requiresAuth: true },
    );
  }

  async disableTotp(input: { password: string }): Promise<TotpStatus> {
    return this.request<TotpStatus>(
      "/api/v1/auth/totp/disable",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      { requiresAuth: true },
    );
  }

  async regenerateTotpBackupCodes(input: {
    password: string;
  }): Promise<TotpBackupCodesResult> {
    return this.request<TotpBackupCodesResult>(
      "/api/v1/auth/totp/backup-codes/regenerate",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      { requiresAuth: true },
    );
  }

  async getLlmConfiguration(): Promise<LlmConfiguration> {
    return this.request<LlmConfiguration>(
      "/api/v1/admin/ai-assistant",
      undefined,
      { requiresAuth: true },
    );
  }

  async updateLlmConfiguration(
    input: UpdateLlmConfigurationInput,
  ): Promise<LlmConfiguration> {
    return this.request<LlmConfiguration>(
      "/api/v1/admin/ai-assistant",
      { method: "PUT", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async listEntities(): Promise<EntitySummary[]> {
    return this.request<EntitySummary[]>("/api/v1/entities", undefined, {
      requiresAuth: true,
    });
  }

  async createEntity(input: EntityCreateInput): Promise<EntityDetail> {
    return this.request<EntityDetail>(
      "/api/v1/entities",
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async deleteEntity(entityId: string): Promise<void> {
    await this.request<void>(
      `/api/v1/entities/${entityId}`,
      { method: "DELETE" },
      { requiresAuth: true },
    );
  }

  async uploadEntityImage(entityId: string, image: File): Promise<EntityDetail> {
    return this.request<EntityDetail>(
      `/api/v1/entities/${entityId}/image`,
      {
        method: "PUT",
        headers: { "Content-Type": image.type },
        body: image,
      },
      { requiresAuth: true },
    );
  }

  async getEntity(entityId: string): Promise<EntityDetail> {
    return this.request<EntityDetail>(
      `/api/v1/entities/${entityId}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async appendEntityFeatures(
    entityId: string,
    features: EntityFeatureInput[],
  ): Promise<EntityDetail> {
    return this.request<EntityDetail>(
      `/api/v1/entities/${entityId}/features`,
      { method: "POST", body: JSON.stringify({ features }) },
      { requiresAuth: true },
    );
  }

  async getEntityCollection(entityId: string): Promise<EntityCollectionSummary> {
    return this.request<EntityCollectionSummary>(
      `/api/v1/entities/${entityId}/collection`,
      undefined,
      { requiresAuth: true },
    );
  }

  async inspectEntityTelemetryCsv(
    entityId: string,
    fileName: string,
    csv: string,
  ): Promise<CsvInspectionResult> {
    return this.request<CsvInspectionResult>(
      `/api/v1/entities/${entityId}/data-sources/csv/inspect${toQueryString({ fileName })}`,
      {
        method: "POST",
        headers: { "Content-Type": "text/csv; charset=utf-8" },
        body: csv,
      },
      { requiresAuth: true },
    );
  }

  async createEntityCsvDataSource(
    entityId: string,
    csv: string,
    input: {
      sourceName: string;
      fileName: string;
      capabilities: EntityCapability[];
      timestampColumn?: string;
      sessionColumn?: string;
      labelColumn?: string;
      featureColumns: string[];
      categoricalColumns?: string[];
      positiveClass?: string;
      idempotencyKey?: string;
    },
  ): Promise<EntityIngestionSummary> {
    const query = new URLSearchParams({
      sourceName: input.sourceName,
      fileName: input.fileName,
    });
    for (const capability of input.capabilities) query.append("capability", capability);
    if (input.timestampColumn) query.set("timestampColumn", input.timestampColumn);
    if (input.sessionColumn) query.set("sessionColumn", input.sessionColumn);
    if (input.labelColumn) query.set("labelColumn", input.labelColumn);
    for (const feature of input.featureColumns) {
      query.append("featureColumn", feature);
    }
    for (const feature of input.categoricalColumns ?? []) {
      query.append("categoricalColumn", feature);
    }
    if (input.positiveClass) query.set("positiveClass", input.positiveClass);
    if (input.idempotencyKey) query.set("idempotencyKey", input.idempotencyKey);
    return this.request<EntityIngestionSummary>(
      `/api/v1/entities/${entityId}/data-sources/csv?${query.toString()}`,
      {
        method: "POST",
        headers: { "Content-Type": "text/csv; charset=utf-8" },
        body: csv,
      },
      { requiresAuth: true },
    );
  }

  async getEntityDataPreview(
    entityId: string,
    limit = 10,
  ): Promise<EntityDataPreview> {
    return this.request<EntityDataPreview>(
      `/api/v1/entities/${entityId}/data-preview?limit=${limit}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async getEntityLiveStatus(
    entityId: string,
    options?: TelemetryRequestOptions,
  ): Promise<EntityLiveStatus> {
    return this.request<EntityLiveStatus>(
      `/api/v1/entities/${entityId}/live${toQueryString({
        limit: options?.limit?.toString(),
      })}`,
      { signal: options?.signal },
      { requiresAuth: true },
    );
  }

  async getFleetLiveHealth(options?: RequestOptions): Promise<FleetLiveHealth> {
    return this.request<FleetLiveHealth>(
      "/api/v1/entities/live/fleet",
      { signal: options?.signal },
      { requiresAuth: true },
    );
  }

  async getEntityVibrationThresholds(entityId: string): Promise<EntityVibrationThresholds> {
    return this.request<EntityVibrationThresholds>(
      `/api/v1/entities/${entityId}/vibration-thresholds`,
      undefined,
      { requiresAuth: true },
    );
  }

  async getCmtkSetup(): Promise<CmtkSetup> {
    return this.request<CmtkSetup>("/api/v1/cmtk/setup", undefined, {
      requiresAuth: true,
    });
  }

  async connectCmtkMachine(input: CmtkConnectInput): Promise<CmtkConnectResult> {
    return this.request<CmtkConnectResult>(
      "/api/v1/cmtk/connect",
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async probeCmtkBroker(input: CmtkProbeInput): Promise<CmtkProbeResult> {
    return this.request<CmtkProbeResult>(
      "/api/v1/cmtk/probe",
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async createEntityMqttDataSource(
    entityId: string,
    input: MqttSourceInput,
  ): Promise<EntityDataSource> {
    return this.request<EntityDataSource>(
      `/api/v1/entities/${entityId}/data-sources/mqtt`,
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async deleteEntityMqttDataSource(entityId: string, sourceId: string): Promise<void> {
    await this.request<void>(
      `/api/v1/entities/${entityId}/data-sources/mqtt/${sourceId}`,
      { method: "DELETE" },
      { requiresAuth: true },
    );
  }

  async testEntityMqttDataSource(
    entityId: string,
    sourceId: string,
  ): Promise<MqttConnectionTestResult> {
    return this.request<MqttConnectionTestResult>(
      `/api/v1/entities/${entityId}/data-sources/mqtt/${sourceId}/test`,
      { method: "POST" },
      { requiresAuth: true },
    );
  }

  async startEntityRecording(
    entityId: string,
    sourceId: string,
    input: EntityRecordingStartInput,
  ): Promise<EntityRecording> {
    return this.request<EntityRecording>(
      `/api/v1/entities/${entityId}/data-sources/mqtt/${sourceId}/recordings`,
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async stopEntityRecording(entityId: string, recordingId: string): Promise<EntityRecording> {
    return this.request<EntityRecording>(
      `/api/v1/entities/${entityId}/recordings/${recordingId}/stop`,
      { method: "POST" },
      { requiresAuth: true },
    );
  }

  async listEntityRecordings(
    entityId: string,
    options: { sourceId?: string; signal?: AbortSignal } = {},
  ): Promise<EntityRecording[]> {
    return this.request<EntityRecording[]>(
      `/api/v1/entities/${entityId}/recordings${toQueryString({ sourceId: options.sourceId })}`,
      { signal: options.signal },
      { requiresAuth: true },
    );
  }

  async getEntityRecording(entityId: string, recordingId: string): Promise<EntityRecording> {
    return this.request<EntityRecording>(
      `/api/v1/entities/${entityId}/recordings/${recordingId}`,
      undefined,
      { requiresAuth: true },
    );
  }

  entityTelemetryCsvUrl(entityId: string, filter: TelemetryCsvFilter): string {
    // A plain same-origin link: the BFF adds the session and streams the file, so a
    // large download never sits in browser memory.
    return `${this.baseUrl}/api/v1/entities/${entityId}/telemetry.csv${toQueryString({
      start: filter.start,
      end: filter.end,
      recordingId: filter.recordingId,
      sessionId: filter.sessionId,
      sourceId: filter.sourceId,
    })}`;
  }

  async previewEntityPreprocessing(
    entityId: string,
    recipe: PreprocessingRecipe,
  ): Promise<PreprocessingPreviewResult> {
    const submitted = await this.request<PreprocessingPreviewResult | PreprocessingAnalysis>(
      `/api/v1/entities/${entityId}/preprocessing/preview`,
      { method: "POST", body: JSON.stringify(recipe) },
      { requiresAuth: true },
    );
    if (!("status" in submitted)) return submitted;
    let analysis = submitted;
    for (let attempt = 0; attempt < 240 && (analysis.status === "queued" || analysis.status === "running"); attempt += 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
      analysis = await this.request<PreprocessingAnalysis>(
        `/api/v1/entities/${entityId}/preprocessing/analyses/${analysis.id}`,
        undefined,
        { requiresAuth: true },
      );
    }
    if (analysis.status === "succeeded" && analysis.result) return analysis.result;
    throw new Error(analysis.errorMessage ?? "The full preprocessing analysis did not complete.");
  }

  async ingestEntityTelemetry(
    entityId: string,
    input: {
      schemaVersion: number;
      idempotencyKey?: string;
      records: EntityTelemetryInput[];
    },
  ): Promise<EntityIngestionSummary> {
    return this.request<EntityIngestionSummary>(
      `/api/v1/entities/${entityId}/telemetry`,
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async uploadEntityTelemetryCsv(
    entityId: string,
    csv: string,
    options: { schemaVersion: number; idempotencyKey?: string },
  ): Promise<EntityIngestionSummary> {
    return this.request<EntityIngestionSummary>(
      `/api/v1/entities/${entityId}/telemetry/csv${toQueryString({
        schemaVersion: String(options.schemaVersion),
        idempotencyKey: options.idempotencyKey,
      })}`,
      {
        method: "POST",
        headers: { "Content-Type": "text/csv; charset=utf-8" },
        body: csv,
      },
      { requiresAuth: true },
    );
  }

  async listEntityFailureLabels(entityId: string): Promise<FailureLabel[]> {
    return this.request<FailureLabel[]>(
      `/api/v1/entities/${entityId}/labels`,
      undefined,
      { requiresAuth: true },
    );
  }

  async createEntityFailureLabel(
    entityId: string,
    input: FailureLabelInput,
  ): Promise<FailureLabel> {
    return this.request<FailureLabel>(
      `/api/v1/entities/${entityId}/labels`,
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async deleteEntityFailureLabel(entityId: string, labelId: string): Promise<void> {
    await this.request<void>(
      `/api/v1/entities/${entityId}/labels/${labelId}`,
      { method: "DELETE" },
      { requiresAuth: true },
    );
  }

  async listEntityDatasetVersions(entityId: string): Promise<DatasetVersion[]> {
    return this.request<DatasetVersion[]>(
      `/api/v1/entities/${entityId}/datasets`,
      undefined,
      { requiresAuth: true },
    );
  }

  async createEntityDatasetVersion(
    entityId: string,
    input: DatasetVersionCreateInput,
  ): Promise<DatasetVersion> {
    return this.request<DatasetVersion>(
      `/api/v1/entities/${entityId}/datasets`,
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async createEntityPreparedDataset(
    entityId: string,
    input: { recipe: PreprocessingRecipe; recipeDigest: string; sourceBoundaryDigest: string },
  ): Promise<DatasetVersion> {
    return this.request<DatasetVersion>(
      `/api/v1/entities/${entityId}/datasets/prepared`,
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async listEntityTrainingArchitectures(entityId: string): Promise<TrainingArchitectureOption[]> {
    return this.request<TrainingArchitectureOption[]>(
      `/api/v1/entities/${entityId}/training/architectures`,
      undefined,
      { requiresAuth: true },
    );
  }

  async validateEntityTrainingConfiguration(
    entityId: string,
    input: TrainingConfiguration,
  ): Promise<TrainingConfigurationValidation> {
    return this.request<TrainingConfigurationValidation>(
      `/api/v1/entities/${entityId}/training/configuration/validate`,
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async listEntityTrainingRuns(entityId: string): Promise<TrainingRun[]> {
    return this.request<TrainingRun[]>(
      `/api/v1/entities/${entityId}/training/runs`,
      undefined,
      { requiresAuth: true },
    );
  }

  async createEntityTrainingRun(
    entityId: string,
    input: { datasetVersionId: string; architecture: TrainingArchitectureOption["id"]; hyperparameters?: Record<string, unknown> },
  ): Promise<TrainingRun> {
    return this.request<TrainingRun>(
      `/api/v1/entities/${entityId}/training/runs`,
      { method: "POST", body: JSON.stringify({ ...input, hyperparameters: input.hyperparameters ?? {} }) },
      { requiresAuth: true },
    );
  }

  async cancelEntityTrainingRun(entityId: string, runId: string): Promise<void> {
    return this.request<void>(
      `/api/v1/entities/${entityId}/training/runs/${runId}/cancel`,
      { method: "POST" },
      { requiresAuth: true },
    );
  }

  async importEntityOnnxModel(
    entityId: string,
    model: ArrayBuffer,
    input: { datasetVersionId: string },
  ): Promise<TrainingRun> {
    const query = new URLSearchParams({ datasetVersionId: input.datasetVersionId });
    return this.request<TrainingRun>(
      `/api/v1/entities/${entityId}/models/import?${query.toString()}`,
      { method: "POST", headers: { "Content-Type": "application/onnx" }, body: model },
      { requiresAuth: true },
    );
  }

  async promoteEntityTrainingRun(entityId: string, runId: string, overrideReason?: string): Promise<ModelPromotion> {
    const query = overrideReason ? `?overrideReason=${encodeURIComponent(overrideReason)}` : "";
    return this.request<ModelPromotion>(
      `/api/v1/entities/${entityId}/training/runs/${runId}/promote${query}`,
      { method: "POST" },
      { requiresAuth: true },
    );
  }

  async runEntityInference(
    entityId: string,
    capability: "simulate" | "predict",
    input: { sessionId?: string; limit?: number; values?: Record<string, unknown>; idempotencyKey?: string } = {},
  ): Promise<EntityInferenceResult> {
    return this.request<EntityInferenceResult>(
      `/api/v1/entities/${entityId}/inference/${capability}`,
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async listSimulatorEntityModels(): Promise<SimulatorEntityModel[]> {
    return this.request<SimulatorEntityModel[]>(
      "/api/v1/entities/simulator/models",
      undefined,
      { requiresAuth: true },
    );
  }

  async createEntityTrainingGroup(
    entityId: string,
    input: {
      idempotencyKey: string;
      runs: Array<{ datasetVersionId: string; architecture: TrainingArchitectureOption["id"]; hyperparameters?: Record<string, unknown> }>;
    },
  ): Promise<TrainingGroup> {
    return this.request<TrainingGroup>(
      `/api/v1/entities/${entityId}/training/groups`,
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async getEntityTrainingGroup(entityId: string, groupId: string): Promise<TrainingGroup> {
    return this.request<TrainingGroup>(
      `/api/v1/entities/${entityId}/training/groups/${groupId}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async retryEntityTrainingGroupChild(entityId: string, groupId: string, capability: EntityCapability): Promise<TrainingGroup> {
    return this.request<TrainingGroup>(
      `/api/v1/entities/${entityId}/training/groups/${groupId}/retry-failed`,
      { method: "POST", body: JSON.stringify({ capability }) },
      { requiresAuth: true },
    );
  }

  async listEntityModelDeployments(entityId: string): Promise<ModelDeployment[]> {
    return this.request<ModelDeployment[]>(
      `/api/v1/entities/${entityId}/model-deployments`,
      undefined,
      { requiresAuth: true },
    );
  }

  async reconcileModelDeployments(): Promise<{ checked: number; repaired: number; failed: number }> {
    return this.request(
      "/api/v1/entities/model-deployments/reconcile",
      { method: "POST" },
      { requiresAuth: true },
    );
  }

  async listEntityTelemetry(
    entityId: string,
    input: { sessionId?: string; limit?: number } = {},
  ): Promise<EntityTelemetryRecord[]> {
    return this.request<EntityTelemetryRecord[]>(
      `/api/v1/entities/${entityId}/telemetry${toQueryString({
        sessionId: input.sessionId,
        limit: input.limit === undefined ? undefined : String(input.limit),
      })}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async getMqttHealth(options?: { signal?: AbortSignal }): Promise<MqttHealth> {
    return this.request<MqttHealth>(
      "/api/v1/mqtt/health",
      { signal: options?.signal },
      { requiresAuth: true },
    );
  }

  async listMqttSubscriptions(options?: { signal?: AbortSignal }): Promise<MqttSubscription[]> {
    return this.request<MqttSubscription[]>(
      "/api/v1/mqtt/subscriptions",
      { signal: options?.signal },
      { requiresAuth: true },
    );
  }

  async createMqttSubscription(input: MqttSubscriptionInput): Promise<MqttSubscription> {
    return this.request<MqttSubscription>(
      "/api/v1/mqtt/subscriptions",
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async updateMqttSubscription(
    id: string,
    input: MqttSubscriptionInput,
  ): Promise<MqttSubscription> {
    return this.request<MqttSubscription>(
      `/api/v1/mqtt/subscriptions/${id}`,
      { method: "PUT", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async deleteMqttSubscription(id: string): Promise<void> {
    await this.request<void>(
      `/api/v1/mqtt/subscriptions/${id}`,
      { method: "DELETE" },
      { requiresAuth: true },
    );
  }

  async listSimulatorEntities(): Promise<SimulatorEntityOption[]> {
    return this.request<SimulatorEntityOption[]>(
      "/api/v1/simulator/entities",
      undefined,
      { requiresAuth: true },
    );
  }

  async runGenericSimulation(
    entityId: string,
    input: {
      sessionId?: string;
      timeRange?: { start: string; end: string };
      durationMinutes: 30 | 60 | 240;
      requestedOutputFeatures?: string[];
    },
  ): Promise<GenericSimulationResult> {
    return this.request<GenericSimulationResult>(
      `/api/v1/entities/${entityId}/simulations`,
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async listEntityModelAlerts(status: "open" | "resolved" | "all" = "open"): Promise<EntityModelAlert[]> {
    return this.request<EntityModelAlert[]>(
      `/api/v1/entities/alerts/models?status=${status}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async resolveEntityModelAlert(entityId: string, alertId: string): Promise<void> {
    return this.request<void>(
      `/api/v1/entities/${entityId}/model-alerts/${alertId}/resolve`,
      { method: "POST" },
      { requiresAuth: true },
    );
  }

  async listEntityDowntimeConfig(entityId: string): Promise<EntityDowntimeConfig[]> {
    return this.request<EntityDowntimeConfig[]>(
      `/api/v1/entities/${entityId}/downtime-config`,
      undefined,
      { requiresAuth: true },
    );
  }

  async upsertEntityDowntimeConfig(
    entityId: string,
    label: string,
    baseHours: number,
  ): Promise<EntityDowntimeConfig> {
    return this.request<EntityDowntimeConfig>(
      `/api/v1/entities/${entityId}/downtime-config/${encodeURIComponent(label)}`,
      { method: "PUT", body: JSON.stringify({ baseHours }) },
      { requiresAuth: true },
    );
  }

  async listUsers(): Promise<UserPersona[]> {
    return this.request<UserPersona[]>("/api/v1/users", undefined, {
      requiresAuth: true,
    });
  }

  async listMachines(query?: MachinesQuery): Promise<MachineSummary[]> {
    return this.listCanonicalMachines(query);
  }

  async listCanonicalMachines(query?: MachinesQuery): Promise<CanonicalMachine[]> {
    return this.request<CanonicalMachine[]>(
      `/api/v1/catalog/machines${toQueryString({
        search: query?.search,
        line: query?.line,
        status: query?.status,
        sort_by: query?.sortBy,
        sort_direction: query?.sortDirection,
        authorized_for_user_id: query?.authorizedForUserId,
      })}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async getCanonicalMachine(entityId: string): Promise<CanonicalMachine> {
    return this.request<CanonicalMachine>(
      `/api/v1/catalog/machines/${entityId}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async getUserMachineAccess(userId: string): Promise<string[]> {
    const response = await this.request<{ entityIds: string[] }>(
      `/api/v1/users/${userId}/entity-access`,
      undefined,
      { requiresAuth: true },
    );

    return response.entityIds;
  }

  async updateUserMachineAccess(
    userId: string,
    machineIds: string[],
  ): Promise<string[]> {
    const response = await this.request<{ entityIds: string[] }>(
      `/api/v1/users/${userId}/entity-access`,
      {
        method: "PUT",
        body: JSON.stringify({ entityIds: machineIds }),
      },
      { requiresAuth: true },
    );

    return response.entityIds;
  }

  async getMachineAuthorizedUsers(machineId: string): Promise<UserPersona[]> {
    return this.request<UserPersona[]>(
      `/api/v1/catalog/machines/${machineId}/users`,
      undefined,
      { requiresAuth: true },
    );
  }

  async updateUserRole(userId: string, role: UserRole, stepUpCode?: string): Promise<UserPersona> {
    return this.request<UserPersona>(
      `/api/v1/users/${userId}/role`,
      {
        method: "PATCH",
        body: JSON.stringify({ role, stepUpCode }),
      },
      { requiresAuth: true },
    );
  }

  async updateUserAccess(userId: string, input: { role: UserRole; machineIds: string[]; stepUpCode?: string }): Promise<UserAccessResult> {
    return this.request<UserAccessResult>(`/api/v1/users/${userId}/access`, {
      method: "PUT",
      body: JSON.stringify({ role: input.role, entityIds: input.machineIds, stepUpCode: input.stepUpCode }),
    }, { requiresAuth: true });
  }

  async createUserInvitation(input: UserInvitationInput): Promise<UserInvitationResult> {
    return this.request<UserInvitationResult>("/api/v1/users/invitations", {
      method: "POST",
      body: JSON.stringify(input),
    }, { requiresAuth: true });
  }

  async listUserInvitations(): Promise<UserInvitationSummary[]> {
    return this.request("/api/v1/users/invitations", undefined, { requiresAuth: true });
  }

  async revokeUserInvitation(invitationId: string): Promise<UserInvitationSummary> {
    return this.request(`/api/v1/users/invitations/${encodeURIComponent(invitationId)}/revoke`, { method: "POST" }, { requiresAuth: true });
  }

  async replaceUserInvitation(invitationId: string, stepUpCode?: string): Promise<UserInvitationResult> {
    return this.request(`/api/v1/users/invitations/${encodeURIComponent(invitationId)}/replace`, { method: "POST", body: JSON.stringify({ stepUpCode }) }, { requiresAuth: true });
  }

  async updateUserStatus(userId: string, status: NonNullable<UserPersona["status"]>): Promise<UserPersona> {
    return this.request<UserPersona>(`/api/v1/users/${userId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }, { requiresAuth: true });
  }

  async userHasMachineAccess(
    userId: string,
    machineId: string,
  ): Promise<boolean> {
    const [users, machineIds] = await Promise.all([
      this.listUsers(),
      this.getUserMachineAccess(userId),
    ]);
    const user = users.find((item) => item.id === userId);

    if (!user) {
      return false;
    }

    return user.role === "admin" || machineIds.includes(machineId);
  }

  async getMachineDetail(machineId: string): Promise<MachineDetail> {
    return this.getCanonicalMachine(machineId);
  }

  async getMachineTelemetry(
    machineId: string,
    options?: TelemetryRequestOptions,
  ): Promise<TelemetrySeries> {
    const canonical = await this.getCanonicalMachine(machineId);
    if (!canonical.legacyMachineId) return { points: [] };
    const response = await this.request<TelemetrySeries | TelemetryPoint[]>(
      `/api/v1/machines/${canonical.legacyMachineId}/telemetry${toQueryString({
        limit: options?.limit?.toString(),
      })}`,
      { signal: options?.signal },
      { requiresAuth: true },
    );
    return Array.isArray(response) ? { points: response } : response;
  }

  async getMachinePredictions(machineId: string): Promise<Prediction[]> {
    const canonical = await this.getCanonicalMachine(machineId);
    if (!canonical.legacyMachineId) return [];
    const predictions = await this.request<Prediction[]>(
      `/api/v1/machines/${machineId}/predictions`,
      undefined,
      { requiresAuth: true },
    );
    return predictions.map((prediction) => ({ ...prediction, machineId }));
  }

  async getModelReadiness(
    machineId: string,
    options?: ModelReadinessRequestOptions,
  ): Promise<ModelReadiness> {
    const canonical = await this.getCanonicalMachine(machineId);
    if (!canonical.legacyMachineId) {
      const readiness = canonical.readiness?.predict ?? canonical.readiness?.simulate;
      const ready = Boolean(readiness?.readyToTrain) && Boolean(
        canonical.productionModels?.predict ?? canonical.productionModels?.simulate,
      );
      return {
        machineId,
        profileId: null,
        state: ready ? "ready" : "prediction-unavailable",
        canInfer: ready,
        summary: ready ? "Registry model and current-schema data are ready." : "No eligible production model is available.",
        reason: ready ? "Canonical entity readiness passed." : "Review MLOps readiness and production promotion.",
        nextAction: ready ? "Run the production model." : "Prepare data, train, and explicitly promote a compatible model.",
        evaluatedAt: new Date().toISOString(),
        latestSampleAt: canonical.telemetry.latestTimestamp,
        sensors: [],
        checks: null,
      };
    }
    const readiness = await this.request<ModelReadiness>(
      `/api/v1/machines/${machineId}/model-readiness`,
      { signal: options?.signal },
      { requiresAuth: true },
    );
    return { ...readiness, machineId };
  }

  async getPredictionConfig(machineId: string): Promise<PredictionConfig> {
    const config = await this.request<PredictionConfig>(
      `/api/v1/machines/${machineId}/prediction-config`,
      undefined,
      { requiresAuth: true },
    );
    return { ...config, machineId };
  }

  async predictMachine(
    machineId: string,
    input: ManualPredictionInput,
  ): Promise<ManualPredictionResult> {
    const result = await this.request<ManualPredictionResult>(
      `/api/v1/machines/${machineId}/predict`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      { requiresAuth: true },
    );
    return { ...result, machineId };
  }

  async getSimulationConfig(machineId: string): Promise<SimulationConfig> {
    const config = await this.request<SimulationConfig>(
      `/api/v1/simulations/config/${machineId}`,
      undefined,
      { requiresAuth: true },
    );
    return { ...config, machineId };
  }

  async getSimulationSessionPreview(
    machineId: string,
    sessionId: number,
  ): Promise<SimulationSessionPreview> {
    return this.request<SimulationSessionPreview>(
      `/api/v1/simulations/config/${machineId}/sessions/${sessionId}/preview`,
      undefined,
      { requiresAuth: true },
    );
  }

  async getMaintenanceRecommendations(
    machineId: string,
  ): Promise<MaintenanceRecommendation[]> {
    const canonical = await this.getCanonicalMachine(machineId);
    if (!canonical.legacyMachineId) return [];
    const recommendations = await this.request<MaintenanceRecommendation[]>(
      `/api/v1/machines/${machineId}/recommendations`,
      undefined,
      { requiresAuth: true },
    );
    return recommendations.map((recommendation) => ({ ...recommendation, machineId }));
  }

  async listHistoryEvents(query?: HistoryQuery): Promise<HistoryEvent[]> {
    return this.request<HistoryEvent[]>(
      `/api/v1/history${toQueryString({
        user_id: query?.userId,
        entity_id: query?.machineId,
        entity_ids: query?.machineIds?.join(","),
        type: query?.type,
        date_from: query?.dateFrom,
        date_to: query?.dateTo,
      })}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async listThreads(userId: string): Promise<ChatThread[]> {
    return this.request<ChatThread[]>(
      `/api/v1/chat/threads${toQueryString({ user_id: userId })}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async createThread(input: {
    userId: string;
    title?: string;
  }): Promise<ChatThread> {
    return this.request<ChatThread>(
      "/api/v1/chat/threads",
      {
        method: "POST",
        body: JSON.stringify({
          user_id: input.userId,
          title: input.title,
        }),
      },
      { requiresAuth: true },
    );
  }

  async getThread(
    threadId: string,
  ): Promise<{ thread: ChatThread; messages: ChatMessage[] }> {
    return this.request<{ thread: ChatThread; messages: ChatMessage[] }>(
      `/api/v1/chat/threads/${threadId}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async renameThread(threadId: string, title: string): Promise<ChatThread> {
    return this.request<ChatThread>(
      `/api/v1/chat/threads/${threadId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ title }),
      },
      { requiresAuth: true },
    );
  }

  async deleteThread(threadId: string): Promise<void> {
    return this.request<void>(
      `/api/v1/chat/threads/${threadId}`,
      {
        method: "DELETE",
      },
      { requiresAuth: true },
    );
  }

  async sendMessage(
    input: SendMessageInput,
  ): Promise<{ thread: ChatThread; messages: ChatMessage[] }> {
    return this.request<{ thread: ChatThread; messages: ChatMessage[] }>(
      "/api/v1/chat/messages",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      { requiresAuth: true },
    );
  }

  /**
   * The streaming twin of `sendMessage`.
   *
   * Uses `fetch` rather than `EventSource`, for two reasons: this is a POST
   * with a JSON body, and it needs an `Authorization` header — `EventSource`
   * can do neither.
   *
   * The turn is persisted server-side whether or not the client is still
   * listening, so an aborted read loses the live view, not the answer.
   */
  async sendMessageStreamed(
    input: SendMessageInput,
    onEvent: (event: ChatStreamEvent) => void,
  ): Promise<{ thread: ChatThread; messages: ChatMessage[] }> {
    const headers = new Headers({ "Content-Type": "application/json" });
    const authToken = await this.resolveSessionToken();
    if (authToken) headers.set("Authorization", `Bearer ${authToken}`);

    const response = await fetch(`${this.baseUrl}/api/v1/chat/messages/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      cache: "no-store",
    });

    // Auth and provider validation happen before the stream starts, so a
    // rejection is a real status code and is raised like any other request.
    if (!response.ok) {
      const text = await response.text();
      let detail: unknown;
      try {
        detail = (JSON.parse(text) as { detail?: unknown }).detail;
      } catch {
        detail = undefined;
      }
      throw new ApiError({
        status: response.status,
        path: "/api/v1/chat/messages/stream",
        detail,
        rawBody: text,
      });
    }

    if (!response.body) {
      throw new ApiError({ status: response.status, detail: "The chat response could not be read." });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done: { thread: ChatThread; messages: ChatMessage[] } | null = null;
    let failure: string | null = null;

    const consume = (chunk: string) => {
      // SSE frames are separated by a blank line, and a chunk boundary can fall
      // anywhere — including mid-frame — so the tail stays in the buffer until
      // its terminator arrives.
      buffer += chunk;
      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf("\n\n");

        const payload = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");
        if (!payload) continue;

        let event: ChatStreamEvent;
        try {
          event = JSON.parse(payload) as ChatStreamEvent;
        } catch {
          continue;
        }

        if (event.type === "done") {
          done = { thread: event.thread, messages: event.messages };
        } else if (event.type === "error") {
          failure = event.detail;
        }
        onEvent(event);
      }
    };

    try {
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        consume(decoder.decode(value, { stream: true }));
      }
      consume(decoder.decode());
    } finally {
      reader.releaseLock();
    }

    if (failure) {
      throw new ApiError({ status: response.status, detail: failure });
    }
    if (!done) {
      throw new ApiError({
        status: response.status,
        detail: "The chat response ended before the answer was saved.",
      });
    }
    return done;
  }

  async listSimulationRuns(userId?: string): Promise<SimulationRun[]> {
    return this.request<SimulationRun[]>(
      `/api/v1/simulations${toQueryString({ user_id: userId })}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async runSimulation(
    input: SimulationScenarioInput,
    userId: string,
  ): Promise<SimulationRun> {
    return this.request<SimulationRun>(
      "/api/v1/simulations/run",
      {
        method: "POST",
        body: JSON.stringify({
          ...input,
          userId,
        }),
      },
      { requiresAuth: true },
    );
  }

  // -------------------------------------------------------------------------
  // Knowledge vault
  //
  // Note paths travel as a `path` query parameter, not a path segment: vault
  // paths contain slashes, and a greedy path segment would swallow the
  // /history and /restore suffixes along with the note name.
  // -------------------------------------------------------------------------

  async listKnowledgeNotes(namespace?: string): Promise<KnowledgeNoteSummary[]> {
    return this.request<KnowledgeNoteSummary[]>(
      `/api/v1/knowledge/notes${toQueryString({ namespace })}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async getKnowledgeNote(path: string): Promise<KnowledgeNoteDetail> {
    return this.request<KnowledgeNoteDetail>(
      `/api/v1/knowledge/note${toQueryString({ path })}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async saveKnowledgeNote(
    path: string,
    input: { content: string; expectedMtime?: number | null; reason?: string },
  ): Promise<KnowledgeNoteDetail> {
    return this.request<KnowledgeNoteDetail>(
      `/api/v1/knowledge/note${toQueryString({ path })}`,
      {
        method: "PUT",
        body: JSON.stringify({
          content: input.content,
          expectedMtime: input.expectedMtime ?? null,
          reason: input.reason,
        }),
      },
      { requiresAuth: true },
    );
  }

  async createKnowledgeNote(input: {
    namespace: string;
    title: string;
    content?: string;
    reason?: string;
  }): Promise<KnowledgeNoteDetail> {
    return this.request<KnowledgeNoteDetail>(
      "/api/v1/knowledge/notes",
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async deleteKnowledgeNote(path: string, reason?: string): Promise<void> {
    await this.request<unknown>(
      `/api/v1/knowledge/note${toQueryString({ path, reason })}`,
      { method: "DELETE" },
      { requiresAuth: true },
    );
  }

  async listKnowledgeNoteHistory(path: string): Promise<KnowledgeHistoryEntry[]> {
    return this.request<KnowledgeHistoryEntry[]>(
      `/api/v1/knowledge/note/history${toQueryString({ path })}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async restoreKnowledgeNote(path: string, stamp: string): Promise<KnowledgeNoteDetail> {
    return this.request<KnowledgeNoteDetail>(
      `/api/v1/knowledge/note/restore${toQueryString({ path })}`,
      { method: "POST", body: JSON.stringify({ stamp }) },
      { requiresAuth: true },
    );
  }

  async getKnowledgeGraph(query?: KnowledgeGraphQuery): Promise<KnowledgeGraph> {
    return this.request<KnowledgeGraph>(
      `/api/v1/knowledge/graph${toQueryString({
        namespace: query?.namespace,
        around: query?.around,
        depth: query?.depth,
        include_tags: query?.includeTags,
        include_wanted: query?.includeWanted,
        limit: query?.limit,
      })}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async searchKnowledge(
    query: string,
    options?: { namespace?: string; limit?: number },
  ): Promise<KnowledgeSearchHit[]> {
    return this.request<KnowledgeSearchHit[]>(
      `/api/v1/knowledge/search${toQueryString({
        q: query,
        namespace: options?.namespace,
        limit: options?.limit,
      })}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async getKnowledgeLint(): Promise<KnowledgeLintReport> {
    return this.request<KnowledgeLintReport>("/api/v1/knowledge/lint", undefined, {
      requiresAuth: true,
    });
  }

  async getKnowledgeLog(limit?: number): Promise<string[]> {
    const result = await this.request<{ entries: string[] }>(
      `/api/v1/knowledge/log${toQueryString({ limit })}`,
      undefined,
      { requiresAuth: true },
    );
    return result.entries;
  }

  async listKnowledgeSources(): Promise<KnowledgeRawSource[]> {
    return this.request<KnowledgeRawSource[]>("/api/v1/knowledge/sources", undefined, {
      requiresAuth: true,
    });
  }

  async uploadKnowledgeSource(file: File): Promise<KnowledgeRawSource> {
    const body = new FormData();
    body.append("file", file);
    // No Content-Type header: the browser has to set the multipart boundary.
    return this.request<KnowledgeRawSource>(
      "/api/v1/knowledge/sources",
      { method: "POST", body },
      { requiresAuth: true },
    );
  }

  async getKnowledgeConfig(): Promise<KnowledgeConfig> {
    return this.request<KnowledgeConfig>("/api/v1/knowledge/config", undefined, {
      requiresAuth: true,
    });
  }

  async updateKnowledgeConfig(input: Partial<KnowledgeConfig>): Promise<KnowledgeConfig> {
    return this.request<KnowledgeConfig>(
      "/api/v1/knowledge/config",
      { method: "PUT", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }

  async resetKnowledgeVault(): Promise<{
    restored: number;
    trashed: string[];
    trashPath: string;
  }> {
    return this.request("/api/v1/knowledge/reset", { method: "POST" }, { requiresAuth: true });
  }

  async startKnowledgeIngest(path: string): Promise<KnowledgeIngestJob> {
    return this.request<KnowledgeIngestJob>(
      "/api/v1/knowledge/ingest",
      { method: "POST", body: JSON.stringify({ path }) },
      { requiresAuth: true },
    );
  }

  async getKnowledgeIngestJob(jobId: string): Promise<KnowledgeIngestJob> {
    return this.request<KnowledgeIngestJob>(
      `/api/v1/knowledge/ingest/${encodeURIComponent(jobId)}`,
      undefined,
      { requiresAuth: true },
    );
  }

  async captureToKnowledge(input: KnowledgeCaptureInput): Promise<KnowledgeNoteDetail> {
    return this.request<KnowledgeNoteDetail>(
      "/api/v1/knowledge/capture",
      { method: "POST", body: JSON.stringify(input) },
      { requiresAuth: true },
    );
  }
}
