import type {
  MachineSimulationSchema,
  MachineSummary,
  MachineTypeId,
  SimulationParameterDefinition,
  SimulationParameterOption,
  SimulationParameterType,
  SimulationParameterValue,
} from "@/lib/domain/types";
import { getSimulationSchemaForMachineType } from "@/lib/simulation/schemas";

const DEFAULT_CATEGORY = "Operating Conditions";
const supportedParameterTypes = new Set<SimulationParameterType>([
  "number",
  "text",
  "select",
  "boolean",
]);

export type ResolvedSimulationParameterDefinition = Omit<
  SimulationParameterDefinition,
  "label" | "required" | "category" | "displayOrder" | "advanced"
> & {
  label: string;
  required: boolean;
  category: string;
  displayOrder: number;
  advanced: boolean;
};

export type ResolvedMachineSimulationSchema = Omit<
  MachineSimulationSchema,
  "parameters"
> & {
  parameters: ResolvedSimulationParameterDefinition[];
};

export type MachineSimulationSchemaResolution = {
  machineType: MachineTypeId | null;
  schema: ResolvedMachineSimulationSchema | null;
  status: "no-machine" | "unknown-machine-type" | "no-parameters" | "ready";
  warnings: string[];
};

function prettifyKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function sanitizeOptions(options?: SimulationParameterOption[]) {
  if (!options?.length) {
    return undefined;
  }

  const seen = new Set<string>();
  const sanitized: SimulationParameterOption[] = [];

  for (const option of options) {
    const value = option?.value?.trim();

    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    sanitized.push({
      value,
      label: option.label?.trim() || prettifyKey(value),
      description: option.description?.trim() || undefined,
    });
  }

  return sanitized.length > 0 ? sanitized : undefined;
}

function sanitizeDefaultValue(
  parameter: SimulationParameterDefinition,
  options?: SimulationParameterOption[],
): SimulationParameterValue | undefined {
  const value = parameter.defaultValue;

  if (value === undefined) {
    return undefined;
  }

  if (parameter.type === "boolean") {
    return typeof value === "boolean" ? value : undefined;
  }

  if (parameter.type === "number") {
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : undefined;
  }

  if (parameter.type === "select") {
    if (
      typeof value !== "string" ||
      !options?.some((option) => option.value === value)
    ) {
      return undefined;
    }

    return value;
  }

  return typeof value === "string" ? value : undefined;
}

function sanitizeParameter(
  parameter: SimulationParameterDefinition,
  index: number,
): ResolvedSimulationParameterDefinition | null {
  const key = parameter.key?.trim();

  if (!key || !supportedParameterTypes.has(parameter.type)) {
    return null;
  }

  const options = sanitizeOptions(parameter.options);

  if (parameter.type === "select" && !options) {
    return null;
  }

  const min =
    parameter.type === "number" && Number.isFinite(parameter.min)
      ? Number(parameter.min)
      : undefined;
  const max =
    parameter.type === "number" && Number.isFinite(parameter.max)
      ? Number(parameter.max)
      : undefined;
  const normalizedMin =
    min !== undefined && max !== undefined ? Math.min(min, max) : min;
  const normalizedMax =
    min !== undefined && max !== undefined ? Math.max(min, max) : max;
  const step =
    parameter.type === "number" &&
    Number.isFinite(parameter.step) &&
    Number(parameter.step) > 0
      ? Number(parameter.step)
      : undefined;

  return {
    ...parameter,
    key,
    label: parameter.label?.trim() || prettifyKey(key),
    required: parameter.required ?? false,
    category: parameter.category?.trim() || DEFAULT_CATEGORY,
    displayOrder:
      Number.isFinite(parameter.displayOrder) &&
      parameter.displayOrder !== undefined
        ? Number(parameter.displayOrder)
        : index,
    advanced: parameter.advanced ?? false,
    min: normalizedMin,
    max: normalizedMax,
    step,
    options,
    defaultValue: sanitizeDefaultValue(parameter, options),
  };
}

export function inferMachineTypeFromModel(
  model?: string | null,
): MachineTypeId | null {
  const normalizedModel = model?.trim().toUpperCase();

  if (!normalizedModel) {
    return null;
  }

  if (
    normalizedModel.includes("AI4I") ||
    normalizedModel.startsWith("CMTK-VIB")
  ) {
    return "ai4i";
  }

  if (
    normalizedModel.includes("CLIENT SENSOR") ||
    normalizedModel.includes("SENSOR DATASET") ||
    normalizedModel.startsWith("ROT")
  ) {
    return "sensor";
  }

  if (
    normalizedModel.includes("KAGGLE") ||
    normalizedModel.includes("REAL SENSOR") ||
    normalizedModel.includes("3-AXIS") ||
    normalizedModel.startsWith("PKG")
  ) {
    return "real-sensor";
  }

  return null;
}

export function resolveMachineSimulationSchema(
  machine?: Pick<
    MachineSummary,
    "model" | "machineType" | "simulationSchema"
  > | null,
): MachineSimulationSchemaResolution {
  if (!machine) {
    return {
      machineType: null,
      schema: null,
      status: "no-machine",
      warnings: [],
    };
  }

  const inferredMachineType =
    machine.machineType ?? inferMachineTypeFromModel(machine.model);
  const providedSchema = machine.simulationSchema ?? null;
  const schemaMachineType = providedSchema
    ? providedSchema.machineType
    : inferredMachineType;
  const schemaSource =
    providedSchema ?? getSimulationSchemaForMachineType(schemaMachineType);

  if (!schemaSource) {
    return {
      machineType: inferredMachineType,
      schema: null,
      status: "unknown-machine-type",
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const seenKeys = new Set<string>();
  const parameters: ResolvedSimulationParameterDefinition[] = [];

  for (const [index, parameter] of schemaSource.parameters.entries()) {
    const sanitized = sanitizeParameter(parameter, index);

    if (!sanitized) {
      warnings.push(
        parameter.key
          ? `Unsupported or incomplete metadata skipped for "${parameter.key}".`
          : "Unsupported or incomplete parameter metadata was skipped.",
      );
      continue;
    }

    if (seenKeys.has(sanitized.key)) {
      warnings.push(
        `Duplicate simulation parameter "${sanitized.key}" was ignored.`,
      );
      continue;
    }

    seenKeys.add(sanitized.key);
    parameters.push(sanitized);
  }

  const sortedParameters = [...parameters].sort((left, right) => {
    if (left.displayOrder !== right.displayOrder) {
      return left.displayOrder - right.displayOrder;
    }

    return left.label.localeCompare(right.label);
  });

  if (sortedParameters.length === 0) {
    return {
      machineType: schemaSource.machineType,
      schema: {
        ...schemaSource,
        parameters: [],
      },
      status: "no-parameters",
      warnings,
    };
  }

  return {
    machineType: schemaSource.machineType,
    schema: {
      ...schemaSource,
      parameters: sortedParameters,
    },
    status: "ready",
    warnings,
  };
}

export function splitSimulationParameters(
  parameters: ResolvedSimulationParameterDefinition[],
) {
  const groups = new Map<
    string,
    {
      basic: ResolvedSimulationParameterDefinition[];
      advanced: ResolvedSimulationParameterDefinition[];
    }
  >();

  for (const parameter of parameters) {
    const group = groups.get(parameter.category) ?? {
      basic: [],
      advanced: [],
    };

    if (parameter.advanced) {
      group.advanced.push(parameter);
    } else {
      group.basic.push(parameter);
    }

    groups.set(parameter.category, group);
  }

  return Array.from(groups.entries()).map(([category, groupedParameters]) => ({
    category,
    basic: groupedParameters.basic,
    advanced: groupedParameters.advanced,
  }));
}
