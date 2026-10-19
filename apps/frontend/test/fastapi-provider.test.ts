import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  FastApiDigitalTwinProvider,
  isThreadBusy,
} from "@/lib/data/fastapi-provider";

describe("FastApiDigitalTwinProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("reads the CMTK setup and connects a machine through the server-managed source", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ configured: true, machines: [], candidates: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ machine: { entityId: "entity-1" }, connection: { success: false, message: "later" } }), { status: 200 }));
    const provider = new FastApiDigitalTwinProvider("http://api.test");

    const setup = await provider.getCmtkSetup();
    const result = await provider.connectCmtkMachine({ entityId: "entity-1", machineName: "CMTK Demo Rig", description: "Lab 2" });

    expect(setup.configured).toBe(true);
    expect(result.connection.success).toBe(false);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("http://api.test/api/v1/cmtk/setup");
    const [connectUrl, connectInit] = vi.mocked(fetch).mock.calls[1];
    expect(connectUrl).toBe("http://api.test/api/v1/cmtk/connect");
    expect(connectInit?.method).toBe("POST");
    expect(JSON.parse(String(connectInit?.body))).toEqual({ entityId: "entity-1", machineName: "CMTK Demo Rig", description: "Lab 2" });
    expect(new Headers(connectInit?.headers).get("Authorization")).toBeNull();
  });

  it("builds listMachines query parameters without exposing the HttpOnly auth token", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const provider = new FastApiDigitalTwinProvider("http://api.test");

    await provider.listMachines({
      search: "Machine C",
      line: "Line 3",
      status: "risk",
      sortBy: "risk",
      sortDirection: "desc",
      authorizedForUserId: "user-002",
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(
      "http://api.test/api/v1/catalog/machines?search=Machine+C&line=Line+3&status=risk&sort_by=risk&sort_direction=desc&authorized_for_user_id=user-002",
    );
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
    expect(init?.credentials).toBe("same-origin");
  });

  it("uses server-managed chat credentials without sending secret headers", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ thread: {}, messages: [] }), {
        status: 200,
      }),
    );
    const provider = new FastApiDigitalTwinProvider("");

    await provider.sendMessage({
      threadId: "thread-1",
      userId: "user-002",
      text: "Check Machine C",
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.has("X-API-Key")).toBe(false);
    expect(headers.has("X-LLM-Provider")).toBe(false);
  });

  it("updates the shared AI Assistant configuration through the admin endpoint", async () => {
    document.cookie = "pmdt_session=token-admin; path=/";
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: "deepseek",
          hasApiKey: true,
          updatedAt: "2026-09-19T00:00:00Z",
        }),
        { status: 200 },
      ),
    );
    const provider = new FastApiDigitalTwinProvider("");

    const result = await provider.updateLlmConfiguration({
      provider: "deepseek",
      apiKey: "shared-secret-key",
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/admin/ai-assistant");
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(
      JSON.stringify({ provider: "deepseek", apiKey: "shared-secret-key" }),
    );
    expect(result).toEqual({
      provider: "deepseek",
      hasApiKey: true,
      updatedAt: "2026-09-19T00:00:00Z",
    });
  });

  it("requests a bounded telemetry window and forwards cancellation", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ legacyMachineId: "machine-c" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        points: [],
        provenance: {
          outputSources: ["historical-machine-data"],
          basisSources: [],
          evidence: [],
        },
      }), { status: 200 }));
    const provider = new FastApiDigitalTwinProvider("http://api.test");
    const controller = new AbortController();

    const series = await provider.getMachineTelemetry("machine-c", {
      limit: 50,
      signal: controller.signal,
    });

    const [url, init] = vi.mocked(fetch).mock.calls[1];
    expect(url).toBe(
      "http://api.test/api/v1/machines/machine-c/telemetry?limit=50",
    );
    expect(init?.signal).toBe(controller.signal);
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
    expect(series.provenance?.outputSources).toEqual([
      "historical-machine-data",
    ]);
  });

  it("loads persisted entity telemetry for the selected simulator session", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const provider = new FastApiDigitalTwinProvider("http://api.test");

    await provider.listEntityTelemetry("entity-1", {
      sessionId: "run-3",
      limit: 60,
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(
      "http://api.test/api/v1/entities/entity-1/telemetry?sessionId=run-3&limit=60",
    );
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
  });

  it("requests model readiness with authentication and forwards cancellation", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ legacyMachineId: "machine-c" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          machineId: "machine-c",
          profileId: "machine-c-forecast-v1",
          state: "collecting-data",
          canInfer: false,
          summary: "Collecting data",
          reason: "Prediction will start when the input window is complete and valid.",
          nextAction: "Collect 720 more observations.",
          evaluatedAt: "2026-08-12T10:00:00Z",
          latestSampleAt: "2026-08-12T09:59:59Z",
          progress: null,
          sensors: [],
          checks: null,
        }),
        { status: 200 },
      ));
    const provider = new FastApiDigitalTwinProvider("http://api.test");
    const controller = new AbortController();

    await provider.getModelReadiness("machine-c", {
      signal: controller.signal,
    });

    const [url, init] = vi.mocked(fetch).mock.calls[1];
    expect(url).toBe(
      "http://api.test/api/v1/machines/machine-c/model-readiness",
    );
    expect(init?.signal).toBe(controller.signal);
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
  });

  it("uploads entity CSV telemetry without replacing its media type", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          batchId: "batch-1",
          entityId: "entity-1",
          source: "csv",
          status: "completed",
          schemaVersion: 2,
          submittedRows: 1,
          insertedRows: 1,
          duplicateRows: 0,
          errors: [],
          createdAt: "2026-08-20T00:00:00Z",
          replayed: false,
        }),
        { status: 201 },
      ),
    );
    const provider = new FastApiDigitalTwinProvider("http://api.test");

    await provider.uploadEntityTelemetryCsv(
      "entity-1",
      "timestamp,session_id,temp\n2026-08-20T00:00:00Z,s-1,4",
      { schemaVersion: 2, idempotencyKey: "file-key" },
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe(
      "http://api.test/api/v1/entities/entity-1/telemetry/csv?schemaVersion=2&idempotencyKey=file-key",
    );
    expect(headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(headers.get("Authorization")).toBeNull();
  });

  it("inspects and ingests a mapped CSV data source", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fileName: "pump.csv",
            rowCount: 1,
            columns: [],
            errors: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            batchId: "batch-1",
            entityId: "entity-1",
            source: "csv",
            status: "completed",
            schemaVersion: 1,
            submittedRows: 1,
            insertedRows: 1,
            duplicateRows: 0,
            errors: [],
            createdAt: "2026-08-23T00:00:00Z",
            replayed: false,
          }),
          { status: 201 },
        ),
      );
    const provider = new FastApiDigitalTwinProvider("http://api.test");
    const csv = "time,run,temp\n2026-08-23T00:00:00Z,a,4";

    await provider.inspectEntityTelemetryCsv("entity-1", "pump.csv", csv);
    await provider.createEntityCsvDataSource("entity-1", csv, {
      sourceName: "Historian export",
      fileName: "pump.csv",
      capabilities: ["simulate"],
      timestampColumn: "time",
      sessionColumn: "run",
      featureColumns: ["temp"],
      idempotencyKey: "pump-1",
    });

    const [inspectUrl, inspectInit] = vi.mocked(fetch).mock.calls[0];
    expect(inspectUrl).toBe(
      "http://api.test/api/v1/entities/entity-1/data-sources/csv/inspect?fileName=pump.csv",
    );
    expect(new Headers(inspectInit?.headers).get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    const [ingestUrl] = vi.mocked(fetch).mock.calls[1];
    expect(String(ingestUrl)).toContain(
      "/data-sources/csv?sourceName=Historian+export&fileName=pump.csv",
    );
    expect(String(ingestUrl)).toContain("featureColumn=temp");
    expect(String(ingestUrl)).toContain("capability=simulate");
  });

  it("creates and tests an MQTT source through authenticated endpoints", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "mqtt-1" }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            message: "Connected",
            testedAt: "2026-08-23T00:00:00Z",
          }),
          { status: 200 },
        ),
      );
    const provider = new FastApiDigitalTwinProvider("http://api.test");

    await provider.createEntityMqttDataSource("entity-1", {
      name: "Plant broker",
      brokerHost: "mqtt.internal",
      brokerPort: 8883,
      topic: "plant/machine",
      tls: true,
      username: "device",
      password: "secret",
      timestampField: "time",
      sessionField: "shift",
      featureMappings: { temp: "temperature" },
    });
    await provider.testEntityMqttDataSource("entity-1", "mqtt-1");

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      "http://api.test/api/v1/entities/entity-1/data-sources/mqtt",
    );
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      "http://api.test/api/v1/entities/entity-1/data-sources/mqtt/mqtt-1/test",
    );
    expect(
      new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers).get("Authorization"),
    ).toBeNull();
  });

  it("previews and builds the exact approved preprocessing recipe", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    const recipe = {
      objective: "forecast" as const,
      featureNames: ["temperature"],
      splitStrategy: "chronological" as const,
      testFraction: 0.2,
      seed: 42,
      missingStrategy: "median" as const,
      outlierClipping: true,
      iqrMultiplier: 1.5,
      scaler: "robust" as const,
      categoricalFeatures: [],
      derivedFeatures: [],
      categoricalMissingStrategy: "none" as const,
      unknownCategoryPolicy: "error" as const,
      columnTypes: {},
      target: null,
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ recipe, recipeDigest: "sha256:abc" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "dataset-1", status: "building" }), { status: 202 }),
      );
    const provider = new FastApiDigitalTwinProvider("http://api.test");

    await provider.previewEntityPreprocessing("entity-1", recipe);
    await provider.createEntityPreparedDataset("entity-1", {
      recipe,
      recipeDigest: "sha256:abc",
      sourceBoundaryDigest: "sha256:boundary",
    });

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      "http://api.test/api/v1/entities/entity-1/preprocessing/preview",
    );
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      "http://api.test/api/v1/entities/entity-1/datasets/prepared",
    );
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toEqual({
      recipe,
      recipeDigest: "sha256:abc",
      sourceBoundaryDigest: "sha256:boundary",
    });
  });

  it("uploads a managed machine image with its real media type", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "entity-1" }), { status: 200 }),
    );
    const provider = new FastApiDigitalTwinProvider("http://api.test");
    const image = new File(["image-bytes"], "pump.webp", {
      type: "image/webp",
    });

    await provider.uploadEntityImage("entity-1", image);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe("http://api.test/api/v1/entities/entity-1/image");
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(image);
    expect(headers.get("Content-Type")).toBe("image/webp");
    expect(headers.get("Authorization")).toBeNull();
  });

  it("creates immutable entity dataset versions through the provider contract", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "dataset-1",
          entityId: "entity-1",
          datasetVersion: 1,
          capability: "predict",
          schemaVersion: 2,
          selectedSessions: [],
          labelSelection: ["label-1"],
          windowConfig: { samplingIntervalSeconds: 1, contextWindowSeconds: 60 },
          status: "ready",
          rowCount: 500,
          labelClassCounts: { bearing: 5 },
          contentDigest: "sha256:abc",
          createdByUserId: "user-1",
          createdAt: "2026-08-20T00:00:00Z",
        }),
        { status: 201 },
      ),
    );
    const provider = new FastApiDigitalTwinProvider("http://api.test");

    await provider.createEntityDatasetVersion("entity-1", {
      capability: "predict",
      labelIds: ["label-1"],
      windowConfig: { samplingIntervalSeconds: 1, contextWindowSeconds: 60 },
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://api.test/api/v1/entities/entity-1/datasets");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      capability: "predict",
      labelIds: ["label-1"],
      windowConfig: { samplingIntervalSeconds: 1, contextWindowSeconds: 60 },
    });
  });

  it("submits training runs and preserves raw ONNX uploads", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "run-1" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "run-2" }), { status: 201 }));
    const provider = new FastApiDigitalTwinProvider("http://api.test");

    await provider.createEntityTrainingRun("entity-1", {
      datasetVersionId: "dataset-1",
      architecture: "gru",
      hyperparameters: { epochs: 25 },
    });
    let [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://api.test/api/v1/entities/entity-1/training/runs");
    expect(JSON.parse(String(init?.body))).toEqual({ datasetVersionId: "dataset-1", architecture: "gru", hyperparameters: { epochs: 25 } });

    const model = new Uint8Array([8, 1, 18, 0]).buffer;
    await provider.importEntityOnnxModel("entity-1", model, {
      datasetVersionId: "dataset-1",
    });
    [url, init] = vi.mocked(fetch).mock.calls[1];
    expect(String(url)).toContain("/api/v1/entities/entity-1/models/import?");
    expect(String(url)).toContain("datasetVersionId=dataset-1");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/onnx");
    expect(init?.body).toBe(model);
  });

  it("validates versioned training configuration without launching a run", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ valid: true, errors: {} }), { status: 200 }));
    const provider = new FastApiDigitalTwinProvider("http://api.test");

    await provider.validateEntityTrainingConfiguration("entity-1", {
      schemaVersion: 1,
      architecture: "gru",
      hyperparameters: { epochs: 25 },
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://api.test/api/v1/entities/entity-1/training/configuration/validate");
    expect(init?.method).toBe("POST");
  });

  it("uses the production inference and serving operations contracts", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ entityId: "entity-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "downtime-1" }), { status: 200 }));
    const provider = new FastApiDigitalTwinProvider("http://api.test");

    await provider.runEntityInference("entity-1", "predict", { sessionId: "shift-7", limit: 120 });
    await provider.listEntityModelAlerts("all");
    await provider.resolveEntityModelAlert("entity-1", "alert-1");
    await provider.listEntityDowntimeConfig("entity-1");
    await provider.upsertEntityDowntimeConfig("entity-1", "bearing wear", 4.5);

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "http://api.test/api/v1/entities/entity-1/inference/predict",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ sessionId: "shift-7", limit: 120 }) }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://api.test/api/v1/entities/alerts/models?status=all",
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "http://api.test/api/v1/entities/entity-1/model-alerts/alert-1/resolve",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "http://api.test/api/v1/entities/entity-1/downtime-config",
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "http://api.test/api/v1/entities/entity-1/downtime-config/bearing%20wear",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ baseHours: 4.5 }) }),
    );
  });

  it("discovers authorized current generic models for Simulator", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const provider = new FastApiDigitalTwinProvider("http://api.test");
    await provider.listSimulatorEntityModels();
    expect(fetch).toHaveBeenCalledWith(
      "http://api.test/api/v1/entities/simulator/models",
      expect.any(Object),
    );
  });

  it("returns undefined for no-content responses", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    const provider = new FastApiDigitalTwinProvider("");

    await expect(provider.logout("token-user")).resolves.toBeUndefined();
  });

  it("throws a descriptive error for failed API responses", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("Nope", { status: 403 }),
    );
    const provider = new FastApiDigitalTwinProvider("");

    const failure = await provider.listUsers().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      message: "The service could not complete the request.",
      status: 403,
      path: "/api/v1/users",
      rawBody: "Nope",
    });
  });

  // A thread runs one turn at a time, and the backend answers an overlapping
  // send with 409. The chat surfaces that as "still answering", not as a
  // failure, so the distinction has to survive the trip through the provider.
  it("raises a 409 from the stream before any events are read", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ detail: "still working on the previous message" }), {
        status: 409,
      }),
    );
    const provider = new FastApiDigitalTwinProvider("");
    const events: unknown[] = [];

    const failure = await provider
      .sendMessageStreamed(
        { threadId: "t-1", userId: "user-002", text: "second question" },
        (event) => events.push(event),
      )
      .catch((error: unknown) => error);

    expect(isThreadBusy(failure)).toBe(true);
    expect(events).toEqual([]);
  });

  it("does not mistake other failures for a busy thread", () => {
    expect(isThreadBusy(new ApiError({ status: 404, detail: "gone" }))).toBe(false);
    expect(isThreadBusy(new Error("network down"))).toBe(false);
    expect(isThreadBusy(undefined)).toBe(false);
  });
  it("starts, stops and lists MQTT recordings through the entity API", async () => {
    const recording = { id: "rec-1", entityId: "pump", status: "recording" };
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(recording), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...recording, status: "stopped" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([recording]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(recording), { status: 200 }));
    const provider = new FastApiDigitalTwinProvider("http://api.test");

    await provider.startEntityRecording("pump", "src-1", { recordingName: "Run A", recordingLabel: "normal", maxMinutes: 30 });
    const stopped = await provider.stopEntityRecording("pump", "rec-1");
    await provider.listEntityRecordings("pump", { sourceId: "src-1" });
    await provider.getEntityRecording("pump", "rec-1");

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls[0][0]).toBe("http://api.test/api/v1/entities/pump/data-sources/mqtt/src-1/recordings");
    expect(calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ recordingName: "Run A", recordingLabel: "normal", maxMinutes: 30 });
    expect(calls[1][0]).toBe("http://api.test/api/v1/entities/pump/recordings/rec-1/stop");
    expect(calls[1][1]?.method).toBe("POST");
    expect(stopped.status).toBe("stopped");
    expect(calls[2][0]).toBe("http://api.test/api/v1/entities/pump/recordings?sourceId=src-1");
    expect(calls[3][0]).toBe("http://api.test/api/v1/entities/pump/recordings/rec-1");
  });

  it("builds a same-origin telemetry CSV link with only the filters given", () => {
    const provider = new FastApiDigitalTwinProvider("");
    expect(provider.entityTelemetryCsvUrl("pump", { recordingId: "rec-1" })).toBe(
      "/api/v1/entities/pump/telemetry.csv?recordingId=rec-1",
    );
    expect(provider.entityTelemetryCsvUrl("pump", {
      start: "2026-09-01T00:00:00Z", end: "2026-09-02T00:00:00Z", sessionId: "run 7", sourceId: "",
    })).toBe(
      "/api/v1/entities/pump/telemetry.csv?start=2026-09-01T00%3A00%3A00Z&end=2026-09-02T00%3A00%3A00Z&sessionId=run+7",
    );
  });
});
