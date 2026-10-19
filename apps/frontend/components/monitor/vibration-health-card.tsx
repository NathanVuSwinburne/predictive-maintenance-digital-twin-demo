"use client";

import { HeartbeatIcon } from "@phosphor-icons/react";

import { ENGINEERING_THRESHOLD_STYLE, MACHINE_THRESHOLD_STYLE } from "@/components/monitor/horizon-feature-chart";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EntityVibrationThresholds } from "@/lib/domain/types";
import {
  ENGINEERING_STATUS_COPY,
  MACHINE_STATUS_COPY,
  VIBRATION_LEVELS,
  engineeringCaption,
  formatMmPerSecond,
  levelName,
  machineThresholdCaption,
  type EngineeringCheckStatus,
  type LevelChoice,
  type MachineCheckStatus,
  type VibrationHealth,
} from "@/lib/domain/vibration-health";

type BadgeVariant = "success" | "warning" | "destructive" | "outline";

const MACHINE_VARIANT: Record<MachineCheckStatus, BadgeVariant> = {
  normal: "success",
  "above-normal": "warning",
  "insufficient-data": "outline",
  "level-unknown": "outline",
  "no-reading": "outline",
};

const ENGINEERING_VARIANT: Record<EngineeringCheckStatus, BadgeVariant> = {
  "within-limit": "success",
  elevated: "warning",
  critical: "destructive",
  "not-configured": "outline",
  incompatible: "outline",
  "no-reading": "outline",
};

type Props = {
  machineName: string;
  health: VibrationHealth;
  thresholds: EntityVibrationThresholds | null;
  thresholdsError?: string | null;
  choice: LevelChoice;
  onChoiceChange: (choice: LevelChoice) => void;
  predictedLabel: string | null;
  /** True when the readings are last-known values, not live. */
  lastKnown: boolean;
};

function LineSwatch({ stroke, dash }: { stroke: string; dash: string }) {
  return (
    <svg aria-hidden="true" width="22" height="2" className="shrink-0 overflow-visible">
      <line x1="0" y1="1" x2="22" y2="1" stroke={stroke} strokeWidth="2" strokeDasharray={dash} />
    </svg>
  );
}

/**
 * Two independent vibration checks side by side: "unusual for this machine"
 * (learned) and "objectively high" (engineering reference). Conservative copy:
 * these detect abnormal or concerning vibration; they do not predict failure.
 */
export function VibrationHealthCard({
  machineName,
  health,
  thresholds,
  thresholdsError,
  choice,
  onChoiceChange,
  predictedLabel,
  lastKnown,
}: Props) {
  const windowSeconds = health.axes.find((axis) => axis.live)?.live?.windowSeconds ?? 5;
  const engineering = thresholds?.engineering ?? null;
  const engineeringConfigured = health.axes.some((axis) => axis.engineering.limit !== null);
  const anyProvisionalBaseline = health.axes.some((axis) => axis.machine.provisional);
  const levelSourceText =
    health.level.source === "predicted"
      ? `predicted level ${levelName(health.level.level)}`
      : health.level.source === "manual"
        ? `chosen level ${levelName(health.level.level)}`
        : "no level yet";

  return (
    <section aria-labelledby="monitor-health-heading" className="flex flex-col gap-3 border border-border bg-card p-3" data-testid="health-checks">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="monitor-health-heading" className="flex items-center gap-1.5 text-base font-semibold">
            <HeartbeatIcon aria-hidden="true" />
            Health checks · vibration
          </h2>
          <p className="text-xs text-muted-foreground">
            RMS of the last {windowSeconds} s per axis, compared with the {levelSourceText}.
            {lastKnown ? " Based on the last-known readings." : ""}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1">
          <span className="text-xs text-muted-foreground" id="health-level-label">
            Compare with level
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={choice}
            aria-labelledby="health-level-label"
            onValueChange={(value) => {
              if (value) onChoiceChange(value as LevelChoice);
            }}
          >
            <ToggleGroupItem value="auto" title="Use the level predicted by the model">
              Auto{predictedLabel ? ` (${predictedLabel.toUpperCase()})` : ""}
            </ToggleGroupItem>
            {VIBRATION_LEVELS.map((level) => (
              <ToggleGroupItem key={level} value={level}>
                {levelName(level)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {thresholdsError ? <p className="text-sm text-muted-foreground">{thresholdsError}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2 border border-border p-3" data-testid="health-machine">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <LineSwatch {...MACHINE_THRESHOLD_STYLE} />
              Machine-specific
            </h3>
            <Badge variant={MACHINE_VARIANT[health.machineSummary]} data-testid="health-machine-status">
              {MACHINE_STATUS_COPY[health.machineSummary]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Is this unusual for {machineName}? Learned upper-normal boundary: the{" "}
            {thresholds?.machineSpecific.percentile ?? 99}th percentile of its own history at the same level and axis.
            Not an ISO limit.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 font-normal">Axis</th>
                <th className="py-1 font-normal">Current</th>
                <th className="py-1 font-normal">Upper normal</th>
                <th className="py-1 text-right font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {health.axes.map((axis) => (
                <tr key={axis.feature} className="border-t border-border" data-testid={`health-machine-${axis.axis}`}>
                  <td className="py-1 font-medium">{axis.axis}</td>
                  <td className="py-1 tabular-nums">{formatMmPerSecond(axis.live?.value, axis.unit)}</td>
                  <td className="py-1 tabular-nums" title={machineThresholdCaption(thresholds, axis.machine, axis.axis)}>
                    {formatMmPerSecond(axis.machine.threshold, axis.unit)}
                    {axis.machine.provisional ? <span className="text-muted-foreground"> *</span> : null}
                  </td>
                  <td className="py-1 text-right">
                    <Badge variant={MACHINE_VARIANT[axis.machine.status]}>{MACHINE_STATUS_COPY[axis.machine.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {anyProvisionalBaseline ? (
            <p className="text-xs text-muted-foreground">
              * Provisional: this level has few recorded sessions, so its normal range is uncertain.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border border-border p-3" data-testid="health-engineering">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <LineSwatch {...ENGINEERING_THRESHOLD_STYLE} />
              Engineering
            </h3>
            <Badge variant={ENGINEERING_VARIANT[health.engineeringSummary]} data-testid="health-engineering-status">
              {ENGINEERING_STATUS_COPY[health.engineeringSummary]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Is the vibration objectively high, even if this machine usually runs like this?
          </p>
          {engineeringConfigured ? (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 font-normal">Axis</th>
                    <th className="py-1 font-normal">Current</th>
                    <th className="py-1 font-normal">Limit (B/C)</th>
                    <th className="py-1 text-right font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {health.axes.map((axis) => (
                    <tr key={axis.feature} className="border-t border-border" data-testid={`health-engineering-${axis.axis}`}>
                      <td className="py-1 font-medium">{axis.axis}</td>
                      <td className="py-1 tabular-nums">{formatMmPerSecond(axis.live?.value, axis.unit)}</td>
                      <td className="py-1 tabular-nums">{formatMmPerSecond(axis.engineering.limit, axis.unit)}</td>
                      <td className="py-1 text-right">
                        <Badge variant={ENGINEERING_VARIANT[axis.engineering.status]}>
                          {ENGINEERING_STATUS_COPY[axis.engineering.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground">
                {engineeringCaption(health.axes.find((axis) => axis.engineering.limit !== null)!.engineering)}. Elevated
                above B/C ({formatMmPerSecond(engineering?.profile?.zoneBC)}), critical above C/D (
                {formatMmPerSecond(engineering?.profile?.zoneCD)}).
              </p>
            </>
          ) : (
            <div className="flex flex-col gap-1 text-sm" data-testid="health-engineering-unavailable">
              <p>{engineering?.message ?? "Engineering thresholds could not be loaded."}</p>
              {engineering?.requiredMeasurement ? (
                <p className="text-xs text-muted-foreground">Requires: {engineering.requiredMeasurement}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-2 text-sm">
        <p data-testid="health-interpretation">{health.interpretation}</p>
        <p className="text-xs text-muted-foreground">
          These checks flag unusual or concerning vibration. They do not predict failure or remaining life.
        </p>
      </div>
    </section>
  );
}
