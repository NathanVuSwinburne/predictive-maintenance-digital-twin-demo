import { describe, expect, it } from "vitest";

import {
  shouldLoadLegacySession,
  simulatorSelectorOptions,
} from "@/lib/domain/simulator-selection";
import type { SimulatorEntityOption } from "@/lib/domain/types";

function option(
  entityId: string,
  reasonCodes: string[] = [],
): SimulatorEntityOption {
  return {
    entityId,
    machineName: entityId,
    imageUrl: null,
    schemaVersion: 1,
    eligible: reasonCodes.length === 0,
    reasonCodes,
    readiness: { availableContextRows: 10, requiredContextRows: 1, availableSessions: 1 },
    inputFeatures: [],
    outputFeatures: [],
    sessionIds: [],
    productionModel: null,
    horizonMin: 1,
    horizonMax: 10,
    uncertaintySupported: false,
  };
}

describe("simulator runtime selection", () => {
  it("uses simulator eligibility as the sole selector source", () => {
    expect(simulatorSelectorOptions([
      option("generic-ready"),
      option("generic-setup", ["NO_PRODUCTION_MODEL"]),
      option("predict-only", ["NO_SIMULATE_CAPABILITY"]),
    ])).toEqual([
      { id: "generic-ready", name: "generic-ready", eligible: true },
      { id: "generic-setup", name: "generic-setup", eligible: false },
    ]);
  });

  it("never loads a legacy session for a generic entity with stale session state", () => {
    expect(shouldLoadLegacySession(
      "generic-ready",
      "7",
      false,
      ["entity-machine-c"],
    )).toBe(false);
  });

  it("loads a legacy session only for an explicitly enabled bound legacy entity", () => {
    expect(shouldLoadLegacySession(
      "entity-machine-c",
      "7",
      true,
      ["entity-machine-c"],
    )).toBe(true);
  });
});
