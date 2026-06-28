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
} from "@/lib/domain/types";
import type { DigitalTwinDataProvider } from "@/lib/data/provider";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

function toQueryString(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export class FastApiDigitalTwinProvider implements DigitalTwinDataProvider {
  constructor(private readonly baseUrl: string) {}

  private readTokenFromCookieString(cookieString: string) {
    const target = cookieString
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${SESSION_COOKIE_NAME}=`));

    if (!target) {
      return null;
    }

    const [, value = ""] = target.split("=");
    return decodeURIComponent(value);
  }

  private async resolveSessionToken() {
    if (typeof document !== "undefined") {
      return this.readTokenFromCookieString(document.cookie);
    }

    try {
      const { cookies } = await import("next/headers");
      return this.readTokenFromCookieString((await cookies()).toString());
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
    headers.set("Content-Type", "application/json");

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
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `FastAPI request failed (${response.status}) for ${path}: ${text || "Unknown error"}`,
      );
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

  async logout(token: string): Promise<void> {
    return this.request<void>("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  async getSession(token: string): Promise<Session | null> {
    return this.request<Session | null>(
      `/api/v1/auth/session${toQueryString({ token })}`,
    );
  }

  async getCurrentUser(token: string): Promise<UserPersona | null> {
    return this.request<UserPersona | null>("/api/v1/auth/me", undefined, {
      requiresAuth: true,
      authToken: token,
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

  async listUsers(): Promise<UserPersona[]> {
    return this.request<UserPersona[]>("/api/v1/users", undefined, {
      requiresAuth: true,
    });
  }

  async listMachines(query?: MachinesQuery): Promise<MachineSummary[]> {
    return this.request<MachineSummary[]>(
      `/api/v1/machines${toQueryString({
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

  async getUserMachineAccess(userId: string): Promise<string[]> {
    const response = await this.request<{ machineIds: string[] }>(
      `/api/v1/users/${userId}/machine-access`,
      undefined,
      { requiresAuth: true },
    );

    return response.machineIds;
  }

  async updateUserMachineAccess(
    userId: string,
    machineIds: string[],
  ): Promise<string[]> {
    const response = await this.request<{ machineIds: string[] }>(
      `/api/v1/users/${userId}/machine-access`,
      {
        method: "PUT",
        body: JSON.stringify({ machineIds }),
      },
      { requiresAuth: true },
    );

    return response.machineIds;
  }

  async getMachineAuthorizedUsers(machineId: string): Promise<UserPersona[]> {
    return this.request<UserPersona[]>(
      `/api/v1/machines/${machineId}/users`,
      undefined,
      { requiresAuth: true },
    );
  }

  async updateUserRole(userId: string, role: UserRole): Promise<UserPersona> {
    return this.request<UserPersona>(
      `/api/v1/users/${userId}/role`,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      },
      { requiresAuth: true },
    );
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
    return this.request<MachineDetail>(
      `/api/v1/machines/${machineId}`,
      undefined,
      {
        requiresAuth: true,
      },
    );
  }

  async getMachineTelemetry(machineId: string): Promise<TelemetryPoint[]> {
    return this.request<TelemetryPoint[]>(
      `/api/v1/machines/${machineId}/telemetry`,
      undefined,
      { requiresAuth: true },
    );
  }

  async getMachinePredictions(machineId: string): Promise<Prediction[]> {
    return this.request<Prediction[]>(
      `/api/v1/machines/${machineId}/predictions`,
      undefined,
      { requiresAuth: true },
    );
  }

  async getPredictionConfig(machineId: string): Promise<PredictionConfig> {
    return this.request<PredictionConfig>(
      `/api/v1/machines/${machineId}/prediction-config`,
      undefined,
      { requiresAuth: true },
    );
  }

  async predictMachine(
    machineId: string,
    input: ManualPredictionInput,
  ): Promise<ManualPredictionResult> {
    return this.request<ManualPredictionResult>(
      `/api/v1/machines/${machineId}/predict`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      { requiresAuth: true },
    );
  }

  async getSimulationConfig(machineId: string): Promise<SimulationConfig> {
    return this.request<SimulationConfig>(
      `/api/v1/simulations/config/${machineId}`,
      undefined,
      { requiresAuth: true },
    );
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
    return this.request<MaintenanceRecommendation[]>(
      `/api/v1/machines/${machineId}/recommendations`,
      undefined,
      { requiresAuth: true },
    );
  }

  async listHistoryEvents(query?: HistoryQuery): Promise<HistoryEvent[]> {
    return this.request<HistoryEvent[]>(
      `/api/v1/history${toQueryString({
        user_id: query?.userId,
        machine_id: query?.machineId,
        machine_ids: query?.machineIds?.join(","),
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
    const { apiKey, llmProvider, ...body } = input;
    const extraHeaders: Record<string, string> = {};
    if (apiKey) extraHeaders["X-API-Key"] = apiKey;
    if (llmProvider) extraHeaders["X-LLM-Provider"] = llmProvider;

    return this.request<{ thread: ChatThread; messages: ChatMessage[] }>(
      "/api/v1/chat/messages",
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: extraHeaders,
      },
      { requiresAuth: true },
    );
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
}
