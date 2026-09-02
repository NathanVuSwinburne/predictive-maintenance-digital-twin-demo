"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Stage } from "@/lib/demo-mlops/types";
import type { WorkflowStep } from "@/lib/demo-mlops/workflow";

type Props = {
  currentStage: Stage;
  steps: WorkflowStep[];
  onStageChange: (stage: Stage) => void;
};

export function WorkflowNav({ currentStage, steps, onStageChange }: Props) {
  return (
    <nav aria-label="Machine model setup" className="overflow-x-auto">
      <ol className="grid min-w-[640px] grid-cols-4 gap-2">
        {steps.map((step, index) => {
          const current = step.id === currentStage;

          return (
            <li key={step.id}>
              <Button
                type="button"
                variant={current ? "secondary" : "ghost"}
                className="h-auto w-full justify-start px-3 py-2 text-left"
                aria-current={current ? "step" : undefined}
                aria-label={`${index + 1} ${step.label}${step.complete ? ", complete" : ""}`}
                onClick={() => onStageChange(step.id)}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    // Production hardcodes black on white here, which has no dark mode to
                    // survive. Same hierarchy, told in theme tokens instead.
                    "flex w-5 shrink-0 items-center justify-center font-mono text-xs font-semibold",
                    step.complete
                      ? "text-[var(--status-healthy)]"
                      : current
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {step.complete ? <CheckCircleIcon weight="fill" /> : index + 1}
                </span>

                <span>{step.label}</span>
              </Button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
