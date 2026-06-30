import type { AgentTraceStep, ChatContentBlock, QueryMode } from "@/lib/domain/types";
import { DEMO_ASSETS, getDemoAsset } from "./assets";
import { scorePrediction } from "./prediction";
import { createSessionPreview, createSimulationRun } from "./sessions";
import { generateTelemetry } from "./signals";

type Input = { prompt: string; threadId: string; queryMode?: QueryMode; machineId?: string };
export type DemoAssistantResponse = { contentBlocks: ChatContentBlock[]; agentTrace: AgentTraceStep[] };

type TraceInput = Omit<AgentTraceStep, "step">;

function trace(steps: TraceInput[]): AgentTraceStep[] {
  return steps.map((step, index) => ({ step: index + 1, ...step }));
}

const wikiStep: TraceInput = {
  tool: "read_knowledge_note",
  actor: "Supervisor",
  target: "Obsidian LLM wiki",
  label: "Checked machine capabilities",
  summary: "Loaded the routing and maintenance guidance needed for this machine profile.",
};

const responseStep: TraceInput = {
  tool: "compose_response",
  actor: "Supervisor",
  target: "User",
  label: "Built an evidence-based explanation",
  summary: "Combined tool results into readable text, metrics, and recommended next actions.",
};

export function composeDemoAssistantResponse(input: Input): DemoAssistantResponse {
  const lower = input.prompt.toLowerCase();
  const asset = input.machineId
    ? getDemoAsset(input.machineId)
    : DEMO_ASSETS.find((item) => lower.includes(item.name.toLowerCase()) || lower.includes(item.id))
      ?? (lower.includes("session") ? getDemoAsset("machine-c-01") : undefined);
  const complaint = /noisy|noise|loud|complain|yesterday|why.*machine/.test(lower);
  const mode = input.queryMode && input.queryMode !== "auto"
    ? input.queryMode
    : /simulate|simulation/.test(lower)
      ? "simulation"
      : /predict|failure/.test(lower)
        ? "prediction"
        : /telemetry|plot|latest|table|values/.test(lower)
          ? "telemetry"
          : /fleet|risk/.test(lower)
            ? "data_lookup"
            : "general";
  const contentBlocks: ChatContentBlock[] = [];
  let agentTrace: AgentTraceStep[] = [];

  if (complaint) {
    const selected = asset ?? getDemoAsset("machine-c-01");
    const values = Object.fromEntries(selected.predictionFields.map((field) => [field.key, field.range?.typicalValue ?? "M"]));
    values.vibrationX = 1.08;
    values.vibrationY = 0.62;
    values.vibrationZ = 1.22;
    const result = scorePrediction(selected.id, values);
    contentBlocks.push(
      { type: "text", content: `I treated “noisy yesterday” as a possible vibration complaint, retrieved the relevant ${selected.name} telemetry window, and checked it with the prediction tool.` },
      { type: "status-card", title: "Noise complaint investigation", machineName: selected.name, machineId: selected.id, intent: "prediction", status: result.predictedLabel, severity: result.severity, summary: `The vibration pattern produced a ${Math.round(result.failureProbability * 100)}% demo risk score. Inspect imbalance and mounting before the next run.`, metrics: [{ label: "Likely pattern", value: result.failureType ?? "Vibration imbalance" }, { label: "Confidence", value: `${Math.round((result.confidence ?? 0.88) * 100)}%` }] },
      { type: "table", columns: ["Evidence checked", "Finding"], rows: [["Historical telemetry", "Uneven vibration across three axes"], ["Prediction", result.predictedLabel], ["Suggested action", "Inspect alignment, bearings, and mounting"]] },
    );
    agentTrace = trace([
      wikiStep,
      { tool: "extract_signal_from_complaint", actor: "Supervisor", target: "Complaint analysis tool", label: "Translated the complaint", summary: "Mapped “noisy yesterday” to a historical vibration investigation." },
      { tool: "query_database", actor: "Supervisor", target: "SQL sub-agent", label: "Delegated a read-only telemetry lookup", summary: `Requested the relevant historical window for ${selected.name}.` },
      { tool: "execute_read_only_sql", actor: "SQL sub-agent", target: "Demo data provider", label: "Retrieved the evidence", summary: "Returned the matching vibration and temperature readings without changing data." },
      { tool: "run_failure_prediction", actor: "Supervisor", target: "Prediction tool", label: "Checked the suspected condition", summary: "Scored the retrieved vibration pattern against the machine operating envelope." },
      responseStep,
    ]);
  } else if (mode === "simulation") {
    const selected = asset ?? getDemoAsset("machine-c-01");
    const sessionId = Number(lower.match(/session\s+(\d+)/)?.[1] ?? 78);
    const horizon = Number(lower.match(/(\d+)\s*minutes?/)?.[1] ?? 60);
    const run = createSimulationRun(createSessionPreview(selected.id, sessionId), horizon, "demo-admin", "Assistant scenario");
    contentBlocks.push(
      { type: "text", content: `Compared observed session ${sessionId} with a deterministic ${horizon}-minute synthetic continuation.` },
      { type: "comparison", title: `${selected.name} observed vs forecast`, baselineLabel: "Observed", scenarioLabel: "Synthetic forecast", rows: [{ label: "Risk", baseline: `${selected.riskScore}%`, scenario: `${run.projectedRisk}%`, delta: `${run.projectedRisk - selected.riskScore}%` }, { label: "Downtime", baseline: "0 h", scenario: `${run.projectedDowntimeHours} h` }] },
      { type: "chart", title: `${selected.name} vibration forecast`, unit: "g", data: (run.generatedReadings ?? []).filter((_, index) => index % 12 === 0).map((point) => ({ label: point.timestamp.slice(11, 16), value: point.values.vibrationX })) },
    );
    agentTrace = trace([wikiStep, { tool: "run_demo_simulation", actor: "Supervisor", target: "Simulation tool", label: "Ran the requested scenario", summary: `Projected ${selected.name} for ${horizon} minutes.` }, responseStep]);
  } else if (mode === "prediction") {
    const selected = asset ?? getDemoAsset("machine-b-02");
    const values = Object.fromEntries(selected.predictionFields.map((field) => [field.key, field.range?.typicalValue ?? "M"]));
    if (selected.machineType === "sensor") { values.temperature = 84; values.vibration = 9.2; }
    const result = scorePrediction(selected.id, values);
    contentBlocks.push(
      { type: "text", content: "This is an explainable deterministic demo engineering score, not production inference." },
      { type: "status-card", title: "Failure prediction", machineName: selected.name, machineId: selected.id, intent: "prediction", status: result.predictedLabel, severity: result.severity, summary: `${Math.round(result.failureProbability * 100)}% failure probability.`, metrics: [{ label: "Confidence", value: `${Math.round(result.confidence * 100)}%` }, { label: "Breaches", value: String(result.breachedFields.length) }] },
      { type: "table", columns: ["Field", "Condition"], rows: result.breachedFields.map((field) => [field, "Outside recommended band"]) },
    );
    agentTrace = trace([wikiStep, { tool: "score_demo_prediction", actor: "Supervisor", target: "Prediction tool", label: "Ran failure prediction", summary: `Checked ${selected.name} against its operating envelope.` }, responseStep]);
  } else if (mode === "telemetry" || mode === "data_lookup") {
    if (!asset && /fleet|risk/.test(lower)) {
      contentBlocks.push({ type: "text", content: "Fleet risk sorted from highest to lowest deterministic score." }, { type: "table", columns: ["Machine", "Status", "Risk"], rows: [...DEMO_ASSETS].sort((a, b) => b.riskScore - a.riskScore).map((item) => [item.name, item.status, `${item.riskScore}%`]) });
    } else {
      const selected = asset ?? getDemoAsset("machine-c-01");
      const telemetry = generateTelemetry(selected.id, 48);
      const latest = telemetry.at(-1)!;
      if (/plot|chart|telemetry/.test(lower)) contentBlocks.push({ type: "text", content: `${selected.name} vibration is non-uniform and temperature responds more slowly to changing load.` }, { type: "chart", title: `${selected.name} vibration telemetry`, unit: "g", data: telemetry.filter((_, index) => index % 4 === 0).map((point) => ({ label: point.timestamp.slice(11, 16), value: point.vibration })) });
      else contentBlocks.push({ type: "text", content: `${selected.name} latest deterministic observed-fixture summary.` }, { type: "table", columns: ["Metric", "Value", "Condition limit"], rows: [["Temperature", `${latest.temperature} °C`, "78 °C"], ["Vibration", `${latest.vibration} g`, "0.85 g"], ["Pressure", `${latest.pressure} bar`, "7.5 bar"], ["Power", `${latest.power} kW`, "105 kW"]] });
    }
    agentTrace = trace([wikiStep, { tool: "query_database", actor: "Supervisor", target: "SQL sub-agent", label: "Delegated a read-only data lookup", summary: `Requested ${asset?.name ?? "fleet"} telemetry from the demo data contract.` }, { tool: "execute_read_only_sql", actor: "SQL sub-agent", target: "Demo data provider", label: "Retrieved matching records", summary: "Returned only the fields required for the answer." }, responseStep]);
  } else {
    contentBlocks.push({ type: "text", content: "That request is outside this scripted portfolio experience. Try the supported demo prompts: Plot session 78 telemetry; Show latest Packaging Drive 01 values as a table; Compare fleet risk; Predict failure for Process Pump 02; Simulate Packaging Drive 01 for 60 minutes; Why was this machine so noisy yesterday?" });
  }

  return { contentBlocks, agentTrace };
}
