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
    expect(assistant?.agentTrace?.map((step) => step.tool)).toContain("list_machines");
    expect(JSON.stringify(assistant?.contentBlocks)).toMatch(/fleet/i);
  });

  it("streams each supervisor tool before the answer, as production does", async () => {
    const provider = new DemoDigitalTwinProvider();
    const thread = await provider.createThread({ userId: "demo-admin" });
    const events: string[] = [];
    await provider.sendMessageStreamed(
      { threadId: thread.id, userId: "demo-admin", text: "Predict failure for Process Pump 02" },
      (event) => events.push(event.type === "status" ? `${event.phase}:${event.tool}` : event.type),
    );
    expect(events.slice(0, 2)).toEqual(["running:describe_machine", "finished:describe_machine"]);
    expect(events).toContain("delta");
    expect(events.at(-1)).toBe("done");
  });

  it("projects the fleet onto canonical machines with registry models and a live feed", async () => {
    const now = Date.parse("2026-10-19T03:00:00Z");
    const provider = new DemoDigitalTwinProvider({ now: () => now });
    const machines = await provider.listCanonicalMachines();
    expect(machines).toHaveLength(10);
    expect(machines.every((machine) => machine.legacyCompatible)).toBe(true);
    expect(machines.every((machine) => Date.parse(machine.nextServiceDate) > 0)).toBe(true);

    const fleet = await provider.getFleetLiveHealth();
    expect(fleet.machines.filter((machine) => machine.state === "live").map((machine) => machine.entityId)).toEqual(["machine-c-01", "machine-c-02", "machine-c-03"]);
    expect(fleet.machines.find((machine) => machine.entityId === "machine-b-03")?.state).toBe("disconnected");

    const models = await provider.listSimulatorEntityModels();
    expect(models.find((model) => model.entityId === "machine-b-02")?.objectives).toEqual(["predict", "simulate"]);
    const entities = await provider.listSimulatorEntities();
    expect(entities.find((entity) => entity.entityId === "machine-b-03")?.eligible).toBe(false);

    const forecast = await provider.runGenericSimulation("machine-c-01", { durationMinutes: 30 });
    expect(forecast.forecasts).toHaveLength(60);
    expect(forecast.inputFeatures).toEqual(["VibrationX", "VibrationY", "VibrationZ", "Temperature"]);
  });

  it("refuses backend-only actions with a sentence written for the visitor", async () => {
    const provider = new DemoDigitalTwinProvider();
    await expect(provider.createMqttSubscription()).rejects.toThrow(/not available|switched off/i);
    await expect(provider.connectCmtkMachine({ entityId: "machine-c-01" })).rejects.toThrow(/portfolio demo/);
  });

  it("saves an assistant answer into the browser knowledge vault", async () => {
    const provider = new DemoDigitalTwinProvider();
    const note = await provider.captureToKnowledge({ title: "Drive 01 vibration finding", content: "Inspect the mounting.", namespace: "fleet" });
    expect(note.id).toBe("fleet/drive-01-vibration-finding");
    expect((await provider.getKnowledgeNote(note.path)).body).toContain("Inspect the mounting.");
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
