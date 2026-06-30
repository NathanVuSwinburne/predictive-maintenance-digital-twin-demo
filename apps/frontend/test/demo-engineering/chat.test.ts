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
    expect(response.agentTrace.length).toBeGreaterThanOrEqual(2);
  });

  it("shows how the supervisor delegates a noise complaint", () => {
    const response = composeDemoAssistantResponse({
      prompt: "Why was this machine so noisy yesterday?",
      threadId: "t1",
      machineId: "machine-c-01",
    });

    expect(response.contentBlocks.map((block) => block.type)).toContain("status-card");
    expect(response.agentTrace.map((step) => step.target)).toEqual(
      expect.arrayContaining(["Obsidian LLM wiki", "SQL sub-agent", "Prediction tool"]),
    );
  });
});
