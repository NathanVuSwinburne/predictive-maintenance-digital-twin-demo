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
});
