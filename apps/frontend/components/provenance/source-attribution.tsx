"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  InformationProvenance,
} from "@/lib/domain/types";
import { informationSourcePresentation } from "@/lib/domain/presentation";
import { cn } from "@/lib/utils";

function humanList(values: string[]) {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function provenanceDescription(provenance: InformationProvenance) {
  const parts: string[] = [];
  if (provenance.basisSources.length) {
    parts.push(
      `Based on ${humanList(
        provenance.basisSources.map(
          (source) => informationSourcePresentation[source].label,
        ),
      )}`,
    );
  }
  for (const evidence of provenance.evidence) {
    const details = [
      evidence.label,
      evidence.reference ? `reference ${evidence.reference}` : null,
      evidence.timestamp ? `at ${evidence.timestamp}` : null,
      evidence.detail ?? null,
    ].filter(Boolean);
    parts.push(details.join(" · "));
  }
  return parts.join(". ");
}

type SourceAttributionProps = {
  provenance?: InformationProvenance | null;
  className?: string;
};

export function mergeInformationProvenance(
  items: Array<InformationProvenance | null | undefined>,
): InformationProvenance | null {
  const present = items.filter(
    (item): item is InformationProvenance => Boolean(item?.outputSources.length),
  );
  if (!present.length) return null;
  const evidence = [
    ...new Map(
      present
        .flatMap((item) => item.evidence)
        .map((item) => [
          JSON.stringify([
            item.source,
            item.label,
            item.reference ?? null,
            item.timestamp ?? null,
            item.detail ?? null,
          ]),
          item,
        ]),
    ).values(),
  ];
  return {
    outputSources: [...new Set(present.flatMap((item) => item.outputSources))],
    basisSources: [...new Set(present.flatMap((item) => item.basisSources))],
    evidence,
  };
}

export function SourceAttribution({
  provenance,
  className,
}: SourceAttributionProps) {
  if (!provenance?.outputSources.length) return null;

  const description = provenanceDescription(provenance);
  return (
    <TooltipProvider>
      <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
        {provenance.outputSources.map((source) => {
          const presentation = informationSourcePresentation[source];
          const sourceDescription = [presentation.description, description]
            .filter(Boolean)
            .join(" ");
          const ariaLabel = `${presentation.label}. ${sourceDescription}`;
          return (
            <Tooltip key={source}>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  tabIndex={0}
                  aria-label={ariaLabel}
                  className={cn(
                    "h-5 cursor-help px-1.5 text-[11px] font-normal transition-none",
                    presentation.className,
                  )}
                >
                  {presentation.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="block max-w-sm leading-relaxed">
                {sourceDescription}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </span>
    </TooltipProvider>
  );
}
