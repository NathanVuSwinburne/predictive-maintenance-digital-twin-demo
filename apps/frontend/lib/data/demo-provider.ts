import type { DigitalTwinDataProvider } from "@/lib/data/provider";
import type {
  ChatMessage, ChatThread, HistoryEvent, HistoryQuery, LoginInput, LoginResult,
  MachineDetail, MachineSummary, MachinesQuery, ManualPredictionInput,
  ManualPredictionResult, MaintenanceRecommendation, Prediction, PredictionConfig,
  Session, SendMessageInput, SimulationConfig,
  SimulationRun, SimulationScenarioInput, SimulationSessionPreview, TelemetryPoint,
  TotpBackupCodesResult, TotpSetupResult, TotpStatus, UserPersona, UserRole,
  VerifyMfaInput,
} from "@/lib/domain/types";
import { getSimulationSchemaForMachineType } from "@/lib/simulation/schemas";
import { generateTelemetry } from "@/lib/demo-engineering/signals";
import { createPredictionConfig, scorePrediction } from "@/lib/demo-engineering/prediction";
import { createSessionPreview, createSimulationConfig, createSimulationRun } from "@/lib/demo-engineering/sessions";
import { createDemoHistory } from "@/lib/demo-engineering/history";
import { composeDemoAssistantResponse } from "@/lib/demo-engineering/chat";

const NOW = "2026-06-28T08:00:00.000Z";
const DEMO_TOKEN = "portfolio-demo-session";

const users: UserPersona[] = [
  { id: "demo-admin", name: "Portfolio Visitor", email: "demo@portfolio.local", role: "admin", shift: "Day", plant: "Demo Works" },
  { id: "demo-engineer", name: "Alex Rivera", email: "alex@example.test", role: "user", shift: "Swing", plant: "Demo Works" },
  { id: "demo-technician", name: "Morgan Lee", email: "morgan@example.test", role: "user", shift: "Night", plant: "Demo Works" },
];

const fleetSeed = [
  ["machine-a-01", "Hydraulic Press 01", "Assembly 1", "AI4I Press", "ai4i", "healthy", 94, 12, 99.4],
  ["machine-a-02", "Hydraulic Press 02", "Assembly 1", "AI4I Press", "ai4i", "watch", 79, 38, 97.8],
  ["machine-a-03", "CNC Spindle 03", "Machining 2", "AI4I Spindle", "ai4i", "healthy", 91, 17, 99.1],
  ["machine-a-04", "CNC Spindle 04", "Machining 2", "AI4I Spindle", "ai4i", "risk", 58, 81, 91.6],
  ["machine-b-01", "Process Pump 01", "Utilities 1", "Five-sensor Pump", "sensor", "healthy", 88, 22, 98.5],
  ["machine-b-02", "Process Pump 02", "Utilities 1", "Five-sensor Pump", "sensor", "watch", 73, 49, 95.2],
  ["machine-b-03", "Cooling Fan 03", "Utilities 2", "Five-sensor Fan", "sensor", "offline", 35, 68, 87.4],
  ["machine-c-01", "Packaging Drive 01", "Packaging 1", "3-axis Drive", "real-sensor", "risk", 61, 84, 90.8],
  ["machine-c-02", "Packaging Drive 02", "Packaging 1", "3-axis Drive", "real-sensor", "watch", 76, 45, 96.1],
  ["machine-c-03", "Conveyor Motor 03", "Dispatch 1", "3-axis Motor", "real-sensor", "healthy", 92, 15, 99.0],
] as const;

const machines: MachineSummary[] = fleetSeed.map(([id, name, line, model, machineType, status, healthScore, riskScore, uptimePercent]) => ({
  id, name, line, model, machineType, status, healthScore, riskScore,
  lastServiceDate: "2026-05-16T00:00:00.000Z",
  nextServiceDate: "2026-07-15T00:00:00.000Z",
  uptimePercent,
  simulationSchema: getSimulationSchemaForMachineType(machineType),
}));

const machineById = (id: string) => {
  const machine = machines.find((item) => item.id === id);
  if (!machine) throw new Error(`Unknown demo machine: ${id}`);
  return machine;
};

export class DemoDigitalTwinProvider implements DigitalTwinDataProvider {
  private sessions = new Map<string, Session>();
  private access = new Map<string, string[]>([["demo-engineer", machines.slice(0, 7).map((m) => m.id)], ["demo-technician", machines.slice(7).map((m) => m.id)]]);
  private threads = new Map<string, ChatThread>();
  private messages = new Map<string, ChatMessage[]>();
  private runs: SimulationRun[] = [];
  private counter = 0;

  async login(input: LoginInput): Promise<LoginResult> {
    void input;
    const session: Session = { token: DEMO_TOKEN, userId: "demo-admin", activePersonaId: "demo-admin", authenticatedAt: NOW };
    this.sessions.set(DEMO_TOKEN, session);
    return { requiresMfa: false, session, mfaToken: null, availableMethods: [] };
  }
  async verifyMfa(input: VerifyMfaInput): Promise<Session> { void input; throw new Error("MFA is disabled in portfolio demo mode"); }
  async logout(token: string) { this.sessions.delete(token); }
  async getSession(token: string) { return this.sessions.get(token) ?? (token === DEMO_TOKEN ? { token: DEMO_TOKEN, userId: "demo-admin", activePersonaId: "demo-admin", authenticatedAt: NOW } : null); }
  async getCurrentUser(token: string) { return (await this.getSession(token)) ? users[0] : null; }
  async getTotpStatus(): Promise<TotpStatus> { return { enabled: false, backupCodeCount: 0, unusedBackupCodeCount: 0 }; }
  async setupTotp(input: { password: string }): Promise<TotpSetupResult> { void input; throw new Error("Security settings are read-only in demo mode"); }
  async confirmTotp(input: { setupToken: string; code: string }): Promise<TotpBackupCodesResult> { void input; throw new Error("Security settings are read-only in demo mode"); }
  async disableTotp(input: { password: string }): Promise<TotpStatus> { void input; return this.getTotpStatus(); }
  async regenerateTotpBackupCodes(input: { password: string }): Promise<TotpBackupCodesResult> { void input; throw new Error("Security settings are read-only in demo mode"); }

  async listUsers() { return structuredClone(users); }
  async listMachines(query: MachinesQuery = {}) {
    let result = [...machines];
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
  async getUserMachineAccess(userId: string) { return userId === "demo-admin" ? machines.map((m) => m.id) : [...(this.access.get(userId) ?? [])]; }
  async updateUserMachineAccess(userId: string, machineIds: string[]) { this.access.set(userId, [...machineIds]); return [...machineIds]; }
  async getMachineAuthorizedUsers(machineId: string) { return users.filter((user) => user.role === "admin" || (this.access.get(user.id) ?? []).includes(machineId)); }
  async updateUserRole(userId: string, role: UserRole) { const user = users.find((item) => item.id === userId); if (!user) throw new Error("Unknown user"); user.role = role; return { ...user }; }
  async userHasMachineAccess(userId: string, machineId: string) { return (await this.getUserMachineAccess(userId)).includes(machineId); }
  async getMachineDetail(machineId: string): Promise<MachineDetail> { const machine = machineById(machineId); return { ...machine, location: `${machine.line} / Bay ${machineId.at(-1)}`, operatingHours: 8420 + machines.indexOf(machine) * 317, primaryFailureModes: ["Bearing wear", "Thermal drift"], notes: "Fictional portfolio-demo asset. Metrics are deterministic simulations." }; }
  async getMachineTelemetry(machineId: string) { machineById(machineId); return generateTelemetry(machineId); }
  async getMachinePredictions(machineId: string): Promise<Prediction[]> { const machine = machineById(machineId); return [{ id: `prediction-${machineId}`, machineId, generatedAt: NOW, horizonHours: 1, failureMode: machine.machineType === "real-sensor" ? "Bearing imbalance" : "Thermal overload", probability: machine.riskScore / 100, confidence: 0.89, severity: machine.riskScore > 70 ? "high" : machine.riskScore > 35 ? "medium" : "low" }]; }
  async getPredictionConfig(machineId: string): Promise<PredictionConfig> { return createPredictionConfig(machineId); }
  async predictMachine(machineId: string, input: ManualPredictionInput): Promise<ManualPredictionResult> { return scorePrediction(machineId, input.values); }
  async getSimulationConfig(machineId: string): Promise<SimulationConfig> { return createSimulationConfig(machineId); }
  async getSimulationSessionPreview(machineId: string, sessionId: number): Promise<SimulationSessionPreview> { return createSessionPreview(machineId, sessionId); }
  async getMaintenanceRecommendations(machineId: string): Promise<MaintenanceRecommendation[]> { const machine = machineById(machineId); return [{ id: `recommendation-${machineId}`, machineId, title: machine.riskScore > 70 ? "Inspect bearing assembly" : "Continue condition monitoring", detail: "Review the simulated vibration trend before the next planned service window.", actionType: machine.riskScore > 70 ? "inspect" : "parameter", priority: machine.riskScore > 70 ? "high" : "low", etaMinutes: 30, estimatedDowntimeHours: machine.riskScore > 70 ? 1.5 : 0 }]; }

  async listHistoryEvents(query: HistoryQuery = {}): Promise<HistoryEvent[]> { return createDemoHistory().filter((event) => (!query.userId || event.userId === query.userId) && (!query.machineId || event.machineId === query.machineId) && (!query.machineIds || (event.machineId && query.machineIds.includes(event.machineId))) && (!query.type || query.type === "all" || event.type === query.type) && (!query.dateFrom || event.timestamp >= query.dateFrom) && (!query.dateTo || event.timestamp <= query.dateTo)); }

  async listThreads(userId: string) { return [...this.threads.values()].filter((thread) => thread.userId === userId); }
  async createThread(input: { userId: string; title?: string }) { const id = `demo-thread-${++this.counter}`; const thread: ChatThread = { id, title: input.title ?? "Fleet briefing", updatedAt: NOW, userId: input.userId, promptSuggestions: ["Plot session 78 telemetry", "Show latest Packaging Drive 01 values as a table", "Compare fleet risk", "Predict failure for Process Pump 02", "Simulate Packaging Drive 01 for 60 minutes"], followUpSuggestions: ["Show latest Packaging Drive 01 values as a table", "Compare fleet risk"] }; this.threads.set(id, thread); this.messages.set(id, []); return { ...thread }; }
  async getThread(threadId: string) { const thread = this.threads.get(threadId); if (!thread) throw new Error("Unknown thread"); return { thread: { ...thread }, messages: [...(this.messages.get(threadId) ?? [])] }; }
  async renameThread(threadId: string, title: string) { const thread = this.threads.get(threadId); if (!thread) throw new Error("Unknown thread"); thread.title = title; return { ...thread }; }
  async deleteThread(threadId: string) { this.threads.delete(threadId); this.messages.delete(threadId); }
  async sendMessage(input: SendMessageInput) { const thread = this.threads.get(input.threadId); if (!thread) throw new Error("Unknown thread"); const history = this.messages.get(input.threadId) ?? []; const userMessage: ChatMessage = { id: `demo-message-${++this.counter}`, threadId: input.threadId, role: "user", createdAt: NOW, contentBlocks: [{ type: "text", content: input.text }] }; const response = composeDemoAssistantResponse({ prompt: input.text, threadId: input.threadId, queryMode: input.queryMode, machineId: input.machineId }); const assistant: ChatMessage = { id: `demo-message-${++this.counter}`, threadId: input.threadId, role: "assistant", createdAt: NOW, ...response }; const next = [...history, userMessage, assistant]; this.messages.set(input.threadId, next); thread.updatedAt = NOW; return { thread: { ...thread }, messages: next }; }

  async listSimulationRuns(userId?: string) { return this.runs.filter((run) => !userId || run.userId === userId); }
  async runSimulation(input: SimulationScenarioInput, userId: string): Promise<SimulationRun> { const run = createSimulationRun(createSessionPreview(input.machineId, input.sessionId), input.simulationHorizonMinutes ?? 30, userId, input.scenarioName); this.runs.unshift(run); return run; }
}
