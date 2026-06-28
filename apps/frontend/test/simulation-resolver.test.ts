import { describe, expect, it } from "vitest";

import {
  inferMachineTypeFromModel,
  resolveMachineSimulationSchema,
  splitSimulationParameters,
} from "@/lib/simulation/resolver";

describe("simulation schema resolver", () => {
  it("infers supported machine types from model names", () => {
    expect(inferMachineTypeFromModel("AI4I Production Machine")).toBe("ai4i");
    expect(inferMachineTypeFromModel("Client sensor dataset")).toBe("sensor");
    expect(inferMachineTypeFromModel("Kaggle 3-axis accelerometer")).toBe(
      "real-sensor",
    );
    expect(inferMachineTypeFromModel("Unknown")).toBeNull();
  });

  it("sanitizes, deduplicates, and sorts provided schema parameters", () => {
    const resolution = resolveMachineSimulationSchema({
      model: "Custom model",
      machineType: "custom",
      simulationSchema: {
        machineType: "custom",
        title: "Custom",
        parameters: [
          {
            key: " mode ",
            type: "select",
            displayOrder: 2,
            options: [
              { value: "baseline", label: "" },
              { value: "baseline", label: "Duplicate" },
            ],
            defaultValue: "baseline",
          },
          {
            key: "load",
            type: "number",
            min: 100,
            max: 10,
            step: -1,
            displayOrder: 1,
            defaultValue: 42,
          },
          {
            key: "load",
            type: "number",
          },
          {
            key: "bad-select",
            type: "select",
          },
        ],
      },
    });

    expect(resolution.status).toBe("ready");
    expect(resolution.warnings).toEqual([
      'Duplicate simulation parameter "load" was ignored.',
      'Unsupported or incomplete metadata skipped for "bad-select".',
    ]);
    expect(resolution.schema?.parameters.map((parameter) => parameter.key)).toEqual([
      "load",
      "mode",
    ]);
    expect(resolution.schema?.parameters[0]).toMatchObject({
      key: "load",
      label: "Load",
      min: 10,
      max: 100,
      step: undefined,
      defaultValue: 42,
    });
    expect(resolution.schema?.parameters[1].options).toEqual([
      { value: "baseline", label: "Baseline", description: undefined },
    ]);
  });

  it("splits basic and advanced parameters by category", () => {
    const resolution = resolveMachineSimulationSchema({
      model: "Custom model",
      machineType: "custom",
      simulationSchema: {
        machineType: "custom",
        parameters: [
          { key: "load", type: "number", category: "Inputs" },
          {
            key: "advancedLoad",
            type: "number",
            category: "Inputs",
            advanced: true,
          },
        ],
      },
    });

    expect(splitSimulationParameters(resolution.schema?.parameters ?? [])).toEqual([
      {
        category: "Inputs",
        basic: [expect.objectContaining({ key: "load" })],
        advanced: [expect.objectContaining({ key: "advancedLoad" })],
      },
    ]);
  });
});
