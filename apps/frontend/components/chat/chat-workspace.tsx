"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  PolarAngleAxis,
  XAxis,
  YAxis,
} from "recharts";
import {
  CaretDownIcon,
  CaretRightIcon,
  ChatCenteredTextIcon,
  ChatCircleDotsIcon,
  DotsThreeVerticalIcon,
  GearIcon,
  KeyIcon,
  LinkIcon,
  LightningIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  RobotIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/auth-context";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDataProvider } from "@/hooks/use-data-provider";
import type {
  AgentTraceStep,
  ChatContentBlock,
  ChatMessage,
  ChatThread,
  LlmProvider,
  MachineSummary,
  QueryMode,
  Severity,
} from "@/lib/domain/types";
import {
  badgeVariantForSeverity,
  formatDateTime,
} from "@/lib/domain/presentation";
import { cn } from "@/lib/utils";

function AgentTracePanel({ trace }: { trace: AgentTraceStep[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 border-t border-border/40 pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <CaretDownIcon size={11} /> : <CaretRightIcon size={11} />}
        Agent trace · {trace.length} step{trace.length !== 1 ? "s" : ""}
      </button>
      {open && (
        <ol className="mt-2 space-y-1.5">
          {trace.map((s) => (
            <li key={s.step} className="flex gap-2 text-[11px] leading-snug">
              <span className="shrink-0 w-4 text-right text-muted-foreground/50 tabular-nums">
                {s.step}.
              </span>
              <div className="min-w-0">
                <span className="font-medium text-foreground/75">{s.label}</span>
                {s.summary && (
                  <span className="ml-1.5 text-muted-foreground">{s.summary}</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

type ChatWorkspaceProps = {
  className?: string;
};

type ChatChartBlock = Extract<ChatContentBlock, { type: "chart" }>;
type PendingToolKind =
  | "simulation"
  | "prediction"
  | "maintenance"
  | "data_lookup"
  | "tools";

type ChatChartSpec = {
  metricKey:
    | "health"
    | "risk"
    | "temperature"
    | "vibration"
    | "pressure"
    | "power"
    | "generic";
  min: number;
  max: number;
  referenceLine?: number;
  formatter: (value: number) => string;
  severityForValue: (value: number) => Severity;
};

const defaultChartConfig = {
  value: {
    label: "Value",
    color: "var(--chart-2)",
  },
  reference: {
    label: "Reference",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

const advancedModeLabels: Record<QueryMode, string> = {
  auto: "Auto",
  data_lookup: "Data lookup",
  prediction: "Failure prediction",
  simulation: "Scenario simulation",
  maintenance: "Maintenance guidance",
  telemetry: "Data lookup",
  recommendation: "Maintenance guidance",
  general: "General fallback",
};

function inferPendingToolKind(text: string, queryMode: QueryMode): PendingToolKind {
  const lowerPrompt = text.toLowerCase();
  const conditionalScenario =
    /\b(if|what if|would|scenario|simulate|simulation)\b/.test(lowerPrompt) &&
    /\b(machine\s*[- ]?[a-z]|machine-[a-z])\b/.test(lowerPrompt) &&
    /\b(at|with|under|if|was|were|would)\b/.test(lowerPrompt);

  if (
    queryMode === "simulation" ||
    conditionalScenario ||
    /\b(simulate|simulation|what if|scenario|generate .*data)\b/.test(
      lowerPrompt,
    )
  ) {
    return "simulation";
  }

  if (
    queryMode === "prediction" ||
    /\b(predict|prediction|failure probability|forecast|likely fault|remaining useful life)\b/.test(
      lowerPrompt,
    )
  ) {
    return "prediction";
  }

  if (
    queryMode === "maintenance" ||
    /\b(recommend|maintenance|repair|fix|replace|what should i do)\b/.test(
      lowerPrompt,
    )
  ) {
    return "maintenance";
  }

  if (
    queryMode === "data_lookup" ||
    /\b(telemetry|temperature|vibration|pressure|power|status|health|latest|which machines)\b/.test(
      lowerPrompt,
    )
  ) {
    return "data_lookup";
  }

  return "tools";
}

function pendingRouteLabel(kind: PendingToolKind, queryMode: QueryMode) {
  if (queryMode !== "auto") {
    return `Override: ${advancedModeLabels[queryMode]}`;
  }

  return (
    {
      simulation: "Routing: scenario",
      prediction: "Routing: prediction",
      maintenance: "Routing: maintenance",
      data_lookup: "Routing: data",
      tools: "Routing automatically",
    } satisfies Record<PendingToolKind, string>
  )[kind];
}

function riskSeverity(risk: number): Severity {
  if (risk >= 80) return "critical";
  if (risk >= 65) return "high";
  if (risk >= 45) return "medium";
  return "low";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function chartTitleIncludes(block: ChatChartBlock, ...tokens: string[]) {
  const haystack = `${block.title} ${block.unit}`.toLowerCase();
  return tokens.some((token) => haystack.includes(token));
}

function formatChartMetricValue(value: number, unit: string) {
  if (unit === "%") {
    return `${Math.round(value)}%`;
  }

  if (unit === "score") {
    return value.toFixed(0);
  }

  if (unit === "°C" || unit === "C") {
    return `${value.toFixed(1)}°C`;
  }

  if (unit === "mm/s²" || unit === "mm/s^2") {
    return `${value.toFixed(2)} mm/s²`;
  }

  if (unit === "bar") {
    return `${value.toFixed(1)} bar`;
  }

  if (unit === "kW") {
    return `${value.toFixed(1)} kW`;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)}${unit ? ` ${unit}` : ""}`;
}

function inferChartSpec(block: ChatChartBlock): ChatChartSpec {
  const values = block.data.map((point) => point.value);
  const highestValue = Math.max(...values, 0);

  if (chartTitleIncludes(block, "health")) {
    return {
      metricKey: "health",
      min: 0,
      max: 100,
      referenceLine: 80,
      formatter: (value) => formatChartMetricValue(value, "%"),
      severityForValue: (value) => {
        if (value < 45) return "critical";
        if (value < 60) return "high";
        if (value < 80) return "medium";
        return "low";
      },
    };
  }

  if (chartTitleIncludes(block, "risk")) {
    return {
      metricKey: "risk",
      min: 0,
      max: 100,
      referenceLine: 65,
      formatter: (value) => formatChartMetricValue(value, "%"),
      severityForValue: riskSeverity,
    };
  }

  if (chartTitleIncludes(block, "temp")) {
    return {
      metricKey: "temperature",
      min: 0,
      max: Math.max(100, Math.ceil((highestValue + 10) / 10) * 10),
      referenceLine: 75,
      formatter: (value) => formatChartMetricValue(value, block.unit),
      severityForValue: (value) => {
        if (value >= 90) return "critical";
        if (value >= 80) return "high";
        if (value >= 70) return "medium";
        return "low";
      },
    };
  }

  if (chartTitleIncludes(block, "vibration")) {
    return {
      metricKey: "vibration",
      min: 0,
      max: Math.max(2.5, Number((highestValue * 1.5).toFixed(1))),
      referenceLine: 1.5,
      formatter: (value) => formatChartMetricValue(value, block.unit),
      severityForValue: (value) => {
        if (value >= 2.2) return "critical";
        if (value >= 1.7) return "high";
        if (value >= 1.2) return "medium";
        return "low";
      },
    };
  }

  if (chartTitleIncludes(block, "pressure")) {
    return {
      metricKey: "pressure",
      min: 0,
      max: Math.max(10, Math.ceil((highestValue + 1.5) * 2) / 2),
      referenceLine: 7,
      formatter: (value) => formatChartMetricValue(value, block.unit),
      severityForValue: (value) => {
        if (value >= 8.5) return "critical";
        if (value >= 7.5) return "high";
        if (value >= 6.5) return "medium";
        return "low";
      },
    };
  }

  if (chartTitleIncludes(block, "power")) {
    return {
      metricKey: "power",
      min: 0,
      max: Math.max(100, Math.ceil((highestValue + 10) / 10) * 10),
      referenceLine: Math.max(60, highestValue * 0.85),
      formatter: (value) => formatChartMetricValue(value, block.unit),
      severityForValue: (value) => {
        if (value >= 90) return "critical";
        if (value >= 75) return "high";
        if (value >= 60) return "medium";
        return "low";
      },
    };
  }

  return {
    metricKey: "generic",
    min: 0,
    max: Math.max(highestValue * 1.25, highestValue + 1, 10),
    formatter: (value) => formatChartMetricValue(value, block.unit),
    severityForValue: () => "low",
  };
}

function chartDomain(spec: ChatChartSpec, values: number[]) {
  if (spec.metricKey === "health" || spec.metricKey === "risk") {
    return [spec.min, spec.max] as const;
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = Math.max(maxValue - minValue, spec.max * 0.1, 1);
  const lowerBound = Math.max(spec.min, minValue - span * 0.2);
  const upperBound = Math.min(spec.max, maxValue + span * 0.2);
  return [
    Number(lowerBound.toFixed(2)),
    Number(upperBound.toFixed(2)),
  ] as const;
}

function describeMetricState(spec: ChatChartSpec, value: number) {
  switch (spec.metricKey) {
    case "health":
      if (value >= 80) return "Strong health";
      if (value >= 60) return "Needs review";
      if (value >= 45) return "Elevated wear";
      return "Critical wear";
    case "risk":
      if (value < 45) return "Low risk";
      if (value < 65) return "Watch";
      if (value < 80) return "At risk";
      return "Critical risk";
    case "temperature":
      if (value < 70) return "Within range";
      if (value < 80) return "Rising";
      if (value < 90) return "High thermal load";
      return "Overheating";
    case "vibration":
      if (value < 1.2) return "Stable";
      if (value < 1.7) return "Increasing";
      if (value < 2.2) return "High vibration";
      return "Critical vibration";
    case "pressure":
      if (value < 6.5) return "Stable pressure";
      if (value < 7.5) return "Rising load";
      if (value < 8.5) return "High pressure";
      return "Pressure spike";
    case "power":
      if (value < 60) return "Normal draw";
      if (value < 75) return "Elevated load";
      if (value < 90) return "High power draw";
      return "Peak demand";
    default:
      return "Current reading";
  }
}

function chartSummary(block: ChatChartBlock, spec: ChatChartSpec) {
  const points = block.data;
  const latest = points[points.length - 1];
  const first = points[0];
  const values = points.map((point) => point.value);
  const peak = Math.max(...values);
  const trough = Math.min(...values);
  const delta = latest.value - first.value;

  return {
    latest,
    first,
    peak,
    trough,
    delta,
    normalizedValue: clamp(
      ((latest.value - spec.min) / Math.max(spec.max - spec.min, 1)) * 100,
      0,
      100,
    ),
  };
}

function formatDelta(value: number, formatter: (value: number) => string) {
  const absolute = formatter(Math.abs(value));
  if (value > 0) return `+${absolute}`;
  if (value < 0) return `-${absolute}`;
  return formatter(0);
}

function chartTooltipFormatter(
  value: number,
  _name: string,
  _item: unknown,
  _index: number,
  payload: { label?: string },
  spec: ChatChartSpec,
) {
  return (
    <div className="flex min-w-36 items-center justify-between gap-3">
      <span className="text-muted-foreground">{payload.label ?? "Value"}</span>
      <span className="font-medium text-foreground">
        {spec.formatter(Number(value))}
      </span>
    </div>
  );
}

function ChatGaugeChart({ block }: { block: ChatChartBlock }) {
  const spec = inferChartSpec(block);
  const summary = chartSummary(block, spec);
  const severity = spec.severityForValue(summary.latest.value);

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{block.title}</CardTitle>
          </div>
          <Badge variant={badgeVariantForSeverity(severity)}>
            {describeMetricState(spec, summary.latest.value)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,180px)_1fr] lg:items-center">
          <div className="relative">
            <ChartContainer config={defaultChartConfig} className="h-40 w-full">
              <RadialBarChart
                data={[{ value: summary.normalizedValue }]}
                startAngle={180}
                endAngle={0}
                innerRadius="70%"
                outerRadius="100%"
                barSize={12}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar
                  dataKey="value"
                  fill="var(--color-value)"
                  background
                  cornerRadius={0}
                />
              </RadialBarChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 pt-4">
              <span className="text-xl font-semibold tracking-tight text-foreground text-wrap">
                {spec.formatter(summary.latest.value)}
              </span>
              <span className="text-xs text-muted-foreground">
                {summary.latest.label}
              </span>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-none border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Operating scale</span>
                <span>
                  {spec.formatter(spec.min)} - {spec.formatter(spec.max)}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-border/70">
                <div
                  className="h-full rounded-full bg-chart-2"
                  style={{ width: `${summary.normalizedValue}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>Low</span>
                <span>Current position</span>
                <span>High</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChatTrendChart({ block }: { block: ChatChartBlock }) {
  const spec = inferChartSpec(block);
  const summary = chartSummary(block, spec);
  const values = block.data.map((point) => point.value);
  const [domainMin, domainMax] = chartDomain(spec, values);
  const latestSeverity = spec.severityForValue(summary.latest.value);

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{block.title}</CardTitle>
            <CardDescription className="text-xs">
              Trend across {block.data.length} points
            </CardDescription>
          </div>
          <Badge variant={badgeVariantForSeverity(latestSeverity)}>
            {describeMetricState(spec, summary.latest.value)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="border border-border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Latest</p>
            <p className="mt-1 text-sm font-semibold">
              {spec.formatter(summary.latest.value)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.latest.label}
            </p>
          </div>
          <div className="border border-border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Start</p>
            <p className="mt-1 text-sm font-semibold">
              {spec.formatter(summary.first.value)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.first.label}
            </p>
          </div>
          <div className="border border-border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Change</p>
            <p className="mt-1 text-sm font-semibold">
              {formatDelta(summary.delta, spec.formatter)}
            </p>
          </div>
          <div className="border border-border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Peak</p>
            <p className="mt-1 text-sm font-semibold">
              {spec.formatter(summary.peak)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Min {spec.formatter(summary.trough)}
            </p>
          </div>
        </div>

        <ChartContainer config={defaultChartConfig} className="h-48 w-full">
          <AreaChart data={block.data} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={56}
              domain={[domainMin, domainMax]}
              tickFormatter={(value) => spec.formatter(Number(value))}
            />
            {spec.referenceLine !== undefined ? (
              <ReferenceLine
                y={spec.referenceLine}
                stroke="var(--color-reference)"
                strokeDasharray="4 4"
              />
            ) : null}
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name, item, index, payload) =>
                    chartTooltipFormatter(
                      Number(value),
                      String(name),
                      item,
                      index,
                      payload as { label?: string },
                      spec,
                    )
                  }
                />
              }
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-value)"
              fill="var(--color-value)"
              fillOpacity={0.15}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-value)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--color-value)" }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function ChatChartCard({ block }: { block: ChatChartBlock }) {
  if (block.data.length <= 1) {
    return <ChatGaugeChart block={block} />;
  }

  return <ChatTrendChart block={block} />;
}

const markdownComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  p({ children }) {
    return <p className="mb-1.5 leading-relaxed last:mb-0">{children}</p>;
  },
  h1({ children }) {
    return <h1 className="mb-2 mt-3 text-sm font-bold first:mt-0">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mb-1.5 mt-3 text-sm font-bold first:mt-0">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>;
  },
  ul({ children }) {
    return <ul className="mb-1.5 list-disc space-y-0.5 pl-5">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="mb-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>;
  },
  li({ children }) {
    return <li className="leading-relaxed">{children}</li>;
  },
  strong({ children }) {
    return <strong className="font-semibold">{children}</strong>;
  },
  em({ children }) {
    return <em className="italic">{children}</em>;
  },
  code({ className, children }) {
    if (className?.startsWith("language-")) {
      return <code className={cn("block font-mono text-xs", className)}>{children}</code>;
    }
    return <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>;
  },
  pre({ children }) {
    return <pre className="mb-1.5 overflow-x-auto rounded border border-border bg-muted p-3 last:mb-0">{children}</pre>;
  },
  table({ children }) {
    return (
      <div className="mb-1.5 overflow-x-auto rounded border border-border last:mb-0">
        <table className="w-full text-xs">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-muted/50">{children}</thead>;
  },
  th({ children }) {
    return <th className="border-b border-border px-3 py-2 text-left font-medium whitespace-nowrap">{children}</th>;
  },
  td({ children }) {
    return <td className="border-b border-border/40 px-3 py-1.5 last:border-b-0">{children}</td>;
  },
  blockquote({ children }) {
    return <blockquote className="mb-1.5 border-l-2 border-border pl-3 italic text-muted-foreground last:mb-0">{children}</blockquote>;
  },
  a({ href, children }) {
    return <a href={href} className="text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer">{children}</a>;
  },
  hr() {
    return <hr className="my-2 border-border" />;
  },
};

function MessageBlocks({ blocks }: { blocks: ChatContentBlock[] }) {
  const renderedBlocks: React.ReactNode[] = [];

  for (let index = 0; index < blocks.length; ) {
    const block = blocks[index];

    if (block.type === "chart") {
      const chartBlocks = [block];
      let nextIndex = index + 1;

      while (nextIndex < blocks.length) {
        const nextBlock = blocks[nextIndex];
        if (nextBlock.type !== "chart") {
          break;
        }

        chartBlocks.push(nextBlock);
        nextIndex += 1;
      }

      renderedBlocks.push(
        <div
          key={`chart-group-${index}`}
          className={cn(
            "grid gap-3",
            chartBlocks.length === 1 ? "grid-cols-1" : "md:grid-cols-2",
          )}
        >
          {chartBlocks.map((chartBlock, chartIndex) => (
            <ChatChartCard
              key={`${chartBlock.title}-${chartIndex}`}
              block={chartBlock}
            />
          ))}
        </div>,
      );

      index = nextIndex;
      continue;
    }

    if (block.type === "text") {
      renderedBlocks.push(
        <div key={index} className="text-sm text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {block.content}
          </ReactMarkdown>
        </div>,
      );
    } else if (block.type === "status-card") {
      renderedBlocks.push(
        <Card key={index} className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm">{block.title}</CardTitle>
                <CardDescription className="text-xs">
                  {block.machineName} - {block.intent}
                </CardDescription>
              </div>
              <Badge variant={badgeVariantForSeverity(block.severity)}>
                {block.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {block.summary}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {block.metrics.map((metric) => (
                <div
                  key={`${metric.label}-${metric.value}`}
                  className="border border-border bg-background/70 p-2"
                >
                  <p className="text-xs text-muted-foreground">
                    {metric.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{metric.value}</p>
                  {metric.detail ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {metric.detail}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>,
      );
    } else if (block.type === "comparison") {
      renderedBlocks.push(
        <div key={index} className="overflow-x-auto border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-2">
            <p className="text-sm font-medium">{block.title}</p>
            <p className="text-xs text-muted-foreground">
              {block.baselineLabel} vs {block.scenarioLabel}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Measure</TableHead>
                <TableHead className="text-xs">{block.baselineLabel}</TableHead>
                <TableHead className="text-xs">{block.scenarioLabel}</TableHead>
                <TableHead className="text-xs">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="text-xs font-medium">
                    {row.label}
                  </TableCell>
                  <TableCell className="text-xs">{row.baseline}</TableCell>
                  <TableCell className="text-xs">{row.scenario}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.delta ?? "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>,
      );
    } else if (block.type === "table") {
      renderedBlocks.push(
        <div
          key={index}
          className="overflow-x-auto rounded-none border border-border"
        >
          <Table>
            <TableHeader>
              <TableRow>
                {block.columns.map((col) => (
                  <TableHead
                    key={col}
                    className="text-xs font-medium whitespace-nowrap"
                  >
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <TableCell
                      key={cellIndex}
                      className="text-xs whitespace-nowrap"
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>,
      );
    } else {
      renderedBlocks.push(
        <div key={index} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <LinkIcon />
            Related links
          </div>
          {block.links.map((item, linkIndex) => (
            <Link
              key={`${item.href}-${linkIndex}`}
              href={item.href}
              className="flex flex-col gap-1 rounded-none border border-border p-2 hover:bg-muted"
            >
              <span className="text-sm font-medium text-primary">
                {item.label}
              </span>
              <span className="text-sm text-muted-foreground">
                {item.description}
              </span>
            </Link>
          ))}
        </div>,
      );
    }

    index += 1;
  }

  return <div className="flex flex-col gap-3">{renderedBlocks}</div>;
}

export function ChatWorkspace({ className }: ChatWorkspaceProps) {
  const dataProvider = useDataProvider();
  const { activePersona } = useAuth();
  const messageScrollAreaRef = useRef<HTMLDivElement | null>(null);

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [assistantProgressText, setAssistantProgressText] = useState(
    "AI Assistant is planning the request...",
  );
  const [pendingToolKind, setPendingToolKind] =
    useState<PendingToolKind>("tools");
  const [prompt, setPrompt] = useState("");
  const [queryMode, setQueryMode] = useState<QueryMode>("auto");
  const [advancedMachineId, setAdvancedMachineId] = useState<string>("auto");
  const [machines, setMachines] = useState<MachineSummary[]>([]);

  // API key / LLM provider settings
  const [apiKey, setApiKey] = useState<string>(() =>
    typeof window !== "undefined"
      ? (localStorage.getItem("chat_api_key") ?? "")
      : "",
  );
  const [llmProvider, setLlmProvider] = useState<LlmProvider>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("chat_llm_provider");
      if (stored === "openai" || stored === "gemini" || stored === "ollama" || stored === "deepseek")
        return stored;
    }
    return "openai";
  });
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [llmProviderDraft, setLlmProviderDraft] =
    useState<LlmProvider>("openai");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isCreatingThread, setIsCreatingThread] = useState(false);

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingThread, setRenamingThread] = useState<ChatThread | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );
  useEffect(() => {
    if (!activePersona) {
      return;
    }

    const activeUserId = activePersona.id;
    let active = true;

    async function loadThreads() {
      setIsLoadingThreads(true);
      try {
        const loadedThreads = await dataProvider.listThreads(activeUserId);
        if (!active) {
          return;
        }

        setThreads(loadedThreads);
        setActiveThreadId((current) => current ?? loadedThreads[0]?.id ?? null);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to load threads",
        );
      } finally {
        if (active) {
          setIsLoadingThreads(false);
        }
      }
    }

    void loadThreads();

    return () => {
      active = false;
    };
  }, [activePersona, dataProvider]);

  useEffect(() => {
    if (!activePersona) {
      setMachines([]);
      return;
    }

    const persona = activePersona;
    let active = true;

    async function loadMachines() {
      try {
        const loadedMachines = await dataProvider.listMachines({
          sortBy: "name",
          sortDirection: "asc",
          authorizedForUserId: persona.role === "user" ? persona.id : undefined,
        });
        if (active) {
          setMachines(loadedMachines);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to load machines",
        );
      }
    }

    void loadMachines();

    return () => {
      active = false;
    };
  }, [activePersona, dataProvider]);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    const threadId = activeThreadId;
    let active = true;

    async function loadThread() {
      setIsLoadingMessages(true);
      try {
        const loaded = await dataProvider.getThread(threadId);
        if (!active) {
          return;
        }

        setMessages(loaded.messages);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to load messages",
        );
      } finally {
        if (active) {
          setIsLoadingMessages(false);
        }
      }
    }

    void loadThread();

    return () => {
      active = false;
    };
  }, [activeThreadId, dataProvider]);

  useEffect(() => {
    if (!messageScrollAreaRef.current) {
      return;
    }

    messageScrollAreaRef.current.scrollTop =
      messageScrollAreaRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!isSending) {
      return;
    }

    setAssistantProgressText("AI Assistant is planning the request...");
    const planningTimer = window.setTimeout(() => {
      setAssistantProgressText(
        pendingToolKind === "simulation"
          ? "AI Assistant has triggered the simulation. Waiting for the simulator to finish..."
          : pendingToolKind === "prediction"
            ? "AI Assistant is running the prediction..."
            : pendingToolKind === "maintenance"
              ? "AI Assistant is gathering maintenance guidance..."
              : pendingToolKind === "data_lookup"
                ? "AI Assistant is checking machine data..."
                : "AI Assistant is running the required tool and waiting for results...",
      );
    }, 1600);
    const longRunningTimer = window.setTimeout(() => {
      setAssistantProgressText(
        pendingToolKind === "simulation"
          ? "Simulation is still running. This can take a while for longer horizons..."
          : pendingToolKind === "maintenance"
            ? "Still gathering the relevant maintenance context..."
            : "Still waiting for the backend result...",
      );
    }, 7000);

    return () => {
      window.clearTimeout(planningTimer);
      window.clearTimeout(longRunningTimer);
    };
  }, [isSending, pendingToolKind]);

  async function createThread() {
    if (!activePersona) {
      return;
    }

    try {
      const newThread = await dataProvider.createThread({
        userId: activePersona.id,
        title: `Thread ${new Date().toLocaleTimeString("en-AU", {
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      });

      setThreads((current) => [newThread, ...current]);
      setActiveThreadId(newThread.id);
      setMessages([]);
      toast.success("New thread created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create thread",
      );
    }
  }

  function openRenameDialog(thread: ChatThread) {
    setRenamingThread(thread);
    setRenameValue(thread.title);
    setRenameDialogOpen(true);
  }

  async function confirmRename() {
    if (!renamingThread || !renameValue.trim()) return;
    try {
      const updated = await dataProvider.renameThread(
        renamingThread.id,
        renameValue.trim(),
      );
      setThreads((current) =>
        current.map((t) => (t.id === updated.id ? updated : t)),
      );
      toast.success("Thread renamed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to rename thread",
      );
    } finally {
      setRenameDialogOpen(false);
      setRenamingThread(null);
    }
  }

  async function deleteThread(thread: ChatThread) {
    try {
      await dataProvider.deleteThread(thread.id);
      const remaining = threads.filter((t) => t.id !== thread.id);
      setThreads(remaining);
      if (activeThreadId === thread.id) {
        setActiveThreadId(remaining[0]?.id ?? null);
        setMessages([]);
      }
      toast.success("Thread deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete thread",
      );
    }
  }

  function openSettings() {
    setApiKeyDraft(apiKey);
    setLlmProviderDraft(llmProvider);
    setSettingsOpen(true);
  }

  function saveSettings() {
    setApiKey(apiKeyDraft);
    setLlmProvider(llmProviderDraft);
    localStorage.setItem("chat_api_key", apiKeyDraft);
    localStorage.setItem("chat_llm_provider", llmProviderDraft);
    setSettingsOpen(false);
    toast.success("Settings saved");
  }

  async function sendPrompt(text: string) {
    if (!activePersona) {
      return;
    }

    const value = text.trim();
    if (!value) {
      return;
    }

    setPrompt("");

    // Auto-create thread if none exists
    let threadId = activeThreadId;
    if (!threadId) {
      if (isCreatingThread) return; // Prevent race condition
      setIsCreatingThread(true);

      try {
        const newThread = await dataProvider.createThread({
          userId: activePersona.id,
          title: `Chat ${new Date().toLocaleTimeString("en-AU", {
            hour: "2-digit",
            minute: "2-digit",
          })}`,
        });
        setThreads((current) => [newThread, ...current]);
        threadId = newThread.id;
        setActiveThreadId(newThread.id);
        toast.success("New conversation started");
      } catch (error) {
        setIsCreatingThread(false);
        toast.error(
          error instanceof Error ? error.message : "Unable to create thread",
        );
        return;
      }
      setIsCreatingThread(false);
    }

    // Optimistically show the user message immediately
    const optimisticMessage: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      threadId: threadId,
      role: "user",
      contentBlocks: [{ type: "text", content: value }],
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticMessage]);
    setPendingToolKind(inferPendingToolKind(value, queryMode));
    setIsSending(true);

    try {
      const updated = await dataProvider.sendMessage({
        threadId: threadId,
        userId: activePersona.id,
        text: value,
        queryMode,
        machineId: advancedMachineId !== "auto" ? advancedMachineId : undefined,
        apiKey: apiKey || undefined,
        llmProvider,
      });

      setMessages(updated.messages);
      setThreads((current) =>
        current
          .map((thread) =>
            thread.id === updated.thread.id ? updated.thread : thread,
          )
          .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
      );
    } catch (error) {
      // Remove the optimistic message on failure
      setMessages((current) =>
        current.filter((m) => m.id !== optimisticMessage.id),
      );
      toast.error(
        error instanceof Error ? error.message : "Unable to send message",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div
      className={cn(
        "grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[20rem_1fr]",
        className,
      )}
    >
      <Card className="min-h-168">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ChatCircleDotsIcon />
              My Chats
            </CardTitle>
            <Button size="xs" onClick={() => void createThread()}>
              <PlusIcon data-icon="inline-start" />
              New
            </Button>
          </div>
          <CardDescription className="text-sm">
            Select a thread or create a new conversation with the AI Assistant.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-0">
          <ScrollArea className="h-136 pr-2">
            <div className="flex flex-col gap-2">
              {threads.map((thread) => (
                <div
                  key={thread.id}
                  className={cn(
                    "group flex items-start gap-1 rounded-none border border-border text-sm hover:bg-muted",
                    thread.id === activeThreadId && "border-primary",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col gap-1 p-3 text-left"
                    onClick={() => setActiveThreadId(thread.id)}
                  >
                    <span className="truncate font-medium">{thread.title}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatDateTime(thread.updatedAt)}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mt-1 mr-1 size-7 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        aria-label="Thread options"
                      >
                        <DotsThreeVerticalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => openRenameDialog(thread)}
                      >
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => void deleteThread(thread)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
              {!isLoadingThreads && threads.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No threads available yet.
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="min-h-168">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-sm">
              {activeThread?.title ?? "Conversation"}
            </CardTitle>
            {activeThread?.machineId && (
              <Badge variant="outline">{activeThread.machineId}</Badge>
            )}
          </div>
          <CardDescription className="text-sm">
            Ask in plain language, and the AI Assistant will respond with
            diagnostics, charts and next actions.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex h-full min-h-0 flex-col gap-3">
          {activeThread && (
            <div className="flex flex-wrap gap-2">
              {activeThread.promptSuggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="xs"
                  onClick={() => setPrompt(suggestion)}
                >
                  <LightningIcon data-icon="inline-start" />
                  {suggestion}
                </Button>
              ))}
            </div>
          )}

          <Separator />

          <div
            ref={messageScrollAreaRef}
            className="h-[60rem] overflow-y-auto rounded-none border border-border p-3"
          >
            <div className="flex flex-col gap-3 pr-3">
              {isLoadingMessages && (
                <p className="text-sm text-muted-foreground">
                  Loading conversation...
                </p>
              )}

              {!isLoadingMessages && messages.length === 0 && (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ChatCenteredTextIcon />
                    </EmptyMedia>
                    <EmptyTitle>No messages yet</EmptyTitle>
                    <EmptyDescription>
                      Describe a machine symptom, scenario, risk question, or
                      maintenance concern.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex max-w-[95%] flex-col gap-2 rounded-none border border-border p-3 text-sm",
                    message.role === "assistant"
                      ? "self-start bg-card"
                      : "self-end bg-primary/10",
                  )}
                >
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {message.role === "assistant" ? (
                      <RobotIcon />
                    ) : (
                      <UserIcon />
                    )}
                    {message.role === "assistant" ? "AI Assistant" : "You"}
                  </div>
                  <MessageBlocks blocks={message.contentBlocks} />
                  {message.role === "assistant" &&
                    message.agentTrace &&
                    message.agentTrace.length > 0 && (
                      <AgentTracePanel trace={message.agentTrace} />
                    )}
                </div>
              ))}

              {isSending && (
                <div className="flex max-w-[95%] flex-col gap-2 self-start rounded-none border border-border bg-card p-3 text-sm">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <RobotIcon />
                    AI Assistant
                    <span className="ml-1 rounded-none border-l border-border/70 pl-2 text-[11px] font-normal text-muted-foreground">
                      {pendingRouteLabel(pendingToolKind, queryMode)}
                    </span>
                  </div>
                  <p className="animate-pulse text-sm text-muted-foreground">
                    {assistantProgressText}
                  </p>
                </div>
              )}
            </div>
          </div>

          {activeThread && activeThread.followUpSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeThread.followUpSuggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="ghost"
                  size="xs"
                  onClick={() => setPrompt(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          )}

          <InputGroup className="min-h-28 items-start">
            <InputGroupTextarea
              aria-label="Prompt"
              placeholder="Ask the AI Assistant to diagnose machine condition or run a scenario..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void sendPrompt(prompt);
                }
              }}
            />
            <InputGroupAddon
              align="block-end"
              className="w-full border-t border-border"
            >
              <span className="shrink-0 text-sm text-muted-foreground">
                Ctrl+Enter to send
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Popover
                  open={settingsOpen}
                  onOpenChange={(open) => {
                    if (open) openSettings();
                    else setSettingsOpen(false);
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="API key settings"
                    >
                      {apiKey ? (
                        <KeyIcon className="text-primary" />
                      ) : (
                        <GearIcon />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">LLM Settings</p>
                        <p className="text-xs text-muted-foreground">
                          Enter your API key to use your own account. Keys are
                          stored locally and never sent to our servers.
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label
                          htmlFor="llm-provider-select"
                          className="text-xs"
                        >
                          Provider
                        </Label>
                        <Select
                          value={llmProviderDraft}
                          onValueChange={(value) =>
                            setLlmProviderDraft(value as LlmProvider)
                          }
                        >
                          <SelectTrigger
                            id="llm-provider-select"
                            className="h-8 rounded-none text-xs"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="openai">OpenAI</SelectItem>
                            <SelectItem value="gemini">
                              Google Gemini
                            </SelectItem>
                            <SelectItem value="deepseek">DeepSeek</SelectItem>
                            <SelectItem value="ollama">
                              Ollama (local)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {llmProviderDraft !== "ollama" && (
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="api-key-input" className="text-xs">
                            API Key
                          </Label>
                          <Input
                            id="api-key-input"
                            type="password"
                            placeholder={
                              llmProviderDraft === "gemini"
                                ? "AIza..."
                                : llmProviderDraft === "deepseek"
                                  ? "sk-... (DeepSeek key)"
                                  : "sk-..."
                            }
                            value={apiKeyDraft}
                            onChange={(e) => setApiKeyDraft(e.target.value)}
                            className="h-8 rounded-none text-xs font-mono"
                          />
                        </div>
                      )}
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={saveSettings}
                      >
                        Save
                      </Button>
                      {apiKey && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full text-destructive hover:text-destructive"
                          onClick={() => {
                            setApiKeyDraft("");
                            saveSettings();
                          }}
                        >
                          Clear saved key
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7">
                      {queryMode === "auto"
                        ? "Advanced"
                        : advancedModeLabels[queryMode]}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">Advanced routing</p>
                        <p className="text-xs text-muted-foreground">
                          Leave this on Auto unless you need to override the
                          assistant&apos;s tool choice.
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="chat-mode-select" className="text-xs">
                          Task override
                        </Label>
                        <Select
                          value={queryMode}
                          onValueChange={(value) =>
                            setQueryMode(value as QueryMode)
                          }
                        >
                          <SelectTrigger
                            id="chat-mode-select"
                            className="h-8 rounded-none text-xs"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto</SelectItem>
                            <SelectItem value="data_lookup">
                              Data lookup
                            </SelectItem>
                            <SelectItem value="prediction">
                              Failure prediction
                            </SelectItem>
                            <SelectItem value="simulation">
                              Scenario simulation
                            </SelectItem>
                            <SelectItem value="maintenance">
                              Maintenance guidance
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label
                          htmlFor="chat-machine-select"
                          className="text-xs"
                        >
                          Machine override
                        </Label>
                        <Select
                          value={advancedMachineId}
                          onValueChange={setAdvancedMachineId}
                        >
                          <SelectTrigger
                            id="chat-machine-select"
                            className="h-8 rounded-none text-xs"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">
                              Infer from message
                            </SelectItem>
                            {machines.map((machine) => (
                              <SelectItem key={machine.id} value={machine.id}>
                                {machine.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <InputGroupButton
                  onClick={() => void sendPrompt(prompt)}
                  disabled={isSending}
                >
                  <PaperPlaneTiltIcon data-icon="inline-start" />
                  {isSending ? "Sending..." : "Send"}
                </InputGroupButton>
              </div>
            </InputGroupAddon>
          </InputGroup>
        </CardContent>
      </Card>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename thread</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="rename-input">New name</Label>
            <Input
              id="rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmRename();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => void confirmRename()}
              disabled={!renameValue.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
