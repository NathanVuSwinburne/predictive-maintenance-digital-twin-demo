import { describe, expect, it } from "vitest";

import { DemoDigitalTwinProvider } from "@/lib/data/demo-provider";

describe("DemoDigitalTwinProvider", () => {
  it("exposes ten fictional fleet instances with filtering and sorting", async () => {
    const provider = new DemoDigitalTwinProvider();

    const machines = await provider.listMachines({
      sortBy: "risk",
      sortDirection: "desc",
    });

    expect(machines).toHaveLength(10);
    expect(machines.map((machine) => machine.riskScore)).toEqual(
      [...machines.map((machine) => machine.riskScore)].sort((a, b) => b - a),
    );
    expect(new Set(machines.map((machine) => machine.machineType))).toEqual(
      new Set(["ai4i", "sensor", "real-sensor"]),
    );

    const filtered = await provider.listMachines({
      line: "Assembly 1",
      status: "healthy",
      search: "press",
    });
    expect(filtered.every((machine) => machine.line === "Assembly 1")).toBe(true);
    expect(filtered.every((machine) => machine.status === "healthy")).toBe(true);
    expect(filtered.every((machine) => /press/i.test(`${machine.name} ${machine.model}`))).toBe(true);
  });

  it("provides one-click demo authentication without MFA", async () => {
    const provider = new DemoDigitalTwinProvider();
    const result = await provider.login({ email: "demo@portfolio.local", password: "demo" });

    expect(result.requiresMfa).toBe(false);
    if (result.requiresMfa) throw new Error("Demo login unexpectedly requested MFA");
    expect(await provider.getSession(result.session.token)).toEqual(result.session);
    expect((await provider.getCurrentUser(result.session.token))?.role).toBe("admin");
  });

  it("runs a deterministic simulation with generated forecast readings", async () => {
    const provider = new DemoDigitalTwinProvider();
    const run = await provider.runSimulation(
      {
        machineId: "machine-c-01",
        scenarioName: "Portfolio bearing scenario",
        sessionId: 301,
        simulationHorizonMinutes: 30,
        parameters: { temperature: 58 },
      },
      "demo-admin",
    );

    expect(run.simulationStatus).toBe("completed");
    expect(run.generatedReadings?.length).toBeGreaterThan(0);
    expect(await provider.listSimulationRuns("demo-admin")).toContainEqual(run);
  });

  it("returns scripted tool traces for supported chat prompts", async () => {
    const provider = new DemoDigitalTwinProvider();
    const thread = await provider.createThread({ userId: "demo-admin" });
    const response = await provider.sendMessage({
      threadId: thread.id,
      userId: "demo-admin",
      text: "Summarize the fleet risk",
    });
    const assistant = response.messages.at(-1);

    expect(assistant?.role).toBe("assistant");
    expect(assistant?.agentTrace?.map((step) => step.tool)).toContain("query_telemetry");
    expect(JSON.stringify(assistant?.contentBlocks)).toMatch(/fleet/i);
  });

  it("guides unsupported free-form prompts back to curated scenarios", async () => {
    const provider = new DemoDigitalTwinProvider();
    const thread = await provider.createThread({ userId: "demo-admin" });
    const response = await provider.sendMessage({
      threadId: thread.id,
      userId: "demo-admin",
      text: "Write a limerick about procurement",
    });

    expect(JSON.stringify(response.messages.at(-1)?.contentBlocks)).toMatch(
      /supported demo prompts/i,
    );
  });
});
