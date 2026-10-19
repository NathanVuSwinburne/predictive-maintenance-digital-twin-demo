"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  LinkIcon,
  LightningIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  RobotIcon,
  SpinnerIcon,
  UserIcon,
  XIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/auth-context";
import { ErrorNotice } from "@/components/feedback/error-notice";
import { SaveToWikiButton } from "@/components/knowledge/save-to-wiki-button";
import {
  mergeInformationProvenance,
  SourceAttribution,
} from "@/components/provenance/source-attribution";
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
  EmptyContent,
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
  ChatStreamEvent,
  ChatThread,
  MachineSummary,
  Severity,
} from "@/lib/domain/types";
import {
  badgeVariantForSeverity,
  formatDateTime,
} from "@/lib/domain/presentation";
import { isThreadBusy } from "@/lib/data/fastapi-provider";
import { cn } from "@/lib/utils";
import {
  toUserFacingError,
  type UserFacingError,
} from "@/lib/errors/user-facing-error";

function SourcesAndActionsPanel({ trace }: { trace: AgentTraceStep[] }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <div className="mt-1 border-t border-border/60 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
        aria-controls={contentId}
      >
        {open ? (
          <CaretDownIcon className="size-3.5" aria-hidden="true" />
        ) : (
          <CaretRightIcon className="size-3.5" aria-hidden="true" />
        )}
        Sources &amp; Actions Used
        <span className="text-xs">· {trace.length}</span>
      </button>
      {open && (
        <ol
          id={contentId}
          className="mt-2 space-y-2"
        >
          {trace.map((step) => {
            const didNotComplete = step.summary
              .trimStart()
              .toLowerCase()
              .startsWith("error:");
            const summary = didNotComplete
              ? step.summary.replace(/^\s*error:\s*/i, "")
              : step.summary;

            return (
              <li
                key={step.step}
                className={cn(
                  "flex gap-3 border border-border bg-muted/20 p-3 text-sm",
                  didNotComplete &&
                    "border-destructive/25 bg-destructive/5",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center border border-border bg-background text-xs font-medium text-muted-foreground tabular-nums",
                    didNotComplete &&
                      "border-destructive/30 text-destructive",
                  )}
                  aria-hidden="true"
                >
                  {step.step}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      {step.label}
                    </span>
                    {didNotComplete && (
                      <Badge variant="destructive">Not Completed</Badge>
                    )}
                  </div>
                  {summary && (
                    <p className="mt-1 break-words leading-relaxed text-muted-foreground">
                      {summary}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

type ChatWorkspaceProps = {
  className?: string;
};

type ChatChartBlock = Extract<ChatContentBlock, { type: "chart" }>;

/**
 * What the agent is doing right now, as it reported it.
 *
 * This used to be guessed here: a regex over the user's own words picked one of
 * five "routing" labels, and the UI displayed it as though it were the agent's
 * decision. It was never the agent's decision — the supervisor chooses its
 * tools turn by turn, and the label was a client-side prediction of a choice
 * that had not been made yet. The stream reports the real one.
 */
type AgentActivity = {
  label: string;
  phase: "running" | "finished";
};

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
          <SourceAttribution provenance={block.provenance} />
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
          <SourceAttribution provenance={block.provenance} />
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
              <SourceAttribution provenance={block.provenance} />
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{block.title}</p>
              <SourceAttribution provenance={block.provenance} />
            </div>
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
          <div className="border-b border-border p-2">
            <SourceAttribution provenance={block.provenance} />
          </div>
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
            <SourceAttribution provenance={block.provenance} />
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


/**
 * The prose of an assistant answer, for filing into the wiki.
 *
 * Only text and the summary lines of structured blocks — a chart's raw series
 * is not knowledge, and pasting it into a wiki page produces noise nobody reads.
 */
function plainTextOf(blocks: ChatContentBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      parts.push(block.content);
    } else if (block.type === "status-card") {
      parts.push(`**${block.title}** — ${block.summary}`);
      parts.push(
        block.metrics
          .map(
            (metric) =>
              `- ${metric.label}: ${metric.value}${metric.detail ? ` (${metric.detail})` : ""}`,
          )
          .join("\n"),
      );
    } else if ("title" in block && typeof block.title === "string") {
      parts.push(`**${block.title}**`);
    }
  }
  return parts.filter(Boolean).join("\n\n").trim();
}

function MessageSourceSummary({ blocks }: { blocks: ChatContentBlock[] }) {
  const provenance = mergeInformationProvenance(
    blocks.map((block) => block.provenance),
  );
  if (!provenance) return null;

  const basisProvenance = provenance.basisSources.length
    ? {
        outputSources: provenance.basisSources,
        basisSources: [],
        evidence: provenance.evidence,
      }
    : null;

  return (
    <span className="ml-auto inline-flex flex-wrap items-center justify-end gap-1.5">
      {basisProvenance && (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          Based on
          <SourceAttribution provenance={basisProvenance} />
        </span>
      )}
      <SourceAttribution provenance={provenance} />
    </span>
  );
}

function titleFromPrompt(prompt: string): string {
  const title = prompt.replace(/\s+/g, " ").trim();
  return title.length <= 60 ? title : `${title.slice(0, 59).trimEnd()}…`;
}

function isUntitledThread(title: string): boolean {
  return (
    title === "New Conversation" ||
    /^(?:Thread|Chat) \d{1,2}:\d{2}(?: [ap]m)?$/i.test(title)
  );
}

function threadReadStateKey(userId: string): string {
  return `chat_thread_read_at:${userId}`;
}

function readThreadTimestamps(userId: string): Record<string, string> {
  try {
    return JSON.parse(
      localStorage.getItem(threadReadStateKey(userId)) ?? "{}",
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeThreadReadTimestamp(userId: string, thread: ChatThread): void {
  const readAt = readThreadTimestamps(userId);
  readAt[thread.id] = thread.updatedAt;
  localStorage.setItem(threadReadStateKey(userId), JSON.stringify(readAt));
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
  const [thinkingThreadId, setThinkingThreadId] = useState<string | null>(null);
  const [unreadThreadIds, setUnreadThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  // What the agent last told us it was doing, and the answer as it is typed.
  // Both are cleared when a turn starts and again when it ends.
  const [activity, setActivity] = useState<AgentActivity | null>(null);
  const [streamedAnswer, setStreamedAnswer] = useState("");
  const [prompt, setPrompt] = useState("");
  const [pinnedMachineId, setPinnedMachineId] = useState<string>("auto");
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [threadError, setThreadError] = useState<UserFacingError | null>(null);
  const [conversationError, setConversationError] = useState<UserFacingError | null>(null);
  const [composerError, setComposerError] = useState<UserFacingError | null>(null);

  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const creatingThreadRef = useRef(false);

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingThread, setRenamingThread] = useState<ChatThread | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const activeThreadIdRef = useRef<string | null>(null);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );
  const pinnedMachine = useMemo(
    () => machines.find((machine) => machine.id === pinnedMachineId) ?? null,
    [machines, pinnedMachineId],
  );

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

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
        const storedReadAt = readThreadTimestamps(activeUserId);
        if (Object.keys(storedReadAt).length === 0) {
          localStorage.setItem(
            threadReadStateKey(activeUserId),
            JSON.stringify(
              Object.fromEntries(
                loadedThreads.map((thread) => [thread.id, thread.updatedAt]),
              ),
            ),
          );
          setUnreadThreadIds(new Set());
        } else {
          setUnreadThreadIds(
            new Set(
              loadedThreads
                .filter(
                  (thread) =>
                    storedReadAt[thread.id] === undefined ||
                    storedReadAt[thread.id] < thread.updatedAt,
                )
                .map((thread) => thread.id),
            ),
          );
        }
        setActiveThreadId((current) => current ?? loadedThreads[0]?.id ?? null);
      } catch (error) {
        setThreadError(toUserFacingError(error, "chat.load"));
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
    if (
      !activePersona ||
      !activeThread ||
      document.visibilityState !== "visible"
    ) {
      return;
    }

    writeThreadReadTimestamp(activePersona.id, activeThread);
    setUnreadThreadIds((current) => {
      if (!current.has(activeThread.id)) return current;
      const next = new Set(current);
      next.delete(activeThread.id);
      return next;
    });
  }, [activePersona, activeThread]);

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
        setComposerError(toUserFacingError(error, "data.load", {
          title: "Machine choices could not be loaded",
          message: "Try again later or continue with automatic machine selection.",
        }));
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
        setConversationError(toUserFacingError(error, "chat.load"));
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

  async function createThread() {
    if (!activePersona || creatingThreadRef.current) {
      return;
    }
    creatingThreadRef.current = true;
    setIsCreatingThread(true);
    setThreadError(null);

    try {
      const newThread = await dataProvider.createThread({
        userId: activePersona.id,
        title: "New Conversation",
      });

      setThreads((current) => [newThread, ...current]);
      activeThreadIdRef.current = newThread.id;
      setActiveThreadId(newThread.id);
      writeThreadReadTimestamp(activePersona.id, newThread);
      setMessages([]);
      toast.success("New thread created");
    } catch (error) {
      setThreadError(toUserFacingError(error, "data.create", {
        title: "A new conversation could not be created",
      }));
    } finally {
      creatingThreadRef.current = false;
      setIsCreatingThread(false);
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
      setRenameDialogOpen(false);
      setRenamingThread(null);
    } catch (error) {
      setThreadError(toUserFacingError(error, "data.save", {
        title: "The conversation could not be renamed",
      }));
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
      setThreadError(toUserFacingError(error, "data.delete", {
        title: "The conversation could not be deleted",
      }));
    }
  }

  async function sendPrompt(text: string) {
    // Creating a thread must finish before a send can choose its destination.
    // Guard keyboard sends synchronously too, and preserve the draft.
    if (creatingThreadRef.current) return;
    if (!activePersona) {
      return;
    }

    // The Send button is disabled while a turn is in flight; Ctrl+Enter was
    // not, so the keyboard could start a second turn on top of the first. Two
    // turns on one thread interleave: they share `streamedAnswer`, the first to
    // finish clears `isSending` for both, and the last to finish wins the
    // `setMessages` that replaces the list. The backend rejects the overlap
    // too — this stops the client asking for something it knows will be denied.
    if (isSending) {
      toast.info(
        thinkingThreadId === activeThreadId
          ? "The AI Assistant is still answering this conversation."
          : "The AI Assistant is answering another conversation. Try again when it finishes.",
      );
      return;
    }

    const value = text.trim();
    if (!value) {
      return;
    }

    setPrompt("");

    // Auto-create thread if none exists
    let threadId = activeThreadIdRef.current;
    if (!threadId) {
      creatingThreadRef.current = true;
      setIsCreatingThread(true);

      try {
        const newThread = await dataProvider.createThread({
          userId: activePersona.id,
          title: "New Conversation",
        });
        setThreads((current) => [newThread, ...current]);
        threadId = newThread.id;
        activeThreadIdRef.current = newThread.id;
        setActiveThreadId(newThread.id);
        toast.success("New conversation started");
      } catch (error) {
        creatingThreadRef.current = false;
        setIsCreatingThread(false);
        setPrompt(value);
        setComposerError(toUserFacingError(error, "data.create", {
          title: "A new conversation could not be started",
          message: "Your message is still in the composer. Try sending it again.",
        }));
        return;
      }
      creatingThreadRef.current = false;
      setIsCreatingThread(false);
    }

    const generatedTitle = titleFromPrompt(value);
    setThreads((current) =>
      current.map((thread) =>
        thread.id === threadId &&
        messages.length === 0 &&
        isUntitledThread(thread.title)
          ? { ...thread, title: generatedTitle }
          : thread,
      ),
    );

    // Optimistically show the user message immediately
    const optimisticMessage: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      threadId: threadId,
      role: "user",
      contentBlocks: [{ type: "text", content: value }],
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticMessage]);
    setActivity(null);
    setStreamedAnswer("");
    setIsSending(true);
    setThinkingThreadId(threadId);
    setComposerError(null);

    try {
      const updated = await dataProvider.sendMessageStreamed(
        {
          threadId: threadId,
          userId: activePersona.id,
          text: value,
          machineId:
            pinnedMachineId !== "auto" ? pinnedMachineId : undefined,
        },
        (event: ChatStreamEvent) => {
          if (event.type === "status") {
            setActivity({ label: event.label, phase: event.phase });
          } else if (event.type === "delta") {
            setStreamedAnswer((current) => current + event.text);
          }
        },
      );

      if (activeThreadIdRef.current === threadId) {
        setMessages(updated.messages);
        writeThreadReadTimestamp(activePersona.id, updated.thread);
      } else {
        setUnreadThreadIds((current) => new Set(current).add(threadId));
      }
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
      // A 409 is not a failure the user needs the stack of — the thread is busy
      // and the message simply was not sent. Say that, and put the text back in
      // the box so it is not lost.
      if (isThreadBusy(error)) {
        setPrompt(value);
        toast.info("Still answering your previous message. Try again in a moment.");
      } else {
        setPrompt(value);
        setComposerError(toUserFacingError(error, "chat.send"));
      }
    } finally {
      setIsSending(false);
      setThinkingThreadId(null);
      setActivity(null);
      setStreamedAnswer("");
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
            <Button size="xs" onClick={() => void createThread()} disabled={isCreatingThread}>
              <PlusIcon data-icon="inline-start" />
              {isCreatingThread ? "Creating…" : "New"}
            </Button>
          </div>
          <CardDescription className="text-sm">
            Select a thread or create a new conversation with the AI Assistant.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-0">
          {threadError ? <ErrorNotice className="mb-3" error={threadError} /> : null}
          <ScrollArea className="h-136 pr-2 [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden">
            <div className="flex w-full min-w-0 max-w-full flex-col gap-2">
              {threads.map((thread) => (
                <div
                  key={thread.id}
                  className={cn(
                    "group flex w-full min-w-0 max-w-full items-start gap-1 overflow-hidden rounded-none border border-border text-sm transition-colors hover:bg-muted",
                    thread.id === activeThreadId &&
                      "border-primary bg-primary/5 shadow-sm",
                  )}
                >
                  <button
                    type="button"
                    className="flex w-0 min-w-0 flex-1 flex-col gap-1 p-3 text-left"
                    onClick={() => {
                      activeThreadIdRef.current = thread.id;
                      setActiveThreadId(thread.id);
                    }}
                    aria-pressed={thread.id === activeThreadId}
                  >
                    <span className="block w-full truncate font-medium">
                      {thread.title}
                    </span>
                    <span className="flex w-full min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm text-muted-foreground">
                        {formatDateTime(thread.updatedAt)}
                      </span>
                      {thinkingThreadId === thread.id ? (
                        <span
                          className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground"
                          role="status"
                        >
                          <SpinnerIcon
                            className="size-3 animate-spin"
                            aria-hidden="true"
                          />
                          Thinking…
                        </span>
                      ) : unreadThreadIds.has(thread.id) ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                          <span
                            className="size-1.5 rounded-full bg-primary"
                            aria-hidden="true"
                          />
                          New
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mt-1 mr-1 size-7 shrink-0 opacity-60 hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Options for ${thread.title}`}
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
          {conversationError ? <ErrorNotice error={conversationError} /> : null}

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
                  {activeThread &&
                    activeThread.promptSuggestions.length > 0 && (
                      <EmptyContent className="max-w-2xl gap-3">
                        <p className="text-sm font-medium text-foreground">
                          Try a Starter Prompt
                        </p>
                        <div className="grid w-full gap-2 md:grid-cols-2">
                          {activeThread.promptSuggestions.map((suggestion) => (
                            <Button
                              key={suggestion}
                              variant="outline"
                              className="h-auto min-h-12 justify-center whitespace-normal px-3 py-2.5 text-center"
                              onClick={() => setPrompt(suggestion)}
                            >
                              <span className="min-w-0 leading-snug">
                                {suggestion}
                              </span>
                            </Button>
                          ))}
                        </div>
                      </EmptyContent>
                    )}
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
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-2">
                      {message.role === "assistant" ? (
                        <RobotIcon aria-hidden="true" />
                      ) : (
                        <UserIcon aria-hidden="true" />
                      )}
                      {message.role === "assistant" ? "AI Assistant" : "You"}
                    </span>
                    {message.role === "assistant" && (
                      <MessageSourceSummary blocks={message.contentBlocks} />
                    )}
                  </div>
                  <MessageBlocks blocks={message.contentBlocks} />
                  {message.role === "assistant" &&
                    message.agentTrace &&
                    message.agentTrace.length > 0 && (
                      <SourcesAndActionsPanel trace={message.agentTrace} />
                    )}
                  {/* A good answer is worth writing down once instead of being
                      re-derived next week. This files it into the wiki. */}
                  {message.role === "assistant" && (
                    <SaveToWikiButton
                      messageId={message.id}
                      text={plainTextOf(message.contentBlocks)}
                    />
                  )}
                </div>
              ))}

              {isSending && thinkingThreadId === activeThreadId && (
                <div className="flex max-w-[95%] flex-col gap-2 self-start rounded-none border border-border bg-card p-3 text-sm">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <RobotIcon />
                    AI Assistant
                    {activity && (
                      <span className="ml-1 rounded-none border-l border-border/70 pl-2 text-[11px] font-normal text-muted-foreground">
                        {activity.label}
                        {activity.phase === "running" ? "..." : ""}
                      </span>
                    )}
                  </div>
                  {streamedAnswer ? (
                    <p className="whitespace-pre-wrap text-sm">
                      {streamedAnswer}
                    </p>
                  ) : (
                    <p className="animate-pulse text-sm text-muted-foreground">
                      {activity
                        ? `${activity.label}...`
                        : "AI Assistant is reading your message..."}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {activeThread &&
            messages.some((message) => message.role === "assistant") &&
            activeThread.followUpSuggestions.length > 0 && (
              <div
                className="flex flex-wrap gap-2 border-t border-border pt-3"
                aria-label="Additional prompts"
              >
                {activeThread.followUpSuggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    className="h-auto whitespace-normal text-left"
                    onClick={() => setPrompt(suggestion)}
                  >
                    <LightningIcon
                      className="size-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {suggestion}
                  </Button>
                ))}
              </div>
            )}

          {composerError ? <ErrorNotice error={composerError} /> : null}
          <InputGroup className="min-h-28 items-start">
            {pinnedMachineId !== "auto" && (
              <InputGroupAddon
                align="block-start"
                className="w-full border-b border-border"
              >
                <Badge
                  variant="outline"
                  className="gap-1.5 border-foreground/20 bg-muted px-2 py-1 font-normal text-foreground"
                >
                  Machine: {pinnedMachine?.name ?? pinnedMachineId}
                  <button
                    type="button"
                    className="ml-0.5 text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={() => setPinnedMachineId("auto")}
                    aria-label="Remove pinned machine"
                  >
                    <XIcon className="size-3" aria-hidden="true" />
                  </button>
                </Badge>
              </InputGroupAddon>
            )}
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
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7">
                      Choose Machine
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">Choose Machine</p>
                        <p className="text-xs text-muted-foreground">
                          This is an advanced setting. Leave it as Automatic for
                          most questions. Pin a machine only when your prompt is
                          ambiguous or does not identify one.
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label
                          htmlFor="chat-machine-select"
                          className="text-xs"
                        >
                          Machine Context (Advanced)
                        </Label>
                        <Select
                          value={pinnedMachineId}
                          onValueChange={setPinnedMachineId}
                        >
                          <SelectTrigger
                            id="chat-machine-select"
                            className="h-8 rounded-none text-xs"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">
                              Automatic from message
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
                  variant="default"
                  size="sm"
                  onClick={() => void sendPrompt(prompt)}
                  disabled={isCreatingThread || (isSending && thinkingThreadId === activeThreadId)}
                  aria-disabled={isCreatingThread || isSending}
                  className={cn(
                    "h-8 px-3",
                    isSending &&
                      thinkingThreadId !== activeThreadId &&
                      "opacity-50",
                  )}
                >
                  <PaperPlaneTiltIcon data-icon="inline-start" />
                  {isCreatingThread
                    ? "Creating conversation…"
                    : isSending && thinkingThreadId === activeThreadId
                      ? "Sending…"
                      : "Send"}
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
