"use client";

import { StethoscopeIcon } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LintKey, LintReport } from "@/lib/demo-knowledge/types";

/**
 * Lint — the third operation, after ingest and query. Everything it reports is a piece of work
 * rather than a violation: a wanted page is a page worth writing, an orphan is a page nobody can
 * find, an unsourced number is a claim waiting for a citation. Framing them as errors would be
 * wrong, because a vault under active use always has some.
 */

type Group = {
  key: LintKey;
  label: string;
  meaning: string;
  severe?: boolean;
};

const GROUPS: Group[] = [
  {
    key: "duplicates",
    label: "Two pages, one subject",
    meaning:
      "The same name or title in two files. One holds the content, the other takes the name — merge them and delete the loser.",
    severe: true,
  },
  {
    key: "unsourced_claims",
    label: "Unsourced numbers",
    meaning:
      "States a threshold or a formula with no sources: entry and no Unsourced callout. A number nobody can trace is folklore.",
    severe: true,
  },
  {
    key: "missing_frontmatter",
    label: "Missing frontmatter",
    meaning: "No title or no type, so the graph cannot place it.",
    severe: true,
  },
  {
    key: "orphans",
    label: "Orphans",
    meaning: "Nothing links here, so it is reachable only by already knowing it exists.",
  },
  {
    key: "broken_links",
    label: "Links to nowhere",
    meaning: "Points at a page that has not been written yet.",
  },
  {
    key: "wanted",
    label: "Wanted pages",
    meaning: "Referenced but unwritten. This is the worklist, not a defect.",
  },
  {
    key: "conflicts",
    label: "Flagged conflicts",
    meaning:
      "Recorded disagreements between sources. Deliberately left visible rather than silently resolved.",
  },
  {
    key: "stale",
    label: "Stale",
    meaning: "Not updated in over 90 days.",
  },
];

export function LintPanel({
  report,
  onOpenNote,
  onClose,
}: {
  report: LintReport | null;
  onOpenNote: (id: string) => void;
  onClose: () => void;
}) {
  if (!report) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b bg-muted/25 p-3">
        <div>
          <p className="instrument-label">Lint</p>
          <p className="flex items-center gap-1.5 text-sm font-semibold tracking-[-0.02em]">
            <StethoscopeIcon /> Wiki health
          </p>
        </div>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Back to the page
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3.5">
        <p className="mb-3 text-xs leading-5 text-muted-foreground">
          {report.stats.notes} pages, {report.stats.edges} links.{" "}
          {report.healthy
            ? "Nothing is broken. Everything below is work someone chose to leave visible."
            : "Everything below is a piece of work, not an error."}
        </p>

        <div className="flex flex-col gap-4">
          {GROUPS.map((group) => {
            const findings = report.findings[group.key] ?? [];
            if (findings.length === 0) {
              return null;
            }
            return (
              <div key={group.key}>
                <p className="mb-1 flex items-center gap-2 text-xs font-medium">
                  {group.label}
                  <Badge variant={group.severe ? "destructive" : "outline"}>{findings.length}</Badge>
                </p>
                <p className="mb-1.5 text-[11px] leading-4 text-muted-foreground">{group.meaning}</p>
                <div className="flex flex-col gap-1">
                  {findings.slice(0, 20).map((finding, position) => (
                    <button
                      key={`${group.key}-${position}`}
                      type="button"
                      disabled={!finding.id}
                      onClick={() => finding.id && onOpenNote(finding.id)}
                      className="rounded-md border bg-card px-2 py-1.5 text-left text-[11px] transition-colors enabled:hover:bg-muted disabled:text-muted-foreground"
                    >
                      <span className="block truncate">{finding.label}</span>
                      {finding.detail && (
                        <span className="block truncate text-muted-foreground">{finding.detail}</span>
                      )}
                    </button>
                  ))}
                  {findings.length > 20 && (
                    <p className="text-[11px] text-muted-foreground">
                      …and {findings.length - 20} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
