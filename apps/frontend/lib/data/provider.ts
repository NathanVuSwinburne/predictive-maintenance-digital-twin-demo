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
  PreprocessingRecipe,
  Session,
  ChatStreamEvent,
  SendMessageInput,
  SimulationConfig,
  SimulationSessionPreview,
  SimulationRun,
  SimulationScenarioInput,
  TelemetryCsvFilter,
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
} from "@/lib/domain/types"

export type TelemetryRequestOptions = {
  limit?: number
  signal?: AbortSignal
}

export type ModelReadinessRequestOptions = {
  signal?: AbortSignal
}

export type RequestOptions = {
  signal?: AbortSignal
}

export interface DigitalTwinDataProvider {
  login(input: LoginInput): Promise<LoginResult>
  verifyMfa(input: VerifyMfaInput): Promise<Session>
  logout(token?: string): Promise<void>
  getSession(token?: string): Promise<Session | null>
  getCurrentUser(token?: string): Promise<UserPersona | null>
  getSetupStatus(): Promise<SetupStatus>
  getActivationDetails(token: string): Promise<ActivationDetails>
  activateInvitation(input: { token: string; password: string; totpCode?: string }): Promise<ActivationResult>
  getTotpStatus(): Promise<TotpStatus>
  getMqttHealth(options?: RequestOptions): Promise<MqttHealth>
  listMqttSubscriptions(options?: RequestOptions): Promise<MqttSubscription[]>
  createMqttSubscription(input: MqttSubscriptionInput): Promise<MqttSubscription>
  updateMqttSubscription(id: string, input: MqttSubscriptionInput): Promise<MqttSubscription>
  deleteMqttSubscription(id: string): Promise<void>
  setupTotp(input: { password: string }): Promise<TotpSetupResult>
  confirmTotp(input: { setupToken: string; code: string }): Promise<TotpBackupCodesResult>
  disableTotp(input: { password: string }): Promise<TotpStatus>
  regenerateTotpBackupCodes(input: { password: string }): Promise<TotpBackupCodesResult>
  getLlmConfiguration(): Promise<LlmConfiguration>
  updateLlmConfiguration(input: UpdateLlmConfigurationInput): Promise<LlmConfiguration>

  listEntities(): Promise<EntitySummary[]>
  createEntity(input: EntityCreateInput): Promise<EntityDetail>
  deleteEntity(entityId: string): Promise<void>
  uploadEntityImage(entityId: string, image: File): Promise<EntityDetail>
  getEntity(entityId: string): Promise<EntityDetail>
  appendEntityFeatures(entityId: string, features: EntityFeatureInput[]): Promise<EntityDetail>
  getEntityCollection(entityId: string): Promise<EntityCollectionSummary>
  listEntityTelemetry(
    entityId: string,
    input?: { sessionId?: string; limit?: number }
  ): Promise<EntityTelemetryRecord[]>
  inspectEntityTelemetryCsv(entityId: string, fileName: string, csv: string): Promise<CsvInspectionResult>
  createEntityCsvDataSource(
    entityId: string,
    csv: string,
    input: {
      sourceName: string
      fileName: string
      capabilities: EntityCapability[]
      timestampColumn?: string
      sessionColumn?: string
      labelColumn?: string
      featureColumns: string[]
      categoricalColumns?: string[]
      positiveClass?: string
      idempotencyKey?: string
    }
  ): Promise<EntityIngestionSummary>
  getEntityDataPreview(entityId: string, limit?: number): Promise<EntityDataPreview>
  /** Backend-owned MQTT freshness, latest observations, received label, and automatic inference. */
  getEntityLiveStatus(entityId: string, options?: TelemetryRequestOptions): Promise<EntityLiveStatus>
  /** Feed state and latest live prediction for every visible machine (dashboard). */
  getFleetLiveHealth(options?: RequestOptions): Promise<FleetLiveHealth>
  /** Learned (machine-specific) and engineering vibration thresholds for the Live Monitor. */
  getEntityVibrationThresholds(entityId: string): Promise<EntityVibrationThresholds>
  /** Server-side CMTK listener configuration, connected machines, and compatible candidates. */
  getCmtkSetup(): Promise<CmtkSetup>
  /** Connects (or re-describes) a machine to the server-managed CMTK source; idempotent per machine. */
  connectCmtkMachine(input: CmtkConnectInput): Promise<CmtkConnectResult>
  /** Listens on the broker for a few seconds and reports topics, a sample message, and the detected payload format. */
  probeCmtkBroker(input: CmtkProbeInput): Promise<CmtkProbeResult>
  createEntityMqttDataSource(entityId: string, input: MqttSourceInput): Promise<EntityDataSource>
  deleteEntityMqttDataSource(entityId: string, sourceId: string): Promise<void>
  testEntityMqttDataSource(entityId: string, sourceId: string): Promise<MqttConnectionTestResult>
  /** Starts an operator recording on an MQTT source (one active recording per source). */
  startEntityRecording(entityId: string, sourceId: string, input: EntityRecordingStartInput): Promise<EntityRecording>
  /** Stops a recording; stopping a stopped recording returns it unchanged. */
  stopEntityRecording(entityId: string, recordingId: string): Promise<EntityRecording>
  listEntityRecordings(entityId: string, options?: { sourceId?: string; signal?: AbortSignal }): Promise<EntityRecording[]>
  getEntityRecording(entityId: string, recordingId: string): Promise<EntityRecording>
  /** Same-origin URL of the streamed telemetry CSV, for a plain download link. */
  entityTelemetryCsvUrl(entityId: string, filter: TelemetryCsvFilter): string
  previewEntityPreprocessing(entityId: string, recipe: PreprocessingRecipe): Promise<PreprocessingPreviewResult>
  ingestEntityTelemetry(
    entityId: string,
    input: { schemaVersion: number; idempotencyKey?: string; records: EntityTelemetryInput[] }
  ): Promise<EntityIngestionSummary>
  uploadEntityTelemetryCsv(
    entityId: string,
    csv: string,
    options: { schemaVersion: number; idempotencyKey?: string }
  ): Promise<EntityIngestionSummary>
  listEntityFailureLabels(entityId: string): Promise<FailureLabel[]>
  createEntityFailureLabel(entityId: string, input: FailureLabelInput): Promise<FailureLabel>
  deleteEntityFailureLabel(entityId: string, labelId: string): Promise<void>
  listEntityDatasetVersions(entityId: string): Promise<DatasetVersion[]>
  createEntityDatasetVersion(
    entityId: string,
    input: DatasetVersionCreateInput
  ): Promise<DatasetVersion>
  createEntityPreparedDataset(
    entityId: string,
    input: { recipe: PreprocessingRecipe; recipeDigest: string; sourceBoundaryDigest: string }
  ): Promise<DatasetVersion>
  listEntityTrainingArchitectures(entityId: string): Promise<TrainingArchitectureOption[]>
  validateEntityTrainingConfiguration(entityId: string, input: TrainingConfiguration): Promise<TrainingConfigurationValidation>
  listEntityTrainingRuns(entityId: string): Promise<TrainingRun[]>
  createEntityTrainingRun(
    entityId: string,
    input: { datasetVersionId: string; architecture: TrainingArchitectureOption["id"]; hyperparameters?: Record<string, unknown> }
  ): Promise<TrainingRun>
  createEntityTrainingGroup(
    entityId: string,
    input: {
      idempotencyKey: string
      runs: Array<{ datasetVersionId: string; architecture: TrainingArchitectureOption["id"]; hyperparameters?: Record<string, unknown> }>
    },
  ): Promise<TrainingGroup>
  getEntityTrainingGroup(entityId: string, groupId: string): Promise<TrainingGroup>
  retryEntityTrainingGroupChild(entityId: string, groupId: string, capability: EntityCapability): Promise<TrainingGroup>
  cancelEntityTrainingRun(entityId: string, runId: string): Promise<void>
  importEntityOnnxModel(
    entityId: string,
    model: ArrayBuffer,
    input: { datasetVersionId: string }
  ): Promise<TrainingRun>
  promoteEntityTrainingRun(entityId: string, runId: string, overrideReason?: string): Promise<ModelPromotion>
  listEntityModelDeployments(entityId: string): Promise<ModelDeployment[]>
  reconcileModelDeployments(): Promise<{ checked: number; repaired: number; failed: number }>
  runEntityInference(
    entityId: string,
    capability: "simulate" | "predict",
    input?: { sessionId?: string; limit?: number; values?: Record<string, unknown>; idempotencyKey?: string }
  ): Promise<EntityInferenceResult>
  listSimulatorEntityModels(): Promise<SimulatorEntityModel[]>
  listSimulatorEntities(): Promise<SimulatorEntityOption[]>
  runGenericSimulation(
    entityId: string,
    input: {
      sessionId?: string
      timeRange?: { start: string; end: string }
      durationMinutes: 30 | 60 | 240
      requestedOutputFeatures?: string[]
    }
  ): Promise<GenericSimulationResult>
  listEntityModelAlerts(status?: "open" | "resolved" | "all"): Promise<EntityModelAlert[]>
  resolveEntityModelAlert(entityId: string, alertId: string): Promise<void>
  listEntityDowntimeConfig(entityId: string): Promise<EntityDowntimeConfig[]>
  upsertEntityDowntimeConfig(
    entityId: string,
    label: string,
    baseHours: number
  ): Promise<EntityDowntimeConfig>

  getMqttHealth(options?: { signal?: AbortSignal }): Promise<MqttHealth>
  listMqttSubscriptions(options?: { signal?: AbortSignal }): Promise<MqttSubscription[]>
  createMqttSubscription(input: MqttSubscriptionInput): Promise<MqttSubscription>
  updateMqttSubscription(id: string, input: MqttSubscriptionInput): Promise<MqttSubscription>
  deleteMqttSubscription(id: string): Promise<void>

  listUsers(): Promise<UserPersona[]>
  listMachines(query?: MachinesQuery): Promise<MachineSummary[]>
  listCanonicalMachines(query?: MachinesQuery): Promise<CanonicalMachine[]>
  getCanonicalMachine(entityId: string): Promise<CanonicalMachine>
  getUserMachineAccess(userId: string): Promise<string[]>
  updateUserMachineAccess(userId: string, machineIds: string[]): Promise<string[]>
  getMachineAuthorizedUsers(machineId: string): Promise<UserPersona[]>
  updateUserRole(userId: string, role: UserRole, stepUpCode?: string): Promise<UserPersona>
  updateUserAccess(userId: string, input: { role: UserRole; machineIds: string[]; stepUpCode?: string }): Promise<UserAccessResult>
  createUserInvitation(input: UserInvitationInput): Promise<UserInvitationResult>
  listUserInvitations(): Promise<UserInvitationSummary[]>
  revokeUserInvitation(invitationId: string): Promise<UserInvitationSummary>
  replaceUserInvitation(invitationId: string, stepUpCode?: string): Promise<UserInvitationResult>
  updateUserStatus(userId: string, status: NonNullable<UserPersona["status"]>): Promise<UserPersona>
  userHasMachineAccess(userId: string, machineId: string): Promise<boolean>
  getMachineDetail(machineId: string): Promise<MachineDetail>
  getMachineTelemetry(
    machineId: string,
    options?: TelemetryRequestOptions
  ): Promise<TelemetrySeries>
  getMachinePredictions(machineId: string): Promise<Prediction[]>
  getModelReadiness(
    machineId: string,
    options?: ModelReadinessRequestOptions
  ): Promise<ModelReadiness>
  getPredictionConfig(machineId: string): Promise<PredictionConfig>
  predictMachine(machineId: string, input: ManualPredictionInput): Promise<ManualPredictionResult>
  getSimulationConfig(machineId: string): Promise<SimulationConfig>
  getSimulationSessionPreview(machineId: string, sessionId: number): Promise<SimulationSessionPreview>
  getMaintenanceRecommendations(
    machineId: string
  ): Promise<MaintenanceRecommendation[]>

  listHistoryEvents(query?: HistoryQuery): Promise<HistoryEvent[]>

  listThreads(userId: string): Promise<ChatThread[]>
  createThread(input: { userId: string; title?: string }): Promise<ChatThread>
  getThread(threadId: string): Promise<{ thread: ChatThread; messages: ChatMessage[] }>
  renameThread(threadId: string, title: string): Promise<ChatThread>
  deleteThread(threadId: string): Promise<void>
  sendMessage(input: SendMessageInput): Promise<{ thread: ChatThread; messages: ChatMessage[] }>
  /**
   * The same turn, delivered as it happens.
   *
   * `onEvent` receives progress while the agent works: which tool it reached
   * for, and the answer as it is written. It never receives the model's
   * reasoning — the server forwards an allowlist of two event kinds, so there
   * is no client-side filtering to get wrong.
   *
   * Resolves with the same payload `sendMessage` returns, so a caller that
   * ignores `onEvent` behaves exactly like the buffered call.
   */
  sendMessageStreamed(
    input: SendMessageInput,
    onEvent: (event: ChatStreamEvent) => void,
  ): Promise<{ thread: ChatThread; messages: ChatMessage[] }>

  listSimulationRuns(userId?: string): Promise<SimulationRun[]>
  runSimulation(input: SimulationScenarioInput, userId: string): Promise<SimulationRun>

  listKnowledgeNotes(namespace?: string): Promise<KnowledgeNoteSummary[]>
  getKnowledgeNote(path: string): Promise<KnowledgeNoteDetail>
  saveKnowledgeNote(
    path: string,
    input: { content: string; expectedMtime?: number | null; reason?: string }
  ): Promise<KnowledgeNoteDetail>
  createKnowledgeNote(input: {
    namespace: string
    title: string
    content?: string
    reason?: string
  }): Promise<KnowledgeNoteDetail>
  deleteKnowledgeNote(path: string, reason?: string): Promise<void>
  listKnowledgeNoteHistory(path: string): Promise<KnowledgeHistoryEntry[]>
  restoreKnowledgeNote(path: string, stamp: string): Promise<KnowledgeNoteDetail>
  getKnowledgeGraph(query?: KnowledgeGraphQuery): Promise<KnowledgeGraph>
  searchKnowledge(query: string, options?: { namespace?: string; limit?: number }): Promise<KnowledgeSearchHit[]>
  getKnowledgeLint(): Promise<KnowledgeLintReport>
  getKnowledgeLog(limit?: number): Promise<string[]>
  listKnowledgeSources(): Promise<KnowledgeRawSource[]>
  uploadKnowledgeSource(file: File): Promise<KnowledgeRawSource>
  getKnowledgeConfig(): Promise<KnowledgeConfig>
  updateKnowledgeConfig(input: Partial<KnowledgeConfig>): Promise<KnowledgeConfig>
  resetKnowledgeVault(): Promise<{ restored: number; trashed: string[]; trashPath: string }>
  startKnowledgeIngest(path: string): Promise<KnowledgeIngestJob>
  getKnowledgeIngestJob(jobId: string): Promise<KnowledgeIngestJob>
  captureToKnowledge(input: KnowledgeCaptureInput): Promise<KnowledgeNoteDetail>
}
