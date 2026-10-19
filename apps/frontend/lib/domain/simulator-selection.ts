import type { SimulatorEntityOption } from "@/lib/domain/types";

export type SimulatorSelectorOption = {
  id: string;
  name: string;
  eligible: boolean;
};

export function simulatorSelectorOptions(
  entities: readonly SimulatorEntityOption[],
): SimulatorSelectorOption[] {
  return entities
    .filter((entity) => !entity.reasonCodes.includes("NO_SIMULATE_CAPABILITY"))
    .map((entity) => ({
      id: entity.entityId,
      name: entity.machineName,
      eligible: entity.eligible,
    }));
}

export function shouldLoadLegacySession(
  entityId: string,
  sessionId: unknown,
  legacyEnabled: boolean,
  legacyEntityIds: readonly string[],
): boolean {
  const parsedSessionId = Number(sessionId);
  return Boolean(
    legacyEnabled &&
      legacyEntityIds.includes(entityId) &&
      Number.isFinite(parsedSessionId) &&
      parsedSessionId > 0,
  );
}
