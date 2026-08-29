"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import type { Stage } from "@/lib/demo-mlops/types";

export const STAGES: Array<{ id: Stage; label: string; caption: string }> = [
  { id: "machine", label: "Machine", caption: "Pick the registry entry" },
  { id: "data", label: "Machine data", caption: "Inspect what it sends" },
  { id: "prepare", label: "Prepare", caption: "Write the recipe" },
  { id: "train", label: "Train", caption: "Fit and score a model" },
];

type Props = {
  current: Stage;
  complete: Record<Stage, boolean>;
  onChange: (stage: Stage) => void;
};

export function WorkflowNav({ current, complete, onChange }: Props) {
  return (
    <nav aria-label="Workflow steps" className="overflow-x-auto">
      <ol className="grid min-w-[600px] grid-cols-4 gap-2">
        {STAGES.map((stage, index) => {
          const isCurrent = stage.id === current;
          const isComplete = complete[stage.id];
          return (
            <li key={stage.id}>
              <button
                type="button"
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => onChange(stage.id)}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  isCurrent
                    ? "border-primary bg-primary/8"
                    : "border-border bg-card hover:border-primary/40 hover:bg-accent/40",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold",
                    isComplete
                      ? "bg-[var(--status-healthy)] text-background"
                      : isCurrent
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {isComplete ? <CheckCircleIcon weight="fill" className="size-4" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{stage.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {stage.caption}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
