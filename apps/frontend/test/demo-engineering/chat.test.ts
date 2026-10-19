import { describe, expect, it } from "vitest";
import { composeDemoAssistantResponse } from "@/lib/demo-engineering/chat";

describe("demo assistant", () => {
  it.each([
    ["Plot session 78 telemetry", "chart"],
    ["Show latest Packaging Drive 01 values as a table", "table"],
    ["Predict failure for Process Pump 02", "status-card"],
    ["Simulate Packaging Drive 01 for 60 minutes", "comparison"],
  ])("maps %s to a %s response", (prompt, blockType) => {
    const response = composeDemoAssistantResponse({ prompt, threadId: "t1" });
    expect(response.contentBlocks.map((block) => block.type)).toContain(blockType);
    expect(response.agentTrace.length).toBeGreaterThanOrEqual(1);
  });

  it("answers live questions from the replayed CMTK feed", () => {
    const response = composeDemoAssistantResponse({ prompt: "How is Packaging Drive 01 doing right now?", threadId: "t1", now: Date.parse("2026-10-19T00:00:00Z") });
    expect(response.agentTrace.map((step) => step.tool)).toContain("get_live_status");
    expect(response.contentBlocks.map((block) => block.type)).toContain("table");
  });

  it("traces a noise complaint through the single supervisor's tools", () => {
    const response = composeDemoAssistantResponse({
      prompt: "Why was this machine so noisy yesterday?",
      threadId: "t1",
      machineId: "machine-c-01",
    });

    expect(response.contentBlocks.map((block) => block.type)).toContain("status-card");
    expect(response.agentTrace.map((step) => step.tool)).toEqual(
      expect.arrayContaining(["search_knowledge", "get_telemetry", "run_inference", "propose_recommendation"]),
    );
    expect(response.agentTrace.map((step) => step.label)).toContain("Ran the model");
  });
});
