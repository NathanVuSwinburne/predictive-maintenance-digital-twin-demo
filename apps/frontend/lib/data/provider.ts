import type {
  ChatMessage,
  ChatThread,
  HistoryEvent,
  HistoryQuery,
  LoginInput,
  LoginResult,
  MachineDetail,
  MachineSummary,
  MachinesQuery,
  ManualPredictionInput,
  ManualPredictionResult,
  MaintenanceRecommendation,
  Prediction,
  PredictionConfig,
  Session,
  SendMessageInput,
  SimulationConfig,
  SimulationSessionPreview,
  SimulationRun,
  SimulationScenarioInput,
  TelemetryPoint,
  TotpBackupCodesResult,
  TotpSetupResult,
  TotpStatus,
  UserPersona,
  UserRole,
  VerifyMfaInput,
} from "@/lib/domain/types"

export interface DigitalTwinDataProvider {
  login(input: LoginInput): Promise<LoginResult>
  verifyMfa(input: VerifyMfaInput): Promise<Session>
  logout(token: string): Promise<void>
  getSession(token: string): Promise<Session | null>
  getCurrentUser(token: string): Promise<UserPersona | null>
  getTotpStatus(): Promise<TotpStatus>
  setupTotp(input: { password: string }): Promise<TotpSetupResult>
  confirmTotp(input: { setupToken: string; code: string }): Promise<TotpBackupCodesResult>
  disableTotp(input: { password: string }): Promise<TotpStatus>
  regenerateTotpBackupCodes(input: { password: string }): Promise<TotpBackupCodesResult>

  listUsers(): Promise<UserPersona[]>
  listMachines(query?: MachinesQuery): Promise<MachineSummary[]>
  getUserMachineAccess(userId: string): Promise<string[]>
  updateUserMachineAccess(userId: string, machineIds: string[]): Promise<string[]>
  getMachineAuthorizedUsers(machineId: string): Promise<UserPersona[]>
  updateUserRole(userId: string, role: UserRole): Promise<UserPersona>
  userHasMachineAccess(userId: string, machineId: string): Promise<boolean>
  getMachineDetail(machineId: string): Promise<MachineDetail>
  getMachineTelemetry(machineId: string): Promise<TelemetryPoint[]>
  getMachinePredictions(machineId: string): Promise<Prediction[]>
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

  listSimulationRuns(userId?: string): Promise<SimulationRun[]>
  runSimulation(input: SimulationScenarioInput, userId: string): Promise<SimulationRun>
}
