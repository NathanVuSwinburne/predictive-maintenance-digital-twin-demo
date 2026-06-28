import type {
  MachineTypeId,
  SimulationParameterValue,
  SimulationScenarioInput,
} from "@/lib/domain/types";
import type {
  ResolvedMachineSimulationSchema,
  ResolvedSimulationParameterDefinition,
} from "@/lib/simulation/resolver";

export type SimulationParameterDraftValue = string | boolean;

export type SimulationParameterDraftValues = Record<
  string,
  SimulationParameterDraftValue
>;

export type SimulationValidationResult = {
  errors: Record<string, string>;
  parsedParameters: Record<string, SimulationParameterValue>;
  isValid: boolean;
};

function isCompatibleDraftValue(
  parameter: ResolvedSimulationParameterDefinition,
  value: SimulationParameterDraftValue | undefined,
) {
  if (parameter.type === "boolean") {
    return typeof value === "boolean";
  }

  return typeof value === "string";
}

function toDraftValue(
  parameter: ResolvedSimulationParameterDefinition,
): SimulationParameterDraftValue {
  if (parameter.type === "boolean") {
    return typeof parameter.defaultValue === "boolean"
      ? parameter.defaultValue
      : false;
  }

  if (parameter.defaultValue === undefined) {
    return "";
  }

  return String(parameter.defaultValue);
}

function countStepDecimals(step: number) {
  const decimals = `${step}`.split(".")[1];
  return decimals?.length ?? 0;
}

function isStepAligned(value: number, step: number, min?: number) {
  const base = min ?? 0;
  const quotient = (value - base) / step;
  return Math.abs(quotient - Math.round(quotient)) < 1e-9;
}

export function createSimulationDraftValues(
  schema: ResolvedMachineSimulationSchema | null,
  currentValues?: SimulationParameterDraftValues,
): SimulationParameterDraftValues {
  if (!schema) {
    return {};
  }

  return Object.fromEntries(
    schema.parameters.map((parameter) => {
      const currentValue = currentValues?.[parameter.key];

      if (isCompatibleDraftValue(parameter, currentValue)) {
        if (
          parameter.type === "select" &&
          typeof currentValue === "string" &&
          currentValue !== "" &&
          !parameter.options?.some((option) => option.value === currentValue)
        ) {
          return [parameter.key, toDraftValue(parameter)];
        }

        return [parameter.key, currentValue];
      }

      return [parameter.key, toDraftValue(parameter)];
    }),
  ) as SimulationParameterDraftValues;
}

export function validateSimulationDraftValues(
  schema: ResolvedMachineSimulationSchema | null,
  values: SimulationParameterDraftValues,
): SimulationValidationResult {
  if (!schema) {
    return {
      errors: {},
      parsedParameters: {},
      isValid: false,
    };
  }

  const errors: Record<string, string> = {};
  const parsedParameters: Record<string, SimulationParameterValue> = {};

  for (const parameter of schema.parameters) {
    const rawValue = values[parameter.key];

    if (parameter.type === "boolean") {
      parsedParameters[parameter.key] =
        typeof rawValue === "boolean" ? rawValue : false;
      continue;
    }

    const normalizedValue = typeof rawValue === "string" ? rawValue.trim() : "";

    if (!normalizedValue) {
      if (parameter.required) {
        errors[parameter.key] = `${parameter.label} is required.`;
      }
      continue;
    }

    if (parameter.type === "text") {
      parsedParameters[parameter.key] = normalizedValue;
      continue;
    }

    if (parameter.type === "select") {
      if (
        !parameter.options?.some((option) => option.value === normalizedValue)
      ) {
        errors[parameter.key] = `Select a valid value for ${parameter.label}.`;
        continue;
      }

      parsedParameters[parameter.key] = normalizedValue;
      continue;
    }

    const parsedNumber = Number(normalizedValue);

    if (!Number.isFinite(parsedNumber)) {
      errors[parameter.key] = `${parameter.label} must be a valid number.`;
      continue;
    }

    if (parameter.min !== undefined && parsedNumber < parameter.min) {
      errors[parameter.key] =
        `${parameter.label} must be at least ${parameter.min}.`;
      continue;
    }

    if (parameter.max !== undefined && parsedNumber > parameter.max) {
      errors[parameter.key] =
        `${parameter.label} must be at most ${parameter.max}.`;
      continue;
    }

    if (
      parameter.step !== undefined &&
      !isStepAligned(parsedNumber, parameter.step, parameter.min)
    ) {
      errors[parameter.key] =
        `${parameter.label} must increase in steps of ${parameter.step}.`;
      continue;
    }

    const decimals = parameter.step
      ? countStepDecimals(parameter.step)
      : undefined;
    parsedParameters[parameter.key] =
      decimals !== undefined
        ? Number(parsedNumber.toFixed(decimals))
        : parsedNumber;
  }

  return {
    errors,
    parsedParameters,
    isValid: Object.keys(errors).length === 0,
  };
}

export function buildSimulationScenarioInput(args: {
  machineId: string;
  scenarioName: string;
  machineType?: MachineTypeId | null;
  simulationHorizonMinutes?: number;
  schema: ResolvedMachineSimulationSchema | null;
  values: SimulationParameterDraftValues;
}) {
  const validation = validateSimulationDraftValues(args.schema, args.values);
  const parsedSessionId = Number(validation.parsedParameters.sessionId);

  const payload: SimulationScenarioInput | null =
    args.machineId.trim() &&
    args.scenarioName.trim() &&
    args.schema &&
    validation.isValid &&
    Number.isFinite(parsedSessionId)
      ? {
          machineId: args.machineId,
          scenarioName: args.scenarioName.trim(),
          sessionId: parsedSessionId,
          machineType: args.machineType ?? args.schema.machineType,
          simulationHorizonMinutes: args.simulationHorizonMinutes,
          parameters: validation.parsedParameters,
        }
      : null;

  return {
    payload,
    validation,
  };
}
