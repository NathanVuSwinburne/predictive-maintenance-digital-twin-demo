"use client";

import { ArrowCounterClockwiseIcon, ClockCounterClockwiseIcon } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HistoryEntry, LogEntry } from "@/lib/demo-knowledge/types";

/**
 * Two chronologies side by side, because they answer different questions.
 *
 * The log is the vault's: every write, with the reason its author gave. The history is one page's:
 * the previous versions, restorable. Keeping the reason next to the version is the point — a
 * timestamp tells a future reader when something changed and nothing about why.
 */

const OPERATION_TONE: Record<LogEntry["operation"], string> = {
  create: "border-[var(--status-healthy)]/45 text-[var(--status-healthy)]",
  update: "border-border text-muted-foreground",
  delete: "border-destructive/45 text-destructive",
  restore: "border-[var(--status-watch)]/50 text-[var(--status-watch)]",
  ingest: "border-[var(--chart-2)]/50 text-[var(--chart-2)]",
  seed: "border-border text-muted-foreground",
};

export function HistoryPanel({
  pageId,
  history,
  log,
  onRestore,
  onOpenNote,
  onClose,
}: {
  pageId: string | null;
  history: HistoryEntry[];
  log: LogEntry[];
  onRestore: (stamp: string) => void;
  onOpenNote: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b bg-muted/25 p-3">
        <div>
          <p className="instrument-label">Chronology</p>
          <p className="flex items-center gap-1.5 text-sm font-semibold tracking-[-0.02em]">
            <ClockCounterClockwiseIcon /> History and log
          </p>
        </div>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Back to the page
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3.5">
        <p className="instrument-label mb-1.5">
          {pageId ? `Earlier versions of ${pageId}` : "Earlier versions"}
        </p>
        {history.length === 0 ? (
          <p className="mb-4 text-[11px] leading-4 text-muted-foreground">
            No earlier versions — this page has only been written once. Every save from here on
            snapshots the previous text, which is exactly why editing is allowed to be casual.
          </p>
        ) : (
          <div className="mb-4 flex flex-col gap-1.5">
            {history.map((entry) => (
              <div
                key={entry.stamp}
                className="flex items-center justify-between gap-2 rounded-lg border bg-card px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[11px]">{entry.stamp}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{entry.reason}</p>
                </div>
                <Button size="xs" variant="ghost" onClick={() => onRestore(entry.stamp)}>
                  <ArrowCounterClockwiseIcon /> Restore
                </Button>
              </div>
            ))}
          </div>
        )}

        <p className="instrument-label mb-1.5">Wiki log</p>
        <p className="mb-2 text-[11px] leading-4 text-muted-foreground">
          Append-only. A reason is required on every write, because it is the only thing a future
          reader gets.
        </p>
        <div className="flex flex-col gap-1.5">
          {[...log].reverse().map((entry, position) => (
            <div key={`${entry.stamp}-${position}`} className="rounded-lg border bg-card px-2.5 py-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[10px] ${OPERATION_TONE[entry.operation]}`}>
                  {entry.operation}
                </Badge>
                <span className="font-mono text-[10px] text-muted-foreground">{entry.stamp}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{entry.actor}</span>
              </div>
              <button
                type="button"
                className="mt-1 block truncate font-mono text-[11px] text-primary underline-offset-2 hover:underline"
                onClick={() => onOpenNote(entry.page)}
              >
                {entry.page}
              </button>
              <p className="text-[11px] leading-4 text-muted-foreground">{entry.reason}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
