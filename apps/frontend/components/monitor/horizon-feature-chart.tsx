"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { TrendDownIcon, TrendUpIcon, MinusIcon } from "@phosphor-icons/react";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  FORECAST_BAND,
  HISTORY_BAND,
  buildHorizonSeries,
  forecastX,
  formatHorizonValue,
  minutesForX,
  outlookSentence,
} from "@/lib/domain/live-horizon";
import { formatTimeWithSeconds } from "@/lib/domain/presentation";
import { niceCeil } from "@/lib/domain/vibration-3d";
import type { EntityLiveHorizon, EntityLiveObservation } from "@/lib/domain/types";

const horizonChartConfig = {
  actual: { label: "Measured", color: "var(--chart-1)" },
  forecast: { label: "Forecast", color: "var(--chart-4)" },
} satisfies ChartConfig;

/** Long dashes: learned from this machine's history. Dots: engineering reference. */
export const MACHINE_THRESHOLD_STYLE = { stroke: "var(--chart-2)", dash: "10 4" } as const;
export const ENGINEERING_THRESHOLD_STYLE = { stroke: "var(--chart-5)", dash: "2 3" } as const;
/** An engineering line further above the data than this factor is listed, not drawn. */
const ENGINEERING_DRAW_FACTOR = 4;

export type ChartThresholdLine = {
  value: number;
  /** Short name on the line, e.g. "Machine C normal upper bound". */
  label: string;
  /** Why the line exists, e.g. "99th percentile of HIGH-X history". */
  caption: string;
};

export type ChartThresholds = {
  machine: ChartThresholdLine | null;
  /** Why there is no machine-specific line (no level, too little history). */
  machineUnavailable?: string | null;
  engineering: ChartThresholdLine | null;
  /** Why there is no engineering line (not configured, not comparable). */
  engineeringUnavailable?: string | null;
};

type Props = {
  feature: string;
  unit: string;
  observations: EntityLiveObservation[];
  horizon: EntityLiveHorizon | null | undefined;
  /** Vibration charts only: the two independent reference lines. */
  thresholds?: ChartThresholds | null;
};

function formatThreshold(value: number, unit: string) {
  return `${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
}

function formatRelativeTick(minutes: number) {
  if (minutes === 0) return "Now";
  if (minutes < 0) {
    const ago = -minutes;
    return ago < 1 ? `−${Math.round(ago * 60)} s` : `−${formatHorizonValue(Math.round(ago * 10) / 10)} min`;
  }
  return `+${Math.round(minutes)} min`;
}

/**
 * One chart per feature: measured readings (solid) continuing into the next-hour
 * forecast (dashed, inside a shaded "Forecast" region after the "Now" marker).
 * The x axis is relative to now; the history band is scaled so a few minutes of
 * readings stay visible beside sixty minutes of outlook.
 */
export function HorizonFeatureChart({ feature, unit, observations, horizon, thresholds }: Props) {
  const series = useMemo(
    () => buildHorizonSeries(feature, observations, horizon),
    [feature, horizon, observations],
  );
  const { rows, summary, historyMinutes, horizonMinutes } = series;
  const hasForecast = summary !== null;
  const ticks = useMemo(() => {
    const forecastTicks = [15, 30, 45, 60]
      .filter((minutes) => minutes <= horizonMinutes)
      .map((minutes) => forecastX(minutes, horizonMinutes));
    return [-HISTORY_BAND, 0, ...forecastTicks];
  }, [horizonMinutes]);
  const label = `${feature}${unit ? ` (${unit})` : ""}`;
  const dataMax = useMemo(
    () =>
      rows.reduce((max, row) => {
        const values = [row.actual, row.forecast].filter((value): value is number => typeof value === "number");
        return Math.max(max, ...values);
      }, 0),
    [rows],
  );
  const machineLine = thresholds?.machine ?? null;
  const engineeringLine = thresholds?.engineering ?? null;
  const drawEngineering =
    engineeringLine !== null &&
    engineeringLine.value <= ENGINEERING_DRAW_FACTOR * Math.max(dataMax, machineLine?.value ?? 0, 0.05);
  // Reference lines must stay visible even when the readings sit well below them,
  // so a vibration chart with lines starts at 0 (RMS cannot be negative) and reaches
  // just above the highest line drawn.
  const lineMax = Math.max(machineLine?.value ?? 0, drawEngineering && engineeringLine ? engineeringLine.value : 0);
  const yDomain: [number | string, number | string | ((dataMax: number) => number)] =
    lineMax > 0 ? [0, (max: number) => niceCeil(Math.max(max, lineMax) * 1.08)] : ["auto", "auto"];
  const DirectionIcon =
    summary?.direction === "rise" ? TrendUpIcon : summary?.direction === "fall" ? TrendDownIcon : MinusIcon;

  if (rows.length === 0) {
    return (
      <article className="border border-border p-3" aria-label={`${label} outlook`}>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-2 text-sm text-muted-foreground">No readings for this value yet.</p>
      </article>
    );
  }

  return (
    <article className="flex flex-col gap-2 border border-border p-3" aria-label={`${label} outlook`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">
          Last {historyMinutes < 1 ? `${Math.round(historyMinutes * 60)} s` : `${formatHorizonValue(Math.round(historyMinutes * 10) / 10)} min`} measured
          {hasForecast ? ` · next ${horizonMinutes} min forecast` : ""}
        </p>
      </div>
      {summary ? (
        <p className="flex items-start gap-1.5 text-sm">
          <DirectionIcon aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
          <span>{outlookSentence(summary, unit, horizonMinutes)}.</span>
        </p>
      ) : null}
      <ChartContainer config={horizonChartConfig} className="aspect-auto h-48 w-full">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          {hasForecast ? (
            <ReferenceArea
              x1={0}
              x2={FORECAST_BAND}
              fill="var(--color-forecast)"
              fillOpacity={0.08}
              ifOverflow="extendDomain"
              label={{ value: "Forecast", position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }}
            />
          ) : null}
          {machineLine ? (
            <ReferenceLine
              y={machineLine.value}
              stroke={MACHINE_THRESHOLD_STYLE.stroke}
              strokeWidth={1.5}
              strokeDasharray={MACHINE_THRESHOLD_STYLE.dash}
              ifOverflow="extendDomain"
              label={{
                value: `${machineLine.label} ${formatThreshold(machineLine.value, unit)}`,
                position: "insideBottomLeft",
                fontSize: 10,
                fill: MACHINE_THRESHOLD_STYLE.stroke,
              }}
            />
          ) : null}
          {engineeringLine && drawEngineering ? (
            <ReferenceLine
              y={engineeringLine.value}
              stroke={ENGINEERING_THRESHOLD_STYLE.stroke}
              strokeWidth={2}
              strokeDasharray={ENGINEERING_THRESHOLD_STYLE.dash}
              ifOverflow="extendDomain"
              label={{
                value: `${engineeringLine.label} ${formatThreshold(engineeringLine.value, unit)}`,
                position: "insideTopLeft",
                fontSize: 10,
                fill: ENGINEERING_THRESHOLD_STYLE.stroke,
              }}
            />
          ) : null}
          <ReferenceLine
            x={0}
            stroke="var(--foreground)"
            strokeDasharray="3 3"
            label={{ value: "Now", position: "insideTopLeft", fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <XAxis
            dataKey="x"
            type="number"
            domain={[-HISTORY_BAND, hasForecast ? FORECAST_BAND : 0]}
            ticks={hasForecast ? ticks : [-HISTORY_BAND, 0]}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatRelativeTick(minutesForX(value, historyMinutes, horizonMinutes))}
          />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            domain={yDomain}
            tickFormatter={(value: number) => formatHorizonValue(Math.round(value * 100) / 100)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as { timestamp?: string; minutes?: number } | undefined;
                  if (!row?.timestamp) return null;
                  const minutes = row.minutes ?? 0;
                  return `${formatTimeWithSeconds(row.timestamp)} (${formatRelativeTick(minutes)})`;
                }}
              />
            }
          />
          <Line
            dataKey="actual"
            name="Measured"
            type="monotone"
            stroke="var(--color-actual)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="forecast"
            name="Forecast"
            type="monotone"
            stroke="var(--color-forecast)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-0.5 w-5 bg-[var(--chart-1)]" />
          Measured (solid)
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-5 border-t-2 border-dashed border-[var(--chart-4)]" />
          Forecast (dashed)
        </span>
      </div>
      {thresholds ? (
        <dl className="grid gap-1.5 border-t border-border pt-2 text-xs" data-testid={`thresholds-${feature}`}>
          <div className="flex items-start gap-2">
            <dt className="flex shrink-0 items-center gap-1.5 pt-1.5">
              <svg aria-hidden="true" width="22" height="2" className="overflow-visible">
                <line x1="0" y1="1" x2="22" y2="1" stroke={MACHINE_THRESHOLD_STYLE.stroke} strokeWidth="2" strokeDasharray={MACHINE_THRESHOLD_STYLE.dash} />
              </svg>
              <span className="sr-only">Machine-specific threshold</span>
            </dt>
            <dd>
              <span className="font-medium text-foreground">Machine-specific</span>{" "}
              {machineLine ? (
                <>
                  <span className="tabular-nums text-foreground">{formatThreshold(machineLine.value, unit)}</span>
                  <span className="text-muted-foreground"> · {machineLine.caption}. Unusual for this machine above this line.</span>
                </>
              ) : (
                <span className="text-muted-foreground">· {thresholds.machineUnavailable ?? "Not available"}</span>
              )}
            </dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="flex shrink-0 items-center gap-1.5 pt-1.5">
              <svg aria-hidden="true" width="22" height="2" className="overflow-visible">
                <line x1="0" y1="1" x2="22" y2="1" stroke={ENGINEERING_THRESHOLD_STYLE.stroke} strokeWidth="2" strokeDasharray={ENGINEERING_THRESHOLD_STYLE.dash} />
              </svg>
              <span className="sr-only">Engineering threshold</span>
            </dt>
            <dd>
              <span className="font-medium text-foreground">Engineering</span>{" "}
              {engineeringLine ? (
                <>
                  <span className="tabular-nums text-foreground">{formatThreshold(engineeringLine.value, unit)}</span>
                  <span className="text-muted-foreground">
                    {" "}· {engineeringLine.caption}. Objectively high above this line
                    {drawEngineering ? "" : " (above this chart's range, not drawn)"}.
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">· {thresholds.engineeringUnavailable ?? "Not configured"}</span>
              )}
            </dd>
          </div>
        </dl>
      ) : null}
      {summary ? (
        <dl className="grid grid-cols-3 gap-2 text-sm">
          {[
            ["+15 min", summary.plus15],
            ["+30 min", summary.plus30],
            ["+60 min", summary.plus60],
          ].map(([heading, value]) => (
            <div key={String(heading)} className="border border-border bg-muted/30 px-2 py-1.5">
              <dt className="text-xs text-muted-foreground">{heading}</dt>
              <dd className="font-semibold tabular-nums">
                {typeof value === "number" ? `${formatHorizonValue(value)}${unit ? ` ${unit}` : ""}` : "—"}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}
