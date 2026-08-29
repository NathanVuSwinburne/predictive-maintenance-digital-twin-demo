"use client";

import { FileTextIcon, LockSimpleIcon } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NoteRecord } from "@/lib/demo-knowledge/types";
import { cn } from "@/lib/utils";

/**
 * Provenance, as a list rather than an upload form.
 *
 * The production pane has a file input here: drop a document into `raw/`, ask the assistant to
 * write its `sources/` page. There is no server in this build, so the upload half is honestly
 * absent — what remains is the half that carries the argument, which is that every number in
 * `domain/` and `concepts/` traces to a page naming a real, fetchable document.
 */

/** Pulls the `| Kind | **Primary.** … |` row out of a source page, which is its own summary. */
function kindOf(note: NoteRecord): { label: string; detail: string } | null {
  const row = /^\|\s*Kind\s*\|\s*(.+?)\s*\|\s*$/m.exec(note.body);
  if (!row) {
    return null;
  }
  const text = row[1].replace(/\*\*/g, "").trim();
  const stop = text.search(/[.,]/);
  const label = stop > 0 ? text.slice(0, stop) : text;
  const detail = stop > 0 ? text.slice(stop + 1).trim() : "";
  return { label, detail };
}

const KIND_TONE: Record<string, string> = {
  Primary: "border-[var(--status-healthy)]/45 text-[var(--status-healthy)]",
  Secondary: "border-border text-muted-foreground",
  Paywalled: "border-[var(--status-watch)]/50 text-[var(--status-watch)]",
  Internal: "border-destructive/45 text-destructive",
};

function toneFor(label: string) {
  const head = label.split(/[\s,]/)[0];
  return KIND_TONE[head] ?? "border-border text-muted-foreground";
}

export function SourcesPanel({
  sources,
  raw,
  citationCounts,
  onOpenNote,
  onClose,
}: {
  sources: NoteRecord[];
  raw: NoteRecord[];
  citationCounts: Map<string, number>;
  onOpenNote: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b bg-muted/25 p-3">
        <div>
          <p className="instrument-label">Provenance</p>
          <p className="flex items-center gap-1.5 text-sm font-semibold tracking-[-0.02em]">
            <FileTextIcon /> Where the numbers come from
          </p>
        </div>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Back to the page
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3.5">
        <p className="mb-3 text-xs leading-5 text-muted-foreground">
          One page per external document, carrying its citation, what was taken from it, and what it
          does not cover. A page that states a threshold without one of these behind it is what the
          lint calls an unsourced claim.
        </p>

        <div className="flex flex-col gap-1.5">
          {sources.map((note) => {
            const kind = kindOf(note);
            const cited = citationCounts.get(note.id) ?? 0;
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => onOpenNote(note.id)}
                className="rounded-lg border bg-card p-2.5 text-left transition-colors hover:bg-muted"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium">{note.title}</span>
                  {kind && (
                    <Badge variant="outline" className={cn("shrink-0 text-[10px]", toneFor(kind.label))}>
                      {kind.label}
                    </Badge>
                  )}
                </div>
                {kind?.detail && (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                    {kind.detail}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {cited === 0
                    ? "nothing cites this yet"
                    : cited === 1
                      ? "1 page cites this"
                      : `${cited} pages cite this`}
                </p>
              </button>
            );
          })}
        </div>

        {raw.length > 0 && (
          <>
            <p className="instrument-label mt-5 mb-1.5 flex items-center gap-1">
              <LockSimpleIcon /> Immutable originals
            </p>
            <p className="mb-2 text-[11px] leading-4 text-muted-foreground">
              Never edited, so any claim made about them elsewhere can be checked against the text
              itself.
            </p>
            <div className="flex flex-col gap-1.5">
              {raw.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => onOpenNote(note.id)}
                  className="rounded-lg border border-dashed bg-card p-2.5 text-left text-xs transition-colors hover:bg-muted"
                >
                  {note.title}
                  <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                    {note.id}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
