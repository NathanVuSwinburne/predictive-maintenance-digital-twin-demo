import type { DigitalTwinDataProvider } from "@/lib/data/provider";
import type {
  ChatMessage, ChatThread, HistoryEvent, HistoryQuery, LoginInput, LoginResult,
  MachineDetail, MachineSummary, MachinesQuery, ManualPredictionInput,
  ManualPredictionResult, MaintenanceRecommendation, Prediction, PredictionConfig,
  Session, SendMessageInput, SimulationConfig, SimulationGeneratedReading,
  SimulationRun, SimulationScenarioInput, SimulationSessionPreview, TelemetryPoint,
  TotpBackupCodesResult, TotpSetupResult, TotpStatus, UserPersona, UserRole,
  VerifyMfaInput,
} from "@/lib/domain/types";
import { getSimulationSchemaForMachineType } from "@/lib/simulation/schemas";
import { generateDriveReadings, generateTelemetry } from "@/lib/demo-engineering/signals";

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

function forecast(machineId: string, minutes = 30): SimulationGeneratedReading[] {
  const source = generateDriveReadings(machineId, Math.max(6, Math.floor(minutes / 5)), NOW, 5 * 60_000);
  return source.map((point, index) => ({
    timestamp: new Date(Date.parse(NOW) + (index + 1) * 5 * 60_000).toISOString(),
    values: point.values,
    synthetic: true,
  }));
}

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
  async getPredictionConfig(machineId: string): Promise<PredictionConfig> { const machine = machineById(machineId); return { machineId, machineType: machine.machineType ?? "ai4i", title: `${machine.name} manual prediction`, description: "Evaluate a deterministic demo scenario.", failureThreshold: 0.5, warnings: ["Portfolio demo: no production inference is performed."], fields: [{ key: "temperature", label: "Temperature", type: "number", unit: "°C", required: true, step: 0.1, range: { observedMin: 25, observedMax: 90, recommendedMin: 35, recommendedMax: 70, typicalValue: 55 }, options: null }] }; }
  async predictMachine(machineId: string, input: ManualPredictionInput): Promise<ManualPredictionResult> { machineById(machineId); const temperature = Number(input.values.temperature ?? 55); const probability = Math.min(0.96, Math.max(0.04, (temperature - 25) / 70)); return { machineId, machineType: machineById(machineId).machineType ?? "ai4i", predictedLabel: probability >= 0.5 ? "Elevated risk" : "Normal", failureProbability: probability, confidence: 0.88, severity: probability > 0.7 ? "high" : probability > 0.4 ? "medium" : "low", thresholdTriggered: probability >= 0.5, warnings: ["Simulated result"], breachedFields: temperature > 70 ? ["temperature"] : [], generatedAt: NOW }; }
  async getSimulationConfig(machineId: string): Promise<SimulationConfig> { const machine = machineById(machineId); return { machineId, machineType: machine.machineType ?? "ai4i", title: `${machine.name} forecast simulation`, description: "20-minute context with deterministic autoregressive demo forecasting.", contextWindowMinutes: 20, contextWindowRows: 40, forecastChunkMinutes: 10, sampleIntervalMs: 30_000, warnings: ["All forecast values are simulated."], sessions: [{ sessionId: 301, start: "2026-06-28T07:40:00.000Z", end: NOW, totalRows: 40, realRows: 0, syntheticRows: 40, durationMinutes: 20, usesSyntheticContinuation: true, label: "Demo session 301" }], sensorChartGroups: [{ id: "vibration", label: "Vibration", unit: "g", fields: ["vibrationX", "vibrationY", "vibrationZ"] }, { id: "temperature", label: "Temperature", unit: "°C", fields: ["temperature"] }] }; }
  async getSimulationSessionPreview(machineId: string, sessionId: number): Promise<SimulationSessionPreview> { const config = await this.getSimulationConfig(machineId); const values = forecast(machineId, 20); return { machineId, machineType: config.machineType, sessionId, sensorFields: ["vibrationX", "vibrationY", "vibrationZ", "temperature"], sensorChartGroups: config.sensorChartGroups, sourceWindow: { start: "2026-06-28T07:40:00.000Z", end: NOW, points: values.length, sessionId, realPoints: 0, syntheticPoints: values.length }, readings: values }; }
  async getMaintenanceRecommendations(machineId: string): Promise<MaintenanceRecommendation[]> { const machine = machineById(machineId); return [{ id: `recommendation-${machineId}`, machineId, title: machine.riskScore > 70 ? "Inspect bearing assembly" : "Continue condition monitoring", detail: "Review the simulated vibration trend before the next planned service window.", actionType: machine.riskScore > 70 ? "inspect" : "parameter", priority: machine.riskScore > 70 ? "high" : "low", etaMinutes: 30, estimatedDowntimeHours: machine.riskScore > 70 ? 1.5 : 0 }]; }

  async listHistoryEvents(query: HistoryQuery = {}): Promise<HistoryEvent[]> { return machines.flatMap((machine, index) => [{ id: `history-${index}`, timestamp: new Date(Date.parse(NOW) - index * 6 * 60 * 60_000).toISOString(), type: index % 3 === 0 ? "fault-prediction" as const : "telemetry-anomaly" as const, machineId: machine.id, userId: "demo-admin", title: index % 3 === 0 ? "Forecast risk reviewed" : "Telemetry deviation observed", description: `Simulated event for ${machine.name}.`, severity: machine.riskScore > 70 ? "high" as const : "low" as const }]).filter((event) => (!query.machineId || event.machineId === query.machineId) && (!query.machineIds || query.machineIds.includes(event.machineId)) && (!query.type || query.type === "all" || event.type === query.type)); }

  async listThreads(userId: string) { return [...this.threads.values()].filter((thread) => thread.userId === userId); }
  async createThread(input: { userId: string; title?: string }) { const id = `demo-thread-${++this.counter}`; const thread: ChatThread = { id, title: input.title ?? "Fleet briefing", updatedAt: NOW, userId: input.userId, promptSuggestions: ["Summarize the fleet risk", "Why is Packaging Drive 01 at risk?", "Recommend maintenance for Packaging Drive 01"], followUpSuggestions: ["Show the supporting telemetry", "Run a 30-minute simulation"] }; this.threads.set(id, thread); this.messages.set(id, []); return { ...thread }; }
  async getThread(threadId: string) { const thread = this.threads.get(threadId); if (!thread) throw new Error("Unknown thread"); return { thread: { ...thread }, messages: [...(this.messages.get(threadId) ?? [])] }; }
  async renameThread(threadId: string, title: string) { const thread = this.threads.get(threadId); if (!thread) throw new Error("Unknown thread"); thread.title = title; return { ...thread }; }
  async deleteThread(threadId: string) { this.threads.delete(threadId); this.messages.delete(threadId); }
  async sendMessage(input: SendMessageInput) { const thread = this.threads.get(input.threadId); if (!thread) throw new Error("Unknown thread"); const history = this.messages.get(input.threadId) ?? []; const userMessage: ChatMessage = { id: `demo-message-${++this.counter}`, threadId: input.threadId, role: "user", createdAt: NOW, contentBlocks: [{ type: "text", content: input.text }] }; const normalized = input.text.toLowerCase(); const supported = /fleet|risk|machine|packaging|telemetry|maintenance|simulation|forecast/.test(normalized); const content = supported ? (normalized.includes("maintenance") ? "Packaging Drive 01 has elevated simulated vibration. Inspect its bearing assembly during the next planned service window." : "The demo fleet has 10 fictional assets: 2 are currently at high risk, led by Packaging Drive 01 at 84% simulated risk.") : "That request is outside this scripted portfolio experience. Try one of the supported demo prompts: fleet risk, machine telemetry, maintenance recommendations, or simulation."; const assistant: ChatMessage = { id: `demo-message-${++this.counter}`, threadId: input.threadId, role: "assistant", createdAt: NOW, contentBlocks: [{ type: "text", content }], agentTrace: supported ? [{ step: 1, tool: normalized.includes("simulation") ? "run_simulation" : normalized.includes("maintenance") ? "propose_maintenance" : "query_database", label: "Demo tool call", summary: "Resolved against deterministic portfolio data." }, { step: 2, tool: "compose_response", label: "Response synthesis", summary: "Formatted a scripted, traceable response." }] : [] }; const next = [...history, userMessage, assistant]; this.messages.set(input.threadId, next); thread.updatedAt = NOW; return { thread: { ...thread }, messages: next }; }

  async listSimulationRuns(userId?: string) { return this.runs.filter((run) => !userId || run.userId === userId); }
  async runSimulation(input: SimulationScenarioInput, userId: string): Promise<SimulationRun> { const machine = machineById(input.machineId); const generated = forecast(input.machineId, input.simulationHorizonMinutes ?? 30); const run: SimulationRun = { id: `demo-run-${++this.counter}`, machineId: input.machineId, userId, createdAt: NOW, scenarioName: input.scenarioName, projectedRisk: Math.min(96, machine.riskScore + 4), projectedDowntimeHours: machine.riskScore > 70 ? 2.1 : 0.4, summary: `Deterministic forecast completed for ${machine.name}.`, recommendations: ["Inspect vibration mounts", "Review bearing lubrication"], projectedLabel: machine.riskScore > 70 ? "high" : "medium", failureProbability: Math.min(0.96, (machine.riskScore + 4) / 100), selectedSessionId: input.sessionId, syntheticContinuationUsed: true, generatedReadings: generated, sourceReadings: generated.slice(0, 4), sourceWindow: { start: "2026-06-28T07:40:00.000Z", end: NOW, points: 40, sessionId: input.sessionId, realPoints: 0, syntheticPoints: 40 }, sensorFields: ["vibrationX", "vibrationY", "vibrationZ", "temperature"], sensorChartGroups: (await this.getSimulationConfig(input.machineId)).sensorChartGroups, simulationHorizonMinutes: input.simulationHorizonMinutes ?? 30, simulationStatus: "completed", simulationMessage: null, classificationWindows: [] }; this.runs.unshift(run); return run; }
}
