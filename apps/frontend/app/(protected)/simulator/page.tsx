"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  PlayIcon,
  SpinnerIcon,
  TrendDownIcon,
  TrendUpIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/auth-context";
import { ErrorNotice } from "@/components/feedback/error-notice";
import { NoMachineAccessState } from "@/components/machines/no-machine-access-state";
import { SchemaDrivenSimulator } from "@/components/simulator/schema-driven-simulator";
import { SimulationSessionMetadata } from "@/components/simulator/simulation-session-metadata";
import {
  SimulatorMachineSelector,
  type SimulatorMachineOption,
} from "@/components/simulator/simulator-machine-selector";
import {
  UnifiedPredictionPanel,
  hasPredictionPath,
  predictionCapableMachines,
} from "@/components/simulator/unified-prediction-panel";
import { SimulationMachineFields } from "@/components/simulator/simulation-machine-fields";
import { SimulationParameterSections } from "@/components/simulator/simulation-parameter-sections";
import { SimulationParameterState } from "@/components/simulator/simulation-parameter-state";
import { useSimulationRunStatus } from "@/components/simulator/simulation-run-status-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDataProvider } from "@/hooks/use-data-provider";
import {
  badgeVariantForSeverity,
  formatDateTime,
  usesVibrationLevelLabels,
} from "@/lib/domain/presentation";
import { formatInAppTimeZone } from "@/lib/time";
import {
  shouldLoadLegacySession,
  simulatorSelectorOptions,
} from "@/lib/domain/simulator-selection";
import type {
  CanonicalMachine,
  MachineSimulationSchema,
  SimulationConfig,
  SimulationSensorChartGroup,
  SimulationSessionPreview,
  SimulationRun,
  SimulatorEntityModel,
  SimulatorEntityOption,
} from "@/lib/domain/types";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";
import {
  createSimulationDraftValues,
  type SimulationParameterDraftValues,
  validateSimulationDraftValues,
} from "@/lib/simulation/form";
import {
  resolveMachineSimulationSchema,
  type MachineSimulationSchemaResolution,
} from "@/lib/simulation/resolver";

const simulationHorizons = [
  {
    value: "15-minutes",
    label: "15 minutes",
    description: "Short operating check",
  },
  {
    value: "30-minutes",
    label: "30 minutes",
    description: "Near-term production window",
  },
  {
    value: "1-hour",
    label: "1 hour",
    description: "Extended operating outlook",
  },
  {
    value: "4-hours",
    label: "4 hours",
    description: "Longer planning horizon",
  },
];

const simulationHorizonMinutesByValue: Record<string, number> = {
  "15-minutes": 15,
  "30-minutes": 30,
  "1-hour": 60,
  "4-hours": 240,
};

const simulationResultChartConfig = {
  temperatureActual: {
    label: "Temperature actual",
    color: "var(--chart-1)",
  },
  temperatureGenerated: {
    label: "Temperature simulated",
    color: "var(--chart-1)",
  },
  vibrationActual: {
    label: "Vibration actual",
    color: "var(--chart-2)",
  },
  vibrationGenerated: {
    label: "Vibration simulated",
    color: "var(--chart-2)",
  },
  vibrationXActual: {
    label: "Vibration X actual",
    color: "var(--chart-2)",
  },
  vibrationXGenerated: {
    label: "Vibration X simulated",
    color: "var(--chart-2)",
  },
  vibrationYActual: {
    label: "Vibration Y actual",
    color: "var(--chart-3)",
  },
  vibrationYGenerated: {
    label: "Vibration Y simulated",
    color: "var(--chart-3)",
  },
  vibrationZActual: {
    label: "Vibration Z actual",
    color: "var(--chart-4)",
  },
  vibrationZGenerated: {
    label: "Vibration Z simulated",
    color: "var(--chart-4)",
  },
  pressureActual: {
    label: "Pressure actual",
    color: "var(--chart-3)",
  },
  pressureGenerated: {
    label: "Pressure simulated",
    color: "var(--chart-3)",
  },
  powerActual: {
    label: "Power actual",
    color: "var(--chart-4)",
  },
  powerGenerated: {
    label: "Power simulated",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

function riskToSeverity(risk: number) {
  if (risk >= 80) {
    return "critical" as const;
  }

  if (risk >= 65) {
    return "high" as const;
  }

  if (risk >= 45) {
    return "medium" as const;
  }

  return "low" as const;
}

type StepTone = "primary" | "secondary" | "success";

function stepToneClasses(tone: StepTone) {
  if (tone === "secondary") {
    return {
      badge: "border-secondary bg-secondary text-secondary-foreground",
      card: "border-secondary/40 bg-secondary/5",
      text: "text-secondary",
    };
  }

  if (tone === "success") {
    return {
      badge: "border-success bg-success text-primary-foreground",
      card: "border-success/40 bg-success/5",
      text: "text-success",
    };
  }

  return {
    badge: "border-primary bg-primary text-primary-foreground",
    card: "border-primary/40 bg-primary/5",
    text: "text-primary",
  };
}

function StepHeader({
  step,
  title,
  description,
  tone = "primary",
  complete = false,
}: {
  step: number;
  title: string;
  description: string;
  tone?: StepTone;
  complete?: boolean;
}) {
  const toneClasses = stepToneClasses(tone);

  return (
    <div className="flex items-start gap-3">
      <div
        aria-label={complete ? "Completed step" : "Pending step"}
        className={`grid size-8 shrink-0 place-items-center border text-xs font-semibold ${toneClasses.badge}`}
      >
        {step}
      </div>
      <div className="min-w-0">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-sm">{description}</CardDescription>
      </div>
    </div>
  );
}

function PendingResultsPane() {
  return (
    <div className="flex flex-col gap-3 border border-dashed border-success/40 bg-background/70 p-4 text-muted-foreground">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <CheckCircleIcon />
        Results will appear after a simulation run
      </div>
      <p>
        Run a simulation to see generated future sensor data, the projected
        vibration level, the probability of high vibration, estimated
        downtime, and recommendations for action.
      </p>
    </div>
  );
}

/** Legacy Machine C runs report a vibration level (low/medium/high); older runs may not. */
function projectedVibrationLevel(run: SimulationRun) {
  return run.projectedLabel ?? "Not returned";
}

function labelForMachineType(
  resolution: MachineSimulationSchemaResolution,
  machine: CanonicalMachine | null,
) {
  const machineType = resolution.machineType ?? machine?.machineType;

  if (!machineType) {
    return null;
  }

  return machineType
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTelemetryTimestamp(
  timestamp?: string,
  options?: { includeSeconds?: boolean },
) {
  if (!timestamp) {
    return "-";
  }

  const parsed = new Date(timestamp);

  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  if (options?.includeSeconds) {
    return formatInAppTimeZone(parsed, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  return formatDateTime(timestamp);
}

function formatTelemetryNumber(value: number, decimals = 2) {
  return Number.isFinite(value) ? value.toFixed(decimals) : "-";
}

/**
 * Legacy Machine C `projectedRisk` is the classifier's probability of the HIGH
 * vibration level (×100), so these bands describe how likely high vibration is,
 * not failure risk.
 */
function labelForRisk(risk: number) {
  if (risk >= 80) {
    return "Very high";
  }

  if (risk >= 65) {
    return "High";
  }

  if (risk >= 45) {
    return "Medium";
  }

  return "Low";
}

function formatDowntime(hours: number) {
  const totalMinutes = Math.round(hours * 60);

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes ? `${wholeHours}h ${minutes}m` : `${wholeHours}h`;
}

function metricLabel(metric: string) {
  return metric
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getResultSensorFields(run: SimulationRun | null): string[] {
  const fields = run?.sensorFields ?? [];
  const priority = [
    "vibrationX",
    "vibrationY",
    "vibrationZ",
    "temperature",
    "vibration",
    "pressure",
    "power",
  ];

  return priority.filter((field) => fields.includes(field)).slice(0, 4);
}

function getResultSensorChartGroups(args: {
  run: SimulationRun | null;
  config: SimulationConfig | null;
  fields: string[];
}): SimulationSensorChartGroup[] {
  const availableFields = new Set(args.fields);
  const configuredGroups = args.run?.sensorChartGroups?.length
    ? args.run.sensorChartGroups
    : args.config?.sensorChartGroups;
  const groups = (configuredGroups ?? [])
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => availableFields.has(field)),
    }))
    .filter((group) => group.fields.length > 0);

  if (groups.length > 0) {
    return groups;
  }

  return args.fields.map((field) => ({
    id: field,
    label: metricLabel(field),
    fields: [field],
  }));
}

function chartAxisLabel(group: SimulationSensorChartGroup) {
  return group.unit ? `${group.label} (${group.unit})` : group.label;
}

function unitForSensorField(
  field: string,
  groups?: SimulationSensorChartGroup[] | null,
) {
  return groups?.find((group) => group.fields.includes(field))?.unit ?? null;
}

function metricHeaderLabel(
  field: string,
  groups?: SimulationSensorChartGroup[] | null,
) {
  const unit = unitForSensorField(field, groups);
  return unit ? `${metricLabel(field)} (${unit})` : metricLabel(field);
}

function sortReadingsByNewest<T extends { timestamp: string }>(readings: T[]) {
  return [...readings].sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();

    if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
      return b.timestamp.localeCompare(a.timestamp);
    }

    return bTime - aTime;
  });
}

function legendSensorLabel(dataKey: unknown) {
  return typeof dataKey === "string"
    ? metricLabel(dataKey.replace(/(Actual|Generated)$/, ""))
    : "Sensor";
}

function SensorChartLegend({
  payload,
}: {
  payload?: Array<{
    color?: string;
    dataKey?: unknown;
    type?: string;
  }>;
}) {
  const items = (payload ?? []).filter((item) => item.type !== "none");

  if (!items.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 pt-3 text-xs">
      {items.map((item) => (
        <div
          key={String(item.dataKey)}
          className="flex items-center gap-1.5 text-muted-foreground"
        >
          <div
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: item.color }}
          />
          <span>{legendSensorLabel(item.dataKey)}</span>
        </div>
      ))}
    </div>
  );
}

function samplePoints<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) {
    return points;
  }

  const sampled: T[] = [];
  const lastIndex = points.length - 1;

  for (let index = 0; index < maxPoints; index += 1) {
    const pointIndex = Math.round((index * lastIndex) / (maxPoints - 1));
    sampled.push(points[pointIndex]);
  }

  return sampled;
}

function buildComparisonChartData(args: {
  run: SimulationRun | null;
  fields: string[];
}) {
  const actualPoints = samplePoints(args.run?.sourceReadings ?? [], 8).map(
    (point) => {
      const row: Record<string, string | number | undefined> = {
        label: formatTelemetryTimestamp(point.timestamp, {
          includeSeconds: true,
        }),
        timestamp: point.timestamp,
        phase: "Actual source data",
      };

      for (const field of args.fields) {
        row[`${field}Actual`] = point.values[field];
        row[`${field}Generated`] = undefined;
      }

      return row;
    },
  );

  const generatedPoints = samplePoints(
    args.run?.generatedReadings ?? [],
    12,
  ).map((point) => {
    const row: Record<string, string | number | undefined> = {
      label: formatTelemetryTimestamp(point.timestamp, {
        includeSeconds: true,
      }),
      timestamp: point.timestamp,
      phase: "Generated future data",
    };

    for (const field of args.fields) {
      row[`${field}Actual`] = undefined;
      row[`${field}Generated`] = point.values[field];
    }

    return row;
  });

  return [...actualPoints, ...generatedPoints];
}

function resultExplanation(args: {
  run: SimulationRun;
  machineName?: string;
  fields: string[];
}) {
  const horizon = args.run.simulationHorizonMinutes
    ? `${args.run.simulationHorizonMinutes}-minute`
    : "future";
  const level = args.run.projectedLabel?.toLowerCase() ?? null;
  const likelihood = labelForRisk(args.run.projectedRisk).toLowerCase();

  return (
    <>
      The simulator used the selected Machine C session{" "}
      {args.fields.length > 0
        ? args.fields.map((field, index) => (
            <span key={field}>
              <strong>{metricLabel(field)}</strong>
              {index < args.fields.length - 1 ? " and " : ""}
            </span>
          ))
        : "machine sensor"}{" "}
      readings from{" "}
      <strong>{args.machineName ?? "the selected machine"}</strong> to generate
      a <strong>{horizon}</strong> future sequence.{" "}
      {level ? (
        <>
          The projected vibration level is <strong>{level}</strong>, with a{" "}
        </>
      ) : (
        <>The run did not return a vibration level. It reports a </>
      )}
      <strong>{likelihood}</strong> likelihood of high vibration and an
      estimated downtime impact of{" "}
      <strong>{formatDowntime(args.run.projectedDowntimeHours)}</strong>.
    </>
  );
}

function buildMachineCSimulationSchema(
  config: SimulationConfig,
): MachineSimulationSchema {
  return {
    machineType: "real-sensor",
    title: config.title,
    description: config.description,
    parameters: [
      {
        key: "sessionId",
        label: "Session ID",
        type: "select",
        required: true,
        description:
          "Select the augmented Machine C session that will provide the final context window for forecasting.",
        category: "Session Selection",
        displayOrder: 10,
        options: config.sessions.map((session) => ({
          value: String(session.sessionId),
          label: `Session ${session.sessionId} · ${session.durationMinutes} min`,
          description: [
            session.label ? `Observed session label: ${session.label}` : null,
            session.usesSyntheticContinuation
              ? "Includes synthetic continuation"
              : "Observed-only session",
          ]
            .filter(Boolean)
            .join(" · "),
        })),
      },
    ],
  };
}

function getAvailableSensorFields(machineType?: string | null) {
  if (machineType === "ai4i") {
    return [
      {
        key: "temperature",
        label: "Temperature",
        description: "Air temperature",
        available: true,
      },
      {
        key: "vibration",
        label: "Vibration",
        description: "Torque-derived proxy",
        available: true,
      },
      {
        key: "pressure",
        label: "Pressure",
        description: "Process temperature proxy",
        available: true,
      },
      {
        key: "power",
        label: "Power",
        description: "Rotational speed",
        available: true,
      },
    ];
  }

  if (machineType === "real-sensor" || machineType === "kaggle") {
    return [
      {
        key: "temperature",
        label: "Temperature",
        description: "Sensor reading",
        available: true,
      },
      {
        key: "vibrationX",
        label: "Vibration X",
        description: "Axis sensor reading",
        available: true,
      },
      {
        key: "vibrationY",
        label: "Vibration Y",
        description: "Axis sensor reading",
        available: true,
      },
      {
        key: "vibrationZ",
        label: "Vibration Z",
        description: "Axis sensor reading",
        available: true,
      },
    ];
  }

  return [
    {
      key: "temperature",
      label: "Temperature",
      description: "Sensor reading",
      available: true,
    },
    {
      key: "vibration",
      label: "Vibration",
      description: "Sensor reading",
      available: true,
    },
    {
      key: "pressure",
      label: "Pressure",
      description: "Sensor reading",
      available: true,
    },
    {
      key: "power",
      label: "Power",
      description: "Sensor reading",
      available: true,
    },
  ];
}

export default function SimulatorPage() {
  const provider = useDataProvider();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { activePersona } = useAuth();
  const simulationRunStatus = useSimulationRunStatus();

  const [machines, setMachines] = useState<CanonicalMachine[]>([]);
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [latestRun, setLatestRun] = useState<SimulationRun | null>(null);
  const [latestRunExplanationContext, setLatestRunExplanationContext] =
    useState<{
      runId: string;
      machineName?: string;
    } | null>(null);
  const [sessionPreview, setSessionPreview] =
    useState<SimulationSessionPreview | null>(null);
  const [isSessionPreviewLoading, setIsSessionPreviewLoading] = useState(false);
  const [sessionPreviewError, setSessionPreviewError] = useState<UserFacingError | null>(
    null,
  );
  const [simulationConfig, setSimulationConfig] =
    useState<SimulationConfig | null>(null);
  const [isSimulationConfigLoading, setIsSimulationConfigLoading] =
    useState(false);
  const [simulationConfigError, setSimulationConfigError] = useState<UserFacingError | null>(null);
  const [workflowError, setWorkflowError] = useState<UserFacingError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [genericModels, setGenericModels] = useState<SimulatorEntityModel[]>([]);
  const [genericSimulatorEntities, setGenericSimulatorEntities] = useState<SimulatorEntityOption[]>([]);
  const [areGenericModelsLoading, setAreGenericModelsLoading] = useState(true);
  const [areSimulatorEntitiesLoading, setAreSimulatorEntitiesLoading] = useState(true);

  const [machineId, setMachineId] = useState("");
  const [useLegacySimulator, setUseLegacySimulator] = useState(false);
  const [scenarioName, setScenarioName] = useState(
    "Adaptive operating scenario",
  );
  const [simulationHorizon, setSimulationHorizon] = useState("30-minutes");
  const [parameterValues, setParameterValues] =
    useState<SimulationParameterDraftValues>({});

  const requestedMachineId = searchParams.get("entityId") ?? searchParams.get("machineId") ?? "";
  const requestedMode = searchParams.get("mode");
  const requestedSessionId = searchParams.get("sessionId") ?? "";
  const requestedHorizon = searchParams.get("horizon") ?? "";
  const requestedScenario = searchParams.get("scenario") ?? "";
  const requestedRunId = searchParams.get("runId") ?? "";
  const requestedPredictionId = searchParams.get("predictionId") ?? "";
  const simulationMachines = useMemo(
    () =>
      machines.filter(
        (machine) => machine.legacyCompatible && machine.capabilities.includes("simulate"),
      ),
    [machines],
  );
  const genericPredictionModels = useMemo(
    () => genericModels.filter((model) => model.objectives.includes("predict")),
    [genericModels],
  );
  const simulatorOptions = useMemo(() => {
    return simulatorSelectorOptions(genericSimulatorEntities);
  }, [genericSimulatorEntities]);
  // One selector for both tabs: every machine that can be predicted or simulated.
  const machineOptions = useMemo<SimulatorMachineOption[]>(() => {
    const byId = new Map<string, SimulatorMachineOption>();
    for (const machine of predictionCapableMachines(machines, genericPredictionModels)) {
      byId.set(machine.id, {
        id: machine.id,
        name: machine.name,
        canPredict: hasPredictionPath(machine, genericPredictionModels),
        canSimulate: false,
        simulateReady: false,
      });
    }
    for (const option of simulatorOptions) {
      const existing = byId.get(option.id);
      byId.set(option.id, {
        id: option.id,
        name: existing?.name ?? option.name,
        canPredict: existing?.canPredict ?? false,
        canSimulate: true,
        simulateReady: option.eligible,
      });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [genericPredictionModels, machines, simulatorOptions]);
  const selectedLegacyMachine = useMemo(
    () => simulationMachines.find((machine) => machine.id === machineId) ?? null,
    [machineId, simulationMachines],
  );
  const legacyEntityIds = useMemo(
    () => simulationMachines.map((machine) => machine.id),
    [simulationMachines],
  );

  useEffect(() => {
    let active = true;
    setAreGenericModelsLoading(true);
    provider
      .listSimulatorEntityModels()
      .then((models) => {
        if (active) setGenericModels(models);
      })
      .catch(() => {
        if (active) setGenericModels([]);
      })
      .finally(() => {
        if (active) setAreGenericModelsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [provider]);

  useEffect(() => {
    let active = true;
    setAreSimulatorEntitiesLoading(true);
    provider.listSimulatorEntities().then((entities) => {
      if (active) setGenericSimulatorEntities(entities);
    }).catch(() => {
      if (active) setGenericSimulatorEntities([]);
    }).finally(() => {
      if (active) setAreSimulatorEntitiesLoading(false);
    });
    return () => {
      active = false;
    };
  }, [provider]);

  useEffect(() => {
    if (!activePersona) {
      return;
    }

    const currentPersona = activePersona;
    let active = true;

    async function bootstrap() {
      setIsLoading(true);
      try {
        const isStandardUser = currentPersona.role === "user";
        const loadedMachines = await provider.listCanonicalMachines({
          sortBy: "name",
          sortDirection: "asc",
          authorizedForUserId: isStandardUser ? currentPersona.id : undefined,
        });
        const visibleMachineIds = loadedMachines.map((machine) => machine.id);
        const loadedRuns = await provider.listSimulationRuns(currentPersona.id);

        if (!active) {
          return;
        }

        setMachines(loadedMachines);

        const scopedRuns = isStandardUser
          ? loadedRuns.filter((run) =>
              visibleMachineIds.includes(run.machineId),
            )
          : loadedRuns;
        setRuns(scopedRuns);
        setLatestRun(
          requestedRunId
            ? (scopedRuns.find((run) => run.id === requestedRunId) ??
                scopedRuns.find(
                  (run) => run.machineId === requestedMachineId,
                ) ??
                scopedRuns[0] ??
                null)
            : requestedMachineId
              ? (scopedRuns.find(
                  (run) => run.machineId === requestedMachineId,
                ) ??
                scopedRuns[0] ??
                null)
              : (scopedRuns[0] ?? null),
        );
      } catch (error) {
        if (active) setWorkflowError(toUserFacingError(error, "data.load", {
          title: "Simulator could not be loaded",
          message: "Machines and previous simulation results are unavailable.",
        }));
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [activePersona, provider, requestedMachineId, requestedRunId]);


  useEffect(() => {
    if (
      requestedHorizon &&
      simulationHorizons.some((horizon) => horizon.value === requestedHorizon)
    ) {
      setSimulationHorizon(requestedHorizon);
    }
  }, [requestedHorizon]);

  useEffect(() => {
    if (requestedScenario) {
      setScenarioName(requestedScenario);
    }
  }, [requestedScenario]);

  const areMachineOptionsLoading = isLoading || areSimulatorEntitiesLoading;

  // Old deep links used `mode` to pick a tab; the merged page scrolls to the matching section instead.
  const scrolledModeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!machineId || areMachineOptionsLoading) return;
    if (requestedMode !== "predict" && requestedMode !== "simulate") return;
    if (scrolledModeRef.current === requestedMode) return;
    scrolledModeRef.current = requestedMode;
    const target = document.getElementById(
      requestedMode === "simulate" ? "simulator-forecast" : "simulator-current-state",
    );
    if (!target) return;
    target.scrollIntoView({ block: "start" });
    target.focus({ preventScroll: true });
    // Content above the section (the live panel, prediction inputs) arrives a moment
    // later and would push the target back out of view, so keep it in place briefly
    // unless the operator scrolls themselves.
    let active = true;
    const stop = () => {
      active = false;
    };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", stop);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (active) target.scrollIntoView({ block: "start" });
          });
    observer?.observe(document.body);
    const timer = setTimeout(() => {
      active = false;
      observer?.disconnect();
    }, 4000);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [areMachineOptionsLoading, machineId, requestedMode]);

  useEffect(() => {
    if (machineOptions.length === 0) {
      setMachineId("");
      return;
    }

    const visibleMachineIds = machineOptions.map((machine) => machine.id);

    setMachineId((current) => {
      if (
        requestedMachineId &&
        visibleMachineIds.includes(requestedMachineId)
      ) {
        return requestedMachineId;
      }

      if (current && visibleMachineIds.includes(current)) {
        // A later-arriving list must never replace a machine the operator already chose.
        return current;
      }

      // Both machine lists feed the one selector; wait for both so the default is
      // the same machine on every load rather than whichever list answered first.
      return areMachineOptionsLoading ? current : (machineOptions[0]?.id ?? "");
    });
  }, [areMachineOptionsLoading, machineOptions, requestedMachineId]);

  useEffect(() => {
    setUseLegacySimulator(false);
  }, [machineId]);

  function selectSimulatorEntity(entityId: string) {
    setMachineId(entityId);
    const next = new URLSearchParams(searchParams.toString());
    next.set("entityId", entityId);
    next.delete("machineId");
    router.replace(`/simulator?${next.toString()}`, { scroll: false });
  }

  useEffect(() => {
    if (!machineId) {
      setSessionPreview(null);
      setSessionPreviewError(null);
      setIsSessionPreviewLoading(false);
      setSimulationConfig(null);
      setSimulationConfigError(null);
      setIsSimulationConfigLoading(false);
      return;
    }
  }, [machineId]);

  useEffect(() => {
    if (
      !machineId ||
      !useLegacySimulator ||
      !selectedLegacyMachine
    ) {
      setSimulationConfig(null);
      setSimulationConfigError(null);
      setIsSimulationConfigLoading(false);
      return;
    }

    let active = true;

    async function loadSimulationConfig() {
      setSimulationConfig(null);
      setSimulationConfigError(null);
      setIsSimulationConfigLoading(true);

      try {
        const config = await provider.getSimulationConfig(machineId);
        if (!active) {
          return;
        }
        setSimulationConfig(config);
      } catch (error) {
        if (!active) {
          return;
        }
        setSimulationConfig(null);
        setSimulationConfigError(toUserFacingError(error, "data.load", {
          title: "Simulation sessions could not be loaded",
          message: "Machine C source sessions are unavailable.",
        }));
      } finally {
        if (active) {
          setIsSimulationConfigLoading(false);
        }
      }
    }

    void loadSimulationConfig();

    return () => {
      active = false;
    };
  }, [machineId, provider, selectedLegacyMachine, useLegacySimulator]);

  const effectiveSessionId =
    parameterValues.sessionId ||
    requestedSessionId ||
    (latestRun?.machineId === machineId && latestRun.selectedSessionId
      ? String(latestRun.selectedSessionId)
      : "");
  const effectiveParameterValues = useMemo(
    () =>
      effectiveSessionId && !parameterValues.sessionId
        ? {
            ...parameterValues,
            sessionId: effectiveSessionId,
          }
        : parameterValues,
    [effectiveSessionId, parameterValues],
  );

  useEffect(() => {
    const selectedSessionId = Number(effectiveSessionId);

    if (!shouldLoadLegacySession(
      machineId,
      effectiveSessionId,
      useLegacySimulator,
      legacyEntityIds,
    )) {
      setSessionPreview(null);
      setSessionPreviewError(null);
      setIsSessionPreviewLoading(false);
      return;
    }

    let active = true;

    async function loadSessionPreview() {
      setSessionPreview(null);
      setSessionPreviewError(null);
      setIsSessionPreviewLoading(true);

      try {
        const preview = await provider.getSimulationSessionPreview(
          machineId,
          selectedSessionId,
        );

        if (!active) {
          return;
        }

        setSessionPreview(preview);
      } catch (error) {
        if (!active) {
          return;
        }

        setSessionPreview(null);
        setSessionPreviewError(toUserFacingError(error, "data.load", {
          title: "Session preview could not be loaded",
          message: "The selected Machine C source window is unavailable.",
        }));
      } finally {
        if (active) {
          setIsSessionPreviewLoading(false);
        }
      }
    }

    void loadSessionPreview();

    return () => {
      active = false;
    };
  }, [effectiveSessionId, legacyEntityIds, machineId, provider, useLegacySimulator]);

  useEffect(() => {
    if (!latestRun) {
      setLatestRunExplanationContext(null);
      return;
    }

    const runMachineName = machines.find(
      (machine) => machine.id === latestRun.machineId,
    )?.name;

    setLatestRunExplanationContext((current) => {
      if (!current || current.runId !== latestRun.id) {
        return {
          runId: latestRun.id,
          machineName: runMachineName,
        };
      }

      if (!current.machineName && runMachineName) {
        return {
          ...current,
          machineName: runMachineName,
        };
      }

      return current;
    });
  }, [latestRun, machines]);

  useEffect(() => {
    const completedRun = simulationRunStatus.completedRun;

    if (!completedRun) {
      return;
    }

    setLatestRun(completedRun);
    setRuns((currentRuns) => {
      const withoutCompletedRun = currentRuns.filter(
        (run) => run.id !== completedRun.id,
      );

      return [completedRun, ...withoutCompletedRun].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
    });
  }, [simulationRunStatus.completedRun]);

  const selectedMachine = useMemo(
    () => machines.find((machine) => machine.id === machineId) ?? null,
    [machineId, machines],
  );
  const selectedGenericEntity = useMemo(
    () => genericSimulatorEntities.find((entity) => entity.entityId === machineId) ?? null,
    [genericSimulatorEntities, machineId],
  );
  const selectedSimulationMachine = useMemo(() => {
    if (selectedLegacyMachine && simulationConfig) {
      return {
        ...selectedLegacyMachine,
        simulationSchema: buildMachineCSimulationSchema(simulationConfig),
      };
    }

    return selectedMachine;
  }, [selectedLegacyMachine, selectedMachine, simulationConfig]);
  const schemaResolution = useMemo(
    () => resolveMachineSimulationSchema(selectedSimulationMachine),
    [selectedSimulationMachine],
  );
  const resolvedSchema = schemaResolution.schema;

  useEffect(() => {
    setParameterValues((currentValues) => {
      const nextValues = createSimulationDraftValues(
        resolvedSchema,
        currentValues,
      );
      const sessionParameter = resolvedSchema?.parameters.find(
        (parameter) => parameter.key === "sessionId",
      );

      if (sessionParameter && effectiveSessionId) {
        nextValues.sessionId = effectiveSessionId;
      }

      return nextValues;
    });
  }, [effectiveSessionId, resolvedSchema]);

  const validation = useMemo(
    () => validateSimulationDraftValues(resolvedSchema, effectiveParameterValues),
    [effectiveParameterValues, resolvedSchema],
  );

  const scenarioNameError = scenarioName.trim()
    ? undefined
    : "Scenario name is required.";
  const selectedMachineTypeLabel = labelForMachineType(
    schemaResolution,
    selectedSimulationMachine,
  );
  const machineDescription = selectedMachine
    ? [
        selectedMachine.model,
        selectedMachineTypeLabel ? `(${selectedMachineTypeLabel})` : null,
      ]
        .filter(Boolean)
        .join(" ")
    : "Select a machine to begin.";
  const selectedHorizon = simulationHorizons.find(
    (horizon) => horizon.value === simulationHorizon,
  );
  const selectedHorizonMinutes =
    simulationHorizonMinutesByValue[simulationHorizon] ?? 30;
  const selectedSessionId = Number(effectiveParameterValues.sessionId ?? "");
  const selectedSessionMeta =
    simulationConfig?.sessions.find(
      (session) => session.sessionId === selectedSessionId,
    ) ?? null;
  const previewReadings = useMemo(
    () => sessionPreview?.readings ?? [],
    [sessionPreview?.readings],
  );
  const sortedPreviewReadings = useMemo(
    () => sortReadingsByNewest(previewReadings),
    [previewReadings],
  );
  const previewSensorChartGroups =
    sessionPreview?.sensorChartGroups ?? simulationConfig?.sensorChartGroups;
  const generatedReadings = useMemo(
    () => latestRun?.generatedReadings ?? [],
    [latestRun?.generatedReadings],
  );
  const sortedGeneratedReadings = useMemo(
    () => sortReadingsByNewest(generatedReadings),
    [generatedReadings],
  );
  const displayedGeneratedReadings = sortedGeneratedReadings.slice(0, 240);
  const resultTableSensorChartGroups =
    latestRun?.sensorChartGroups ?? simulationConfig?.sensorChartGroups;
  const isSubmitting = simulationRunStatus.status === "running";
  const simulationError =
    simulationRunStatus.status === "failed" ? simulationRunStatus.error : null;
  const hasSessionPreview = previewReadings.length > 0;
  const sourceWindowStart = sessionPreview?.sourceWindow.start;
  const sourceWindowEnd = sessionPreview?.sourceWindow.end;
  const sourceWindowLabel =
    sourceWindowStart && sourceWindowEnd
      ? `${formatTelemetryTimestamp(sourceWindowStart)} - ${formatTelemetryTimestamp(sourceWindowEnd)}`
      : "Waiting for session preview";
  const availableSensorFields = getAvailableSensorFields(
    schemaResolution.machineType ?? selectedMachine?.machineType,
  );
  const sourceDataReady =
    useLegacySimulator &&
    Boolean(selectedLegacyMachine) &&
    Boolean(selectedSessionMeta) &&
    !isSimulationConfigLoading &&
    !simulationConfigError &&
    !isSessionPreviewLoading &&
    !sessionPreviewError &&
    hasSessionPreview;
  const canSubmit =
    Boolean(activePersona) &&
    Boolean(machineId) &&
    sourceDataReady &&
    !scenarioNameError &&
    schemaResolution.status === "ready" &&
    Boolean(resolvedSchema?.parameters.length) &&
    validation.isValid &&
    !isSubmitting;
  const adjustmentsReady =
    schemaResolution.status === "ready" &&
    Boolean(resolvedSchema?.parameters.length) &&
    validation.isValid;
  const readinessItems = [
    {
      label: "Machine",
      value: selectedMachine?.name ?? "Select a machine",
      ready: Boolean(selectedMachine),
    },
    {
      label: "Horizon",
      value: selectedHorizon?.label ?? "Choose horizon",
      ready: Boolean(selectedHorizon),
    },
    {
      label: "Source data",
      value: sourceDataReady
        ? `Session ${selectedSessionMeta?.sessionId}`
        : isSimulationConfigLoading || isSessionPreviewLoading
          ? "Loading"
          : selectedSessionMeta
            ? "Preview unavailable"
            : "Unavailable",
      ready: sourceDataReady,
    },
    {
      label: "Adjustments",
      value: adjustmentsReady ? "Ready" : "Needs attention",
      ready: adjustmentsReady,
    },
  ];
  const resultSensorFields = getResultSensorFields(latestRun);
  const resultSensorChartGroups = getResultSensorChartGroups({
    run: latestRun,
    config: simulationConfig,
    fields: resultSensorFields,
  });
  const comparisonChartData = buildComparisonChartData({
    run: latestRun,
    fields: resultSensorFields,
  });
  const generatedBoundaryLabel = latestRun?.generatedReadings?.[0]?.timestamp
    ? formatTelemetryTimestamp(latestRun.generatedReadings[0].timestamp, {
        includeSeconds: true,
      })
    : undefined;
  const simulationFinished =
    Boolean(latestRun) &&
    (latestRun?.simulationStatus === "completed" ||
      latestRun?.simulationStatus === "insufficient-data" ||
      Boolean(latestRun?.generatedReadings?.length));

  useEffect(() => {
    if (simulationFinished && latestRun?.id) {
      simulationRunStatus.markCompletedRunViewed(latestRun.id);
    }
  }, [latestRun?.id, simulationFinished, simulationRunStatus]);

  if (
    !isLoading &&
    !areGenericModelsLoading &&
    activePersona?.role === "user" &&
    machines.length === 0 &&
    genericModels.length === 0
  ) {
    return (
      <NoMachineAccessState description="You do not currently have access to any machines to simulate. Please contact an administrator." />
    );
  }

  async function onRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkflowError(null);

    if (!activePersona) {
      setWorkflowError(toUserFacingError(null, "simulation.run", {
        title: "A signed-in user is required",
        message: "Sign in again before running the simulation.",
      }));
      return;
    }

    const latestValidation = validateSimulationDraftValues(
      resolvedSchema,
      effectiveParameterValues,
    );
    const parsedSessionId = Number(latestValidation.parsedParameters.sessionId);

    if (!machineId) {
      setWorkflowError(toUserFacingError(null, "simulation.run", {
        title: "Select a machine",
        message: "Choose a machine before running the simulation.",
      }));
      return;
    }

    if (!useLegacySimulator || !selectedLegacyMachine) {
      setWorkflowError(toUserFacingError(null, "simulation.run", {
        title: "Open the Machine C simulator",
        message: "Turn on the Machine C compatibility simulator and try again.",
      }));
      return;
    }

    if (!sourceDataReady) {
      setWorkflowError(toUserFacingError(null, "simulation.run", {
        title: "Select valid source data",
        message: "Choose a session with an available source preview.",
      }));
      return;
    }

    if (schemaResolution.status !== "ready") {
      setWorkflowError(toUserFacingError(null, "simulation.run", {
        title: "Simulation settings are unavailable",
        message: "Choose another machine or review its model setup.",
      }));
      return;
    }

    if (scenarioNameError) {
      setWorkflowError(toUserFacingError(null, "simulation.run", {
        title: "Review the scenario name",
        message: `${scenarioNameError} Correct the highlighted name and try again.`,
      }));
      return;
    }

    if (!latestValidation.isValid || !Number.isFinite(parsedSessionId)) {
      setWorkflowError(toUserFacingError(null, "simulation.run", {
        title: "Review the simulation inputs",
        message: "Correct the highlighted incomplete or invalid inputs and try again.",
      }));
      return;
    }

    try {
      await simulationRunStatus.startSimulation({
        input: {
          machineId,
          scenarioName: scenarioName.trim(),
          sessionId: parsedSessionId,
          simulationHorizonMinutes: selectedHorizonMinutes,
        },
        userId: activePersona.id,
        machineName: selectedMachine?.name,
      });
      toast.success("Simulation completed");
    } catch (error) {
      setWorkflowError(toUserFacingError(error, "simulation.run"));
    }
  }

  const selectedMachineOption = machineOptions.find((option) => option.id === machineId);
  const selectedSimulateOption = simulatorOptions.find((option) => option.id === machineId);
  const firstSimulateReadyOption = simulatorOptions.find((option) => option.eligible);

  return (
    <div className="flex flex-col gap-6">
      <SimulatorMachineSelector
        options={machineOptions}
        value={machineId}
        onChange={selectSimulatorEntity}
        isLoading={areMachineOptionsLoading}
      />

      <section
        id="simulator-current-state"
        aria-labelledby="simulator-current-state-heading"
        tabIndex={-1}
        className="flex scroll-mt-20 flex-col gap-3 outline-none"
      >
        <h2 id="simulator-current-state-heading" className="text-lg font-semibold">
          Current state
        </h2>
        {!machineId && areMachineOptionsLoading ? (
          <p className="text-sm text-muted-foreground">Loading machines…</p>
        ) : (
          <UnifiedPredictionPanel
            machines={machines}
            models={genericPredictionModels}
            entityId={machineId}
            requestedPredictionId={requestedPredictionId}
          />
        )}
      </section>

      <section
        id="simulator-forecast"
        aria-labelledby="simulator-forecast-heading"
        tabIndex={-1}
        className="flex scroll-mt-20 flex-col gap-3 outline-none"
      >
        <h2 id="simulator-forecast-heading" className="text-lg font-semibold">
          Forecast ahead
        </h2>
        {workflowError ? <ErrorNotice error={workflowError} /> : null}
        {!machineId && areMachineOptionsLoading ? (
          <p className="text-sm text-muted-foreground">Loading machines…</p>
        ) : selectedSimulateOption ? (
          <SchemaDrivenSimulator
            entities={genericSimulatorEntities}
            requestedEntityId={requestedMachineId}
            entityId={machineId}
            onEntityIdChange={selectSimulatorEntity}
            showEntitySelector={false}
          />
        ) : (
          <div
            className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-border bg-muted/30 p-3 text-sm"
            role="status"
          >
            <span>
              <span className="font-medium">
                Forecasting isn&apos;t available for {selectedMachineOption?.name ?? "this machine"}.
              </span>{" "}
              <span className="text-muted-foreground">
                It has no forecasting model set up yet (Machine Registry).
              </span>
            </span>
            {firstSimulateReadyOption ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => selectSimulatorEntity(firstSimulateReadyOption.id)}
              >
                Switch to {firstSimulateReadyOption.name}
              </Button>
            ) : null}
          </div>
        )}
          {selectedLegacyMachine ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-muted/30 p-3 text-sm">
              <span className="text-muted-foreground">
                {selectedGenericEntity?.eligible
                  ? "The simulator above uses the active model. The earlier Machine C session simulator is still available."
                  : "The active model is not ready; the earlier Machine C session simulator remains available."}
              </span>
              <Button type="button" variant="outline" onClick={() => setUseLegacySimulator((current) => !current)}>
                {useLegacySimulator ? "Hide legacy Machine C simulator" : "Use legacy Machine C simulator"}
              </Button>
            </div>
          ) : null}
          {useLegacySimulator && selectedLegacyMachine ? (
            <>
              <div className="border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
                Session-driven simulation is currently available for Machine C
                only. It uses augmented session context for the LSTM forecast and
                reports the classifier&apos;s probability of high vibration. Low,
                medium and high are Machine C&apos;s vibration intensity levels,
                not failure risk.
              </div>
              {simulationConfig?.warnings?.length ? (
                <div className="border border-warning/40 bg-warning/10 p-3 text-sm text-muted-foreground">
                  {simulationConfig.warnings.join(" ")}
                </div>
              ) : null}
              <div className="grid gap-4 xl:grid-cols-[1.25fr_0.9fr]">
                <form className="flex flex-col gap-4" onSubmit={onRun}>
                <Card className="border-primary/40 bg-primary/5">
                  <CardHeader>
                    <StepHeader
                      step={1}
                      title="Select machine"
                      description="Choose the asset that determines source data, sensor fields, and available scenario adjustments."
                      complete={Boolean(selectedMachine)}
                    />
                  </CardHeader>
                  <CardContent>
                    <SimulationMachineFields
                      machines={simulationMachines}
                      machineId={machineId}
                      scenarioName={scenarioName}
                      machineDescription={machineDescription}
                      scenarioNameError={scenarioNameError}
                      onMachineIdChange={setMachineId}
                      onScenarioNameChange={setScenarioName}
                      showMachineSelector={false}
                    />
                  </CardContent>
                </Card>

                <Card className="border-primary/40 bg-primary/5">
                  <CardHeader>
                    <StepHeader
                      step={2}
                      title="Select simulation session"
                      description="Choose the augmented Machine C session that will provide the final context window for forecasting."
                      complete={validation.isValid}
                    />
                  </CardHeader>
                </Card>

                <SimulationParameterState resolution={schemaResolution} />

                {resolvedSchema && schemaResolution.status === "ready" && (
                  <>
                    <SimulationParameterSections
                      schema={resolvedSchema}
                      values={effectiveParameterValues}
                      errors={validation.errors}
                      onChange={(key, value) =>
                        setParameterValues((currentValues) => ({
                          ...currentValues,
                          [key]: value,
                        }))
                      }
                    />
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!resolvedSchema}
                        onClick={() =>
                          setParameterValues(
                            createSimulationDraftValues(resolvedSchema),
                          )
                        }
                      >
                        <ArrowClockwiseIcon data-icon="inline-start" />
                        Reset session selection
                      </Button>
                    </div>
                  </>
                )}

                <Card className="border-primary/40 bg-primary/5">
                  <CardHeader>
                    <StepHeader
                      step={3}
                      title="Review source data"
                      description="Confirm the recent sensor data that will anchor the simulation."
                      complete={sourceDataReady}
                    />
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm">
                    <p className="text-muted-foreground">
                      This simulation will use the selected augmented Machine C
                      session as the starting point for generating future
                      machine behaviour.
                    </p>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <div className="border border-primary/30 bg-background/70 p-3">
                        <p className="text-xs text-muted-foreground">Machine</p>
                        <p className="font-medium">
                          {selectedMachine?.name ?? "No machine selected"}
                        </p>
                      </div>
                      <div className="border border-primary/30 bg-background/70 p-3">
                        <p className="text-xs text-muted-foreground">
                          Source type
                        </p>
                        <p className="font-medium">
                          {selectedMachineTypeLabel ?? "Pending selection"}
                        </p>
                      </div>
                      <div className="border border-primary/30 bg-background/70 p-3">
                        <p className="text-xs text-muted-foreground">
                          Selected session
                        </p>
                        <p className="font-medium">
                          {selectedSessionMeta
                            ? `Session ${selectedSessionMeta.sessionId}`
                            : "Choose a session"}
                        </p>
                      </div>
                      <div className="border border-primary/30 bg-background/70 p-3">
                        <p className="text-xs text-muted-foreground">
                          Session rows
                        </p>
                        <p className="font-medium">
                          {isSimulationConfigLoading
                            ? "Loading"
                            : selectedSessionMeta
                              ? selectedSessionMeta.totalRows.toLocaleString()
                              : "Unavailable"}
                        </p>
                      </div>
                      <div className="border border-primary/30 bg-background/70 p-3">
                        <p className="text-xs text-muted-foreground">
                          Observed session label
                        </p>
                        <p className="font-medium">
                          {selectedSessionMeta?.label ?? "Not available"}
                        </p>
                      </div>
                      <div className="border border-primary/30 bg-background/70 p-3">
                        <p className="text-xs text-muted-foreground">
                          Synthetic continuation
                        </p>
                        <p className="font-medium">
                          {selectedSessionMeta
                            ? selectedSessionMeta.usesSyntheticContinuation
                              ? "Used in session"
                              : "Observed only"
                            : "Pending selection"}
                        </p>
                      </div>
                    </div>

                    {selectedSessionMeta && <SimulationSessionMetadata session={selectedSessionMeta} />}

                    <div className="flex flex-col gap-2 border border-primary/30 bg-background/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">Available sensor fields</p>
                        <span className="text-xs text-muted-foreground">
                          Based on the selected machine dataset
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {availableSensorFields.map((field) => (
                          <Badge
                            key={field.key}
                            variant={field.available ? "outline" : "secondary"}
                            className={
                              field.available
                                ? "border-primary/40 bg-primary/5"
                                : "opacity-70"
                            }
                          >
                            {field.label}
                            <span className="ml-1 text-muted-foreground">
                              {field.available
                                ? field.description
                                : "unavailable"}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {isSimulationConfigLoading ? (
                      <div className="min-h-28 border border-dashed border-primary/40 bg-background/60 p-4 text-muted-foreground">
                        Loading augmented Machine C sessions for simulation.
                      </div>
                    ) : simulationConfigError ? (
                      <ErrorNotice error={simulationConfigError} className="min-h-28" />
                    ) : !selectedSessionMeta ? (
                      <div className="min-h-28 border border-dashed border-primary/40 bg-background/60 p-4 text-muted-foreground">
                        Choose a Machine C session to preview the exact source
                        window that will feed the LSTM.
                      </div>
                    ) : isSessionPreviewLoading ? (
                      <div className="min-h-28 border border-dashed border-primary/40 bg-background/60 p-4 text-muted-foreground">
                        Loading the selected Machine C session preview.
                      </div>
                    ) : sessionPreviewError ? (
                      <ErrorNotice error={sessionPreviewError} className="min-h-28" />
                    ) : !hasSessionPreview ? (
                      <div className="min-h-28 border border-dashed border-warning/50 bg-warning/10 p-4 text-muted-foreground">
                        No preview readings are available for the selected
                        Machine C session.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 border border-primary/30 bg-background/70 p-3">
                        <div>
                          <p className="font-medium">
                            Selected session source preview
                          </p>
                          <p className="text-muted-foreground">
                            Showing sampled readings from the exact selected
                            Machine C source window that will feed the LSTM
                            context.
                          </p>
                        </div>
                        <div className="max-h-72 overflow-auto border border-border bg-background">
                          <Table>
                            <TableHeader className="sticky top-0 z-10 bg-background">
                              <TableRow>
                                <TableHead>Timestamp</TableHead>
                                <TableHead>
                                  {metricHeaderLabel(
                                    "vibrationX",
                                    previewSensorChartGroups,
                                  )}
                                </TableHead>
                                <TableHead>
                                  {metricHeaderLabel(
                                    "vibrationY",
                                    previewSensorChartGroups,
                                  )}
                                </TableHead>
                                <TableHead>
                                  {metricHeaderLabel(
                                    "vibrationZ",
                                    previewSensorChartGroups,
                                  )}
                                </TableHead>
                                <TableHead>
                                  {metricHeaderLabel(
                                    "temperature",
                                    previewSensorChartGroups,
                                  )}
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sortedPreviewReadings.map((point, index) => (
                                <TableRow key={`${point.timestamp}-${index}`}>
                                  <TableCell>
                                    {formatTelemetryTimestamp(point.timestamp)}
                                  </TableCell>
                                  <TableCell>
                                    {formatTelemetryNumber(
                                      point.values.vibrationX ?? Number.NaN,
                                      3,
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {formatTelemetryNumber(
                                      point.values.vibrationY ?? Number.NaN,
                                      3,
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {formatTelemetryNumber(
                                      point.values.vibrationZ ?? Number.NaN,
                                      3,
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {formatTelemetryNumber(
                                      point.values.temperature ?? Number.NaN,
                                      1,
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-primary/40 bg-primary/5">
                  <CardHeader>
                    <StepHeader
                      step={4}
                      title="Choose simulation horizon"
                      description="Set the future window to inspect before running the scenario."
                      complete={Boolean(selectedHorizon)}
                    />
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-[minmax(0,240px)_1fr]">
                    <Select
                      value={simulationHorizon}
                      onValueChange={setSimulationHorizon}
                    >
                      <SelectTrigger className="w-full text-sm">
                        <SelectValue placeholder="Select horizon" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {simulationHorizons.map((horizon) => (
                            <SelectItem
                              key={horizon.value}
                              value={horizon.value}
                            >
                              {horizon.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <div className="border border-primary/30 bg-background/70 p-3 text-sm">
                      <p className="font-medium">
                        {selectedHorizon?.label ?? "No horizon selected"}
                      </p>
                      <p className="text-muted-foreground">
                        {selectedHorizon?.description ??
                          "Select a horizon before running the workflow."}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-success/40 bg-success/5">
                  <CardHeader>
                    <StepHeader
                      step={5}
                      title="Run simulation"
                      description="Start the scenario, then review the projected vibration level, estimated downtime, and recommended next actions."
                      tone="success"
                      complete={Boolean(latestRun)}
                    />
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div className="grid gap-2 md:grid-cols-4">
                      {readinessItems.map((item) => (
                        <div
                          key={item.label}
                          className="flex items-start gap-2 border border-primary/30 bg-background/80 p-3 text-sm"
                        >
                          <CheckCircleIcon
                            className={
                              item.ready
                                ? "text-success"
                                : "text-muted-foreground"
                            }
                            weight={item.ready ? "fill" : "regular"}
                          />
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">
                              {item.label}
                            </p>
                            <p className="truncate font-medium">{item.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">
                        {canSubmit
                          ? "Ready to run. The results panel on the right will update after completion."
                          : "Complete the required selections and resolve highlighted inputs to run."}
                      </p>
                      <Button type="submit" size="lg" disabled={!canSubmit}>
                        {isSubmitting ? (
                          <SpinnerIcon
                            data-icon="inline-start"
                            className="animate-spin"
                          />
                        ) : (
                          <PlayIcon data-icon="inline-start" />
                        )}
                        {isSubmitting
                          ? "Running simulation..."
                          : "Run simulation"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </form>

              <div className="flex flex-col gap-4 xl:sticky xl:top-18 xl:self-start">
                <Card className="border-success/40 bg-success/5">
                  <CardHeader>
                    <StepHeader
                      step={6}
                      title="Review results"
                      description="The latest completed scenario output appears here."
                      tone="success"
                      complete={Boolean(latestRun)}
                    />
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4 text-sm">
                    {isSubmitting ? (
                      <div className="flex flex-col gap-3 border border-dashed border-success/40 bg-background/70 p-4 text-muted-foreground">
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          <SpinnerIcon className="animate-spin text-success" />
                          Generating simulation results
                        </div>
                        <p>
                          The simulator is generating future sensor readings,
                          comparing them with recent actual machine data, and
                          preparing the vibration level and downtime summary.
                        </p>
                        {simulationRunStatus.activeScenarioName ? (
                          <p className="text-xs">
                            {simulationRunStatus.activeMachineName
                              ? `${simulationRunStatus.activeMachineName} - `
                              : ""}
                            {simulationRunStatus.activeScenarioName}
                          </p>
                        ) : null}
                      </div>
                    ) : simulationError ? (
                      <ErrorNotice error={simulationError} />
                    ) : simulationFinished && latestRun ? (
                      <>
                        <div className="flex flex-col gap-3 border border-success/40 bg-background/80 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">
                                Simulation Outcome Summary
                              </p>
                            </div>
                            <Badge
                              variant={badgeVariantForSeverity(
                                riskToSeverity(latestRun.projectedRisk),
                              )}
                            >
                              {labelForRisk(latestRun.projectedRisk)} likelihood of high vibration
                            </Badge>
                          </div>

                          <p className="text-muted-foreground">
                            {latestRun.simulationStatus === "insufficient-data"
                              ? (latestRun.simulationMessage ??
                                "The simulator could not generate a future sequence because this machine does not have enough recent source readings.")
                              : resultExplanation({
                                  run: latestRun,
                                  machineName:
                                    latestRunExplanationContext?.machineName,
                                  fields: resultSensorFields,
                                })}
                          </p>

                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                            <div className="border border-success/30 bg-background/80 p-3">
                              <span className="text-xs text-muted-foreground">
                                Likelihood of high vibration
                              </span>
                              <p className="mt-1 text-lg font-semibold">
                                {labelForRisk(latestRun?.projectedRisk ?? 0)}
                              </p>
                            </div>
                            <div className="border border-success/30 bg-background/80 p-3">
                              <span className="text-xs text-muted-foreground">
                                Probability of high vibration
                              </span>
                              <p className="mt-1 text-lg font-semibold">
                                {latestRun?.failureProbability !== undefined &&
                                latestRun?.failureProbability !== null
                                  ? `${((latestRun.failureProbability ?? 0) * 100).toFixed(1)}%`
                                  : `${latestRun?.projectedRisk ?? 0}%`}
                              </p>
                            </div>
                            <div className="border border-success/30 bg-background/80 p-3">
                              <span className="text-xs text-muted-foreground">
                                Estimated downtime
                              </span>
                              <p className="mt-1 text-lg font-semibold">
                                {formatDowntime(
                                  latestRun?.projectedDowntimeHours ?? 0,
                                )}
                              </p>
                            </div>
                            <div className="border border-success/30 bg-background/80 p-3">
                              <span className="text-xs text-muted-foreground">
                                Predicted vibration level
                              </span>
                              <p className="mt-1 text-lg font-semibold">
                                {projectedVibrationLevel(latestRun)}
                              </p>
                            </div>
                          </div>
                          <Separator />
                          <div className="flex flex-col gap-2">
                            <p className="font-medium">Recommendations</p>
                            {latestRun?.recommendations?.map(
                              (recommendation) => (
                                <div
                                  key={recommendation}
                                  className="border border-success/30 bg-background/80 p-2"
                                >
                                  {recommendation}
                                </div>
                              ),
                            )}
                          </div>
                        </div>

                        {latestRun?.simulationStatus === "insufficient-data" ? (
                          <div className="border border-success/30 bg-background/80 p-3">
                            <p className="font-medium">
                              Generated future data unavailable
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              {latestRun?.simulationMessage ??
                                "Simulation results could not be generated because there is not enough recent machine data available for this machine."}
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-col gap-3 border border-success/40 bg-background/80 p-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium">
                                    Actual vs Simulated Sensor Readings
                                  </p>
                                  <p className="text-muted-foreground">
                                    Compare recent actual sensor readings with
                                    the future simulated values generated by
                                    this run.
                                  </p>
                                </div>
                              </div>

                              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                                <div className="border border-success/30 bg-background/80 p-3">
                                  <span className="text-xs text-muted-foreground">
                                    Source window
                                  </span>
                                  <p className="mt-1 font-medium">
                                    {latestRun?.sourceWindow
                                      ? `Session ${latestRun.sourceWindow.sessionId ?? "-"} · ${formatTelemetryTimestamp(latestRun.sourceWindow.start)} - ${formatTelemetryTimestamp(latestRun.sourceWindow.end)}`
                                      : sourceWindowLabel}
                                  </p>
                                </div>
                                <div className="border border-success/30 bg-background/80 p-3">
                                  <span className="text-xs text-muted-foreground">
                                    Generated horizon
                                  </span>
                                  <p className="mt-1 font-medium">
                                    {latestRun?.simulationHorizonMinutes
                                      ? `${latestRun.simulationHorizonMinutes} minutes`
                                      : "Not available"}
                                  </p>
                                </div>
                                <div className="border border-success/30 bg-background/80 p-3">
                                  <span className="text-xs text-muted-foreground">
                                    Sensors compared
                                  </span>
                                  <p className="mt-1 font-medium">
                                    {resultSensorFields
                                      .map(metricLabel)
                                      .join(", ") || "Not available"}
                                  </p>
                                </div>
                              </div>

                              {simulationFinished &&
                              latestRun &&
                              comparisonChartData.length > 0 ? (
                                <div className="flex flex-col gap-4">
                                  {resultSensorChartGroups.map((group) => {
                                    const axisLabel = chartAxisLabel(group);

                                    return (
                                      <div
                                        key={group.id}
                                        className="flex flex-col gap-2"
                                      >
                                        <p className="text-sm font-medium">
                                          {group.label}
                                        </p>
                                        <div className="relative pl-7">
                                          <div className="absolute -left-1 top-2/6 -rotate-90 whitespace-nowrap text-xs text-muted-foreground">
                                            {axisLabel}
                                          </div>
                                          <ChartContainer
                                            config={simulationResultChartConfig}
                                            className="h-64 w-full"
                                          >
                                            <LineChart
                                              data={comparisonChartData}
                                              margin={{
                                                top: 12,
                                                right: 16,
                                                bottom: 20,
                                                left: 12,
                                              }}
                                            >
                                              <CartesianGrid vertical={false} />
                                              <XAxis
                                                dataKey="label"
                                                tickLine={false}
                                                axisLine={false}
                                                tickMargin={8}
                                                minTickGap={24}
                                                height={52}
                                                label={{
                                                  value: "Time",
                                                  position: "insideBottom",
                                                  offset: -8,
                                                }}
                                              />
                                              <YAxis
                                                tickLine={false}
                                                axisLine={false}
                                                tickMargin={8}
                                                width={72}
                                              />
                                              <ChartTooltip
                                                content={
                                                  <ChartTooltipContent
                                                    labelFormatter={(
                                                      _,
                                                      payload,
                                                    ) =>
                                                      payload?.[0]?.payload
                                                        ?.phase ??
                                                      "Sensor reading"
                                                    }
                                                  />
                                                }
                                              />
                                              <ChartLegend
                                                verticalAlign="bottom"
                                                content={({ payload }) => (
                                                  <SensorChartLegend
                                                    payload={payload}
                                                  />
                                                )}
                                              />
                                              {generatedBoundaryLabel && (
                                                <ReferenceLine
                                                  x={generatedBoundaryLabel}
                                                  stroke="var(--success)"
                                                  strokeDasharray="4 4"
                                                  label="Simulation starts"
                                                />
                                              )}
                                              {group.fields.map((field) => {
                                                const label =
                                                  metricLabel(field);

                                                return (
                                                  <Line
                                                    key={`${field}-actual`}
                                                    dataKey={`${field}Actual`}
                                                    name={`${label} actual`}
                                                    stroke={`var(--color-${field}Actual)`}
                                                    strokeWidth={2}
                                                    dot={false}
                                                    connectNulls={false}
                                                    type="monotone"
                                                  />
                                                );
                                              })}
                                              {group.fields.map((field) => {
                                                const label =
                                                  metricLabel(field);

                                                return (
                                                  <Line
                                                    key={`${field}-generated`}
                                                    dataKey={`${field}Generated`}
                                                    name={`${label} simulated`}
                                                    stroke={`var(--color-${field}Generated)`}
                                                    strokeWidth={2}
                                                    strokeDasharray="5 5"
                                                    dot={false}
                                                    connectNulls={false}
                                                    legendType="none"
                                                    type="monotone"
                                                  />
                                                );
                                              })}
                                            </LineChart>
                                          </ChartContainer>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="border border-dashed border-warning/50 bg-warning/10 p-3 text-muted-foreground">
                                  There is not enough actual and generated data
                                  to draw a meaningful comparison chart for this
                                  run.
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col gap-3 border border-success/40 bg-background/80 p-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium">
                                    Generated Future Data
                                  </p>
                                  <p className="text-muted-foreground">
                                    Future timestamps and simulated sensor
                                    values produced by this run.
                                  </p>
                                </div>
                                <Badge variant="secondary">Simulated</Badge>
                              </div>

                              {latestRun?.generatedReadings?.length ? (
                                <div className="flex flex-col gap-2">
                                  {sortedGeneratedReadings.length >
                                  displayedGeneratedReadings.length ? (
                                    <p className="text-xs text-muted-foreground">
                                      Showing the latest{" "}
                                      {displayedGeneratedReadings.length} of{" "}
                                      {sortedGeneratedReadings.length} generated
                                      readings.
                                    </p>
                                  ) : null}
                                  <div className="max-h-80 overflow-auto border border-border bg-background">
                                    <Table>
                                      <TableHeader className="sticky top-0 z-10 bg-background">
                                        <TableRow>
                                          <TableHead>
                                            Future timestamp
                                          </TableHead>
                                          {(latestRun?.sensorFields ?? []).map(
                                            (field) => (
                                              <TableHead key={field}>
                                                {metricHeaderLabel(
                                                  field,
                                                  resultTableSensorChartGroups,
                                                )}
                                              </TableHead>
                                            ),
                                          )}
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {displayedGeneratedReadings.map(
                                          (point, index) => (
                                            <TableRow
                                              key={`${point.timestamp}-${index}`}
                                            >
                                              <TableCell>
                                                {formatTelemetryTimestamp(
                                                  point.timestamp,
                                                  {
                                                    includeSeconds: true,
                                                  },
                                                )}
                                              </TableCell>
                                              {(
                                                latestRun?.sensorFields ?? []
                                              ).map((field) => (
                                                <TableCell key={field}>
                                                  {point.values[field] !==
                                                  undefined
                                                    ? formatTelemetryNumber(
                                                        point.values[field] ??
                                                          Number.NaN,
                                                        field
                                                          .toLowerCase()
                                                          .includes("vibration")
                                                          ? 3
                                                          : 1,
                                                      )
                                                    : "Not generated"}
                                                </TableCell>
                                              ))}
                                            </TableRow>
                                          ),
                                        )}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              ) : (
                                <div className="border border-dashed border-warning/50 bg-warning/10 p-3 text-muted-foreground">
                                  There is not enough recent machine data
                                  available to show generated future readings
                                  for this run.
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <PendingResultsPane />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Run History</CardTitle>
                    <CardDescription className="text-sm">
                      Recent simulation scenarios.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 text-sm">
                    {runs.slice(0, 6).map((run) => (
                      <div key={run.id} className="border border-border p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {run.scenarioName}
                          </span>
                          <Badge variant="outline">
                            {usesVibrationLevelLabels({ entityId: run.machineId })
                              ? `${run.projectedRisk}% high vibration`
                              : `${run.projectedRisk}% risk`}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground">
                          {formatDateTime(run.createdAt)}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                          {run.projectedRisk >= 65 ? (
                            <TrendUpIcon />
                          ) : (
                            <TrendDownIcon />
                          )}
                          Downtime {run.projectedDowntimeHours}h
                        </div>
                      </div>
                    ))}
                    {runs.length === 0 && (
                      <p className="text-muted-foreground">
                        No simulation runs available yet.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
