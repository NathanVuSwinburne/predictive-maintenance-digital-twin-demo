import type { AgentTraceStep, ChatContentBlock } from "@/lib/domain/types";
import { DEMO_ASSETS, getDemoAsset } from "./assets";
import { isLiveDemoMachine, liveStatusAt } from "./live";
import { scorePrediction } from "./prediction";
import { createSessionPreview, createSimulationRun } from "./sessions";
import { generateTelemetry } from "./signals";

type Input = { prompt: string; threadId: string; machineId?: string; now?: number };
export type DemoAssistantResponse = { contentBlocks: ChatContentBlock[]; agentTrace: AgentTraceStep[] };

/**
 * The production assistant is one supervisor agent with eleven tools and no sub-agents.
 * These are the labels the production trace panel shows for each tool, so a scripted
 * demo trace reads exactly like a real one.
 */
export const SUPERVISOR_TOOL_LABELS = {
  list_machines: "Listed the fleet",
  describe_machine: "Looked up the machine",
  get_telemetry: "Read sensor data",
  get_live_status: "Checked the live feed",
  get_events: "Read machine history",
  run_inference: "Ran the model",
  run_simulation: "Ran simulation",
  propose_recommendation: "Proposed maintenance action",
  search_knowledge: "Searched the knowledge base",
  write_knowledge: "Updated the knowledge base",
  run_analytical_sql: "Ran an analytical query",
} as const;

export type SupervisorTool = keyof typeof SUPERVISOR_TOOL_LABELS;

function trace(steps: Array<[SupervisorTool, string]>): AgentTraceStep[] {
  return steps.map(([tool, summary], index) => ({
    step: index + 1,
    tool,
    label: SUPERVISOR_TOOL_LABELS[tool],
    summary,
  }));
}

const SUPPORTED_PROMPTS = [
  "How is Packaging Drive 01 doing right now?",
  "Plot session 78 telemetry",
  "Show latest Packaging Drive 01 values as a table",
  "Compare fleet risk",
  "Predict failure for Process Pump 02",
  "Simulate Packaging Drive 01 for 60 minutes",
  "Why was this machine so noisy yesterday?",
];

export const DEMO_PROMPT_SUGGESTIONS = SUPPORTED_PROMPTS.slice(0, 5);

function intentOf(lower: string) {
  if (/noisy|noise|loud|complain|yesterday|why.*machine/.test(lower)) return "complaint";
  if (/right now|live|currently|at the moment/.test(lower)) return "live";
  if (/simulate|simulation|forecast/.test(lower)) return "simulation";
  if (/predict|failure/.test(lower)) return "prediction";
  if (/history|incident|event|happened/.test(lower)) return "history";
  if (/telemetry|plot|latest|table|values|reading/.test(lower)) return "telemetry";
  if (/fleet|risk|machines/.test(lower)) return "fleet";
  return "general";
}

export function composeDemoAssistantResponse(input: Input): DemoAssistantResponse {
  const lower = input.prompt.toLowerCase();
  const asset = input.machineId
    ? getDemoAsset(input.machineId)
    : DEMO_ASSETS.find((item) => lower.includes(item.name.toLowerCase()) || lower.includes(item.id))
      ?? (lower.includes("session") ? getDemoAsset("machine-c-01") : undefined);
  const intent = intentOf(lower);
  const contentBlocks: ChatContentBlock[] = [];
  let agentTrace: AgentTraceStep[] = [];

  if (intent === "complaint") {
    const selected = asset ?? getDemoAsset("machine-c-01");
    const values = Object.fromEntries(selected.predictionFields.map((field) => [field.key, field.range?.typicalValue ?? "M"]));
    values.vibrationX = 1.08;
    values.vibrationY = 0.62;
    values.vibrationZ = 1.22;
    const result = scorePrediction(selected.id, values);
    contentBlocks.push(
      { type: "text", content: `I treated “noisy yesterday” as a possible vibration complaint, read the relevant ${selected.name} sensor window, and checked it with the machine's model.` },
      { type: "status-card", title: "Noise complaint investigation", machineName: selected.name, machineId: selected.id, intent: "prediction", status: result.predictedLabel, severity: result.severity, summary: `The vibration pattern produced a ${Math.round(result.failureProbability * 100)}% demo risk score. Inspect imbalance and mounting before the next run.`, metrics: [{ label: "Likely pattern", value: result.failureType ?? "Vibration imbalance" }, { label: "Confidence", value: `${Math.round((result.confidence ?? 0.88) * 100)}%` }] },
      { type: "table", columns: ["Evidence checked", "Finding"], rows: [["Historical telemetry", "Uneven vibration across three axes"], ["Model result", result.predictedLabel], ["Suggested action", "Inspect alignment, bearings, and mounting"]] },
    );
    agentTrace = trace([
      ["search_knowledge", "Found the vibration-complaint and bearing-wear pages, with their links and backlinks."],
      ["describe_machine", `${selected.name} measures three vibration axes and bearing temperature.`],
      ["get_telemetry", `Read yesterday's vibration and temperature window for ${selected.name}.`],
      ["run_inference", `Scored the retrieved window: ${result.predictedLabel.toLowerCase()} at ${Math.round(result.failureProbability * 100)}%.`],
      ["propose_recommendation", "Drafted an alignment and bearing inspection for a person to approve."],
    ]);
  } else if (intent === "live") {
    const selected = asset && isLiveDemoMachine(asset.id) ? asset : getDemoAsset("machine-c-01");
    const status = liveStatusAt(selected.id, input.now ?? Date.now(), 12);
    const latest = status.observations.at(-1);
    const level = status.inference.latest?.predictedLabel ?? "unknown";
    contentBlocks.push(
      { type: "text", content: `${selected.name} is streaming its demo replay feed. The newest reading is a few seconds old, and the automatic model reads a ${level} vibration level.` },
      { type: "table", columns: ["Sensor", "Latest", "Unit"], rows: Object.entries(latest?.values ?? {}).map(([key, value]) => [key, String(value), status.featureUnits?.[key] ?? ""]) },
    );
    agentTrace = trace([
      ["list_machines", "Matched the request to one live machine on the fleet."],
      ["get_live_status", `Feed is ${status.state}; read the last ${status.observations.length} readings and the latest automatic result.`],
    ]);
  } else if (intent === "simulation") {
    const selected = asset ?? getDemoAsset("machine-c-01");
    const sessionId = Number(lower.match(/session\s+(\d+)/)?.[1] ?? 78);
    const horizon = Number(lower.match(/(\d+)\s*minutes?/)?.[1] ?? 60);
    const run = createSimulationRun(createSessionPreview(selected.id, sessionId), horizon, "demo-admin", "Assistant scenario");
    contentBlocks.push(
      { type: "text", content: `Compared observed session ${sessionId} with a deterministic ${horizon}-minute synthetic continuation.` },
      { type: "comparison", title: `${selected.name} observed vs forecast`, baselineLabel: "Observed", scenarioLabel: "Synthetic forecast", rows: [{ label: "Risk", baseline: `${selected.riskScore}%`, scenario: `${run.projectedRisk}%`, delta: `${run.projectedRisk - selected.riskScore}%` }, { label: "Downtime", baseline: "0 h", scenario: `${run.projectedDowntimeHours} h` }] },
      { type: "chart", title: `${selected.name} vibration forecast`, unit: "g", data: (run.generatedReadings ?? []).filter((_, index) => index % 12 === 0).map((point) => ({ label: point.timestamp.slice(11, 16), value: point.values.vibrationX })) },
    );
    agentTrace = trace([
      ["describe_machine", `${selected.name} has a forecasting model and a recorded session ${sessionId}.`],
      ["run_simulation", `Projected ${selected.name} ${horizon} minutes ahead from session ${sessionId}.`],
    ]);
  } else if (intent === "prediction") {
    const selected = asset ?? getDemoAsset("machine-b-02");
    const values = Object.fromEntries(selected.predictionFields.map((field) => [field.key, field.range?.typicalValue ?? "M"]));
    if (selected.machineType === "sensor") { values.temperature = 84; values.vibration = 9.2; }
    const result = scorePrediction(selected.id, values);
    contentBlocks.push(
      { type: "text", content: "This is an explainable deterministic demo engineering score, not production inference." },
      { type: "status-card", title: "Failure prediction", machineName: selected.name, machineId: selected.id, intent: "prediction", status: result.predictedLabel, severity: result.severity, summary: `${Math.round(result.failureProbability * 100)}% failure probability.`, metrics: [{ label: "Confidence", value: `${Math.round(result.confidence * 100)}%` }, { label: "Breaches", value: String(result.breachedFields.length) }] },
      { type: "table", columns: ["Field", "Condition"], rows: result.breachedFields.map((field) => [field, "Outside recommended band"]) },
    );
    agentTrace = trace([
      ["describe_machine", `${selected.name} has an active failure-prediction model.`],
      ["run_inference", `Checked ${selected.name} against its operating envelope: ${Math.round(result.failureProbability * 100)}%.`],
    ]);
  } else if (intent === "history") {
    const selected = asset ?? getDemoAsset("machine-c-01");
    contentBlocks.push(
      { type: "text", content: `${selected.name} has a linked chain of events: a vibration anomaly, a model result, an assistant review, a simulation and a scheduled inspection.` },
      { type: "links", links: [{ label: "Open the history", href: `/history?machineId=${selected.id}`, description: "Every recorded event for this machine." }] },
    );
    agentTrace = trace([["get_events", `Read the recorded events for ${selected.name}.`]]);
  } else if (intent === "telemetry" || intent === "fleet") {
    if (!asset && intent === "fleet") {
      contentBlocks.push({ type: "text", content: "Fleet risk sorted from highest to lowest deterministic score." }, { type: "table", columns: ["Machine", "Status", "Risk"], rows: [...DEMO_ASSETS].sort((a, b) => b.riskScore - a.riskScore).map((item) => [item.name, item.status, `${item.riskScore}%`]) });
      agentTrace = trace([["list_machines", `Listed ${DEMO_ASSETS.length} machines with their current status and risk.`]]);
    } else {
      const selected = asset ?? getDemoAsset("machine-c-01");
      const telemetry = generateTelemetry(selected.id, 48);
      const latest = telemetry.at(-1)!;
      if (/plot|chart|telemetry/.test(lower)) contentBlocks.push({ type: "text", content: `${selected.name} vibration is non-uniform and temperature responds more slowly to changing load.` }, { type: "chart", title: `${selected.name} vibration telemetry`, unit: "g", data: telemetry.filter((_, index) => index % 4 === 0).map((point) => ({ label: point.timestamp.slice(11, 16), value: point.vibration })) });
      else contentBlocks.push({ type: "text", content: `${selected.name} latest deterministic observed-fixture summary.` }, { type: "table", columns: ["Metric", "Value", "Condition limit"], rows: [["Temperature", `${latest.temperature} °C`, "78 °C"], ["Vibration", `${latest.vibration} g`, "0.85 g"], ["Pressure", `${latest.pressure} bar`, "7.5 bar"], ["Power", `${latest.power} kW`, "105 kW"]] });
      agentTrace = trace([
        ["describe_machine", `${selected.name} reports temperature, vibration, pressure and power.`],
        ["get_telemetry", `Read the latest ${telemetry.length} readings for ${selected.name}.`],
      ]);
    }
  } else {
    contentBlocks.push({ type: "text", content: `That request is outside this scripted portfolio experience. Try the supported demo prompts: ${SUPPORTED_PROMPTS.join("; ")}.` });
    agentTrace = trace([["search_knowledge", "Nothing in the demo knowledge base matched the request."]]);
  }

  return { contentBlocks, agentTrace };
}
