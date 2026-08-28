"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowCounterClockwiseIcon,
  FloppyDiskIcon,
  LinkSimpleIcon,
  LockSimpleIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { NoteDetail } from "@/lib/demo-knowledge/types";
import { cn } from "@/lib/utils";

const WIKILINK = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

/**
 * Renders `[[target]]` as a button that opens the target, so the preview is navigable the way the
 * graph is. A link to a page that does not exist yet renders dashed and offers to create it.
 */
function LinkedText({
  text,
  resolve,
  onNavigate,
  onCreate,
}: {
  text: string;
  resolve: (target: string) => boolean;
  onNavigate: (target: string) => void;
  onCreate: (target: string) => void;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  // A fresh regex per call — a shared global one carries `lastIndex` between calls.
  const pattern = new RegExp(WIKILINK.source, "g");

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }
    const target = match[1].trim();
    const label = (match[2] ?? target).trim();
    const exists = resolve(target);
    parts.push(
      <button
        key={`${target}-${match.index}`}
        type="button"
        onClick={() => (exists ? onNavigate(target) : onCreate(target))}
        className={cn(
          "underline underline-offset-2 transition-opacity hover:opacity-75",
          exists
            ? "text-primary"
            : "text-muted-foreground decoration-dashed hover:text-foreground",
        )}
        title={exists ? target : `${target} — not written yet. Click to create it.`}
      >
        {label}
      </button>,
    );
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return <>{parts}</>;
}

type Props = {
  note: NoteDetail | null;
  isReadOnly: boolean;
  readOnlyReason: string | null;
  onSave: (content: string, reason: string) => void;
  onDelete: () => void;
  onNavigate: (target: string) => void;
  onCreate: (target: string) => void;
  resolveLink: (target: string) => boolean;
  onShowHistory: () => void;
};

export function NoteEditor({
  note,
  isReadOnly,
  readOnlyReason,
  onSave,
  onDelete,
  onNavigate,
  onCreate,
  resolveLink,
  onShowHistory,
}: Props) {
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setDraft(note?.content ?? "");
    setReason("");
    setIsEditing(false);
  }, [note?.id, note?.content]);

  const isDirty = note !== null && draft !== note.content;

  function renderChildren(children: React.ReactNode): React.ReactNode {
    if (typeof children === "string") {
      return (
        <LinkedText text={children} resolve={resolveLink} onNavigate={onNavigate} onCreate={onCreate} />
      );
    }
    if (Array.isArray(children)) {
      return children.map((child, position) =>
        typeof child === "string" ? (
          <LinkedText
            key={position}
            text={child}
            resolve={resolveLink}
            onNavigate={onNavigate}
            onCreate={onCreate}
          />
        ) : (
          child
        ),
      );
    }
    return children;
  }

  const previewComponents = useMemo(
    () => ({
      // Wikilinks are plain text as far as markdown is concerned, so they are resolved after
      // rendering, inside whatever element they landed in.
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="my-2.5 leading-relaxed">{renderChildren(children)}</p>
      ),
      li: ({ children }: { children?: React.ReactNode }) => (
        <li className="my-1 ml-4 list-disc leading-relaxed">{renderChildren(children)}</li>
      ),
      td: ({ children }: { children?: React.ReactNode }) => (
        <td className="border px-2 py-1.5 align-top">{renderChildren(children)}</td>
      ),
      th: ({ children }: { children?: React.ReactNode }) => (
        <th className="instrument-label border bg-muted/50 px-2 py-1.5 text-left">{children}</th>
      ),
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <blockquote className="my-3 rounded-lg border-l-2 border-primary bg-muted/40 px-3 py-2">
          {renderChildren(children)}
        </blockquote>
      ),
      table: ({ children }: { children?: React.ReactNode }) => (
        <div className="my-3 overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-xs">{children}</table>
        </div>
      ),
      code: ({ children }: { children?: React.ReactNode }) => (
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">{children}</code>
      ),
      pre: ({ children }: { children?: React.ReactNode }) => (
        <pre className="my-3 overflow-x-auto rounded-lg border bg-muted/40 p-3 text-[11px] leading-5">
          {children}
        </pre>
      ),
      a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline underline-offset-2"
        >
          {children}
        </a>
      ),
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1 className="mt-5 mb-2 text-base font-semibold tracking-[-0.02em]">{children}</h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2 className="mt-5 mb-2 text-sm font-semibold tracking-[-0.02em]">{children}</h2>
      ),
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="mt-4 mb-1.5 text-sm font-medium">{children}</h3>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note?.id, resolveLink],
  );

  if (!note) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Pick a page in the graph to read it.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b bg-muted/25 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="instrument-label">{note.namespace}</p>
            <h2 className="truncate text-sm font-semibold tracking-[-0.02em]" data-testid="note-title">
              {note.title}
            </h2>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{note.id}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="xs"
              variant={isEditing ? "secondary" : "ghost"}
              disabled={isReadOnly}
              onClick={() => setIsEditing((value) => !value)}
              title={readOnlyReason ?? undefined}
            >
              {isReadOnly ? <LockSimpleIcon /> : <PencilSimpleIcon />}
              {isEditing ? "Preview" : "Edit"}
            </Button>
            <Button size="icon-xs" variant="ghost" onClick={onShowHistory} title="Version history">
              <ArrowCounterClockwiseIcon />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={isReadOnly}
              onClick={onDelete}
              title={readOnlyReason ?? "Delete this page"}
            >
              <TrashIcon />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          {note.type && <Badge variant="outline">{note.type}</Badge>}
          {note.confidence && (
            <Badge variant={note.confidence === "low" ? "destructive" : "outline"}>
              confidence: {note.confidence}
            </Badge>
          )}
          {note.tags.slice(0, 5).map((tag) => (
            <Badge key={tag} variant="secondary">
              #{tag}
            </Badge>
          ))}
          {note.updated && (
            <span className="ml-auto">
              updated {note.updated}
              {note.updatedBy ? ` by ${note.updatedBy}` : ""}
            </span>
          )}
        </div>

        {isReadOnly && readOnlyReason && (
          <p className="rounded-lg border border-[var(--status-watch)]/45 bg-[var(--status-watch)]/10 px-2.5 py-1.5 text-[11px] leading-5">
            {readOnlyReason}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3.5 text-sm" data-testid="note-body">
        {isEditing ? (
          <textarea
            className="h-full min-h-[24rem] w-full resize-none rounded-lg border bg-background p-2.5 font-mono text-xs leading-5 outline-none focus-visible:border-ring"
            aria-label="Page source"
            value={draft}
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={previewComponents}>
            {note.body}
          </ReactMarkdown>
        )}
      </div>

      {isEditing && (
        <div className="flex items-center gap-2 border-t bg-muted/25 p-3">
          <Input
            className="h-8 flex-1 text-xs"
            placeholder="Why did this change? It goes into the wiki log."
            aria-label="Reason for this change"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button
            size="sm"
            disabled={!isDirty || reason.trim().length === 0}
            onClick={() => onSave(draft, reason)}
          >
            <FloppyDiskIcon /> Save
          </Button>
        </div>
      )}

      {!isEditing && (note.backlinks.length > 0 || note.outbound.length > 0) && (
        <div className="border-t bg-muted/15 p-3 text-[11px]" data-testid="note-links">
          {note.backlinks.length > 0 && (
            <div className="mb-2">
              <p className="instrument-label mb-1.5 flex items-center gap-1">
                <LinkSimpleIcon />
                {note.backlinks.length === 1
                  ? "1 page points here"
                  : `${note.backlinks.length} pages point here`}
              </p>
              <div className="flex flex-wrap gap-1">
                {note.backlinks.map((link) => (
                  <button
                    key={`${link.id}-${link.relation}`}
                    type="button"
                    onClick={() => onNavigate(link.id)}
                    className="rounded-md border bg-card px-1.5 py-0.5 transition-colors hover:bg-muted"
                    title={`via ${link.relation}`}
                  >
                    {link.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          {note.outbound.length > 0 && (
            <>
              <Separator className="my-2" />
              <p className="instrument-label mb-1.5">Links out</p>
              <div className="flex flex-wrap gap-1">
                {note.outbound.map((link) => (
                  <button
                    key={`${link.id}-${link.relation}`}
                    type="button"
                    onClick={() => (link.exists ? onNavigate(link.id) : onCreate(link.title))}
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 transition-colors hover:bg-muted",
                      link.exists
                        ? "bg-card"
                        : "border-dashed text-muted-foreground",
                    )}
                    title={link.exists ? `via ${link.relation}` : "Not written yet"}
                  >
                    {link.title}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
