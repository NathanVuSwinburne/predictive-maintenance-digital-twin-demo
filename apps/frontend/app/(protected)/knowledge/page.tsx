"use client";

import { useCallback, useDeferredValue, useMemo, useState, useSyncExternalStore } from "react";
import {
  ArrowClockwiseIcon,
  FileTextIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  StethoscopeIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { GraphCanvas, namespaceColor } from "@/components/knowledge/graph-canvas";
import { HistoryPanel } from "@/components/knowledge/history-panel";
import { LintPanel } from "@/components/knowledge/lint-panel";
import { NoteEditor } from "@/components/knowledge/note-editor";
import { SourcesPanel } from "@/components/knowledge/sources-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createPage,
  deletePage,
  getGraph,
  getHistory,
  getLint,
  getLog,
  getNote,
  getServerSnapshot,
  getSnapshot,
  listNamespace,
  pageExists,
  resetVault,
  resolve,
  restorePage,
  savePage,
  search,
  subscribe,
  VaultError,
} from "@/lib/demo-knowledge/store";
import type { GraphNode } from "@/lib/demo-knowledge/types";
import { cn } from "@/lib/utils";

/** The right column shows one of four things at a time; the page is the default. */
type RightPane = "note" | "lint" | "sources" | "history";

const NAMESPACE_BLURB: Record<string, string> = {
  domain: "What the standards say",
  concepts: "How to read a model's own numbers",
  fleet: "What these machines actually do",
  sources: "Where every number came from",
  agent: "How the assistant works",
  raw: "Originals, never edited",
  root: "Conventions, catalogue and log",
};

export default function KnowledgePage() {
  // The vault lives outside React so an edit here survives a walk to the MLOps workspace and back.
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [noteId, setNoteId] = useState<string>("index");
  const [query, setQuery] = useState("");
  const [namespace, setNamespace] = useState<string | null>(null);
  const [includeWanted, setIncludeWanted] = useState(true);
  const [includeTags, setIncludeTags] = useState(false);
  const [focus, setFocus] = useState<{ id: string; depth: number } | null>(null);
  const [rightPane, setRightPane] = useState<RightPane>("note");

  // Searching on every keystroke over the whole corpus is affordable, but rendering the dimmed
  // graph on every keystroke is not. Deferring the query lets typing stay ahead of the layout.
  const deferredQuery = useDeferredValue(query);
  const revision = snapshot.revision;

  // Every read below is a function of the store rather than of props, so `revision` is named as a
  // dependency and consumed inside each memo. That keeps the store's change signal honest to the
  // exhaustive-deps rule instead of silencing it.
  const graph = useMemo(() => {
    void revision;
    return getGraph({ namespace, around: focus?.id, depth: focus?.depth, includeTags, includeWanted });
  }, [revision, namespace, focus, includeTags, includeWanted]);

  const note = useMemo(() => {
    void revision;
    return getNote(noteId);
  }, [revision, noteId]);

  const report = useMemo(() => {
    void revision;
    return getLint();
  }, [revision]);

  const log = useMemo(() => {
    void revision;
    return getLog();
  }, [revision]);

  const history = useMemo(() => {
    void revision;
    return note ? getHistory(note.id) : [];
  }, [revision, note]);

  const hits = useMemo(() => {
    void revision;
    return deferredQuery.trim().length < 2 ? null : search(deferredQuery, { limit: 12 });
  }, [revision, deferredQuery]);

  const highlightIds = useMemo(
    () => (hits ? new Set(hits.map((hit) => hit.id)) : undefined),
    [hits],
  );

  const sources = useMemo(() => {
    void revision;
    return listNamespace("sources");
  }, [revision]);

  const raw = useMemo(() => {
    void revision;
    return listNamespace("raw");
  }, [revision]);

  /** How many pages cite each source, which is the only measure of a source that matters. */
  const citationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of graph.edges) {
      if (edge.target.startsWith("sources/")) {
        counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
      }
    }
    return counts;
  }, [graph.edges]);

  const namespaces = useMemo(() => {
    const heads = new Map<string, number>();
    for (const [key, count] of Object.entries(graph.stats.namespaces)) {
      const head = key.split("/")[0];
      heads.set(head, (heads.get(head) ?? 0) + count);
    }
    return [...heads.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [graph.stats.namespaces]);

  const openNote = useCallback((target: string) => {
    const id = resolve(target);
    if (!getNote(id)) {
      toast.error(`No page at ${id} yet.`);
      return;
    }
    setNoteId(id);
    setRightPane("note");
  }, []);

  const create = useCallback(
    (title: string, preferredNamespace?: string) => {
      // A page created from a link inherits the namespace of the page that wanted it: a
      // `caused_by` link on a domain page means another domain page, not a stray note in
      // whatever namespace the filter happened to be showing.
      const target = preferredNamespace ?? title.includes("/") ? title.split("/")[0] : null;
      const chosen = target ?? note?.namespace.split("/")[0] ?? namespace ?? "concepts";
      const plainTitle = title.includes("/") ? title.split("/").pop()! : title;
      try {
        const id = createPage(chosen, plainTitle);
        toast.success(`Created ${id}`, {
          description: "Marked confidence: low until someone sources it.",
        });
        setNoteId(id);
        setRightPane("note");
      } catch (error) {
        toast.error(error instanceof VaultError ? error.message : "Unable to create that page");
      }
    },
    [namespace, note?.namespace],
  );

  const isReadOnly = note ? note.namespace.split("/")[0] === "raw" || note.namespace.split("/")[0] === "agent" : true;
  const readOnlyReason = !note
    ? null
    : note.namespace.startsWith("raw")
      ? "raw/ is immutable. The original is what every claim about it can be checked against — summarise it into a sources/ page instead."
      : note.namespace.startsWith("agent")
        ? "agent/ holds the assistant's own operating instructions. A person owns those, so they are not editable from the pane the assistant writes through."
        : null;

  function onSelectNode(node: GraphNode) {
    if (node.id.startsWith("tag:")) {
      return;
    }
    if (node.exists) {
      openNote(node.id);
    } else {
      create(node.id);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="instrument-label">Agent memory</p>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] md:text-3xl">
            Agent knowledge wiki
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Interlinked markdown the assistant reads before it answers and writes to when a turn
            produced something durable. The graph is not stored anywhere — it is derived from the
            pages on read, so an edit here changes the shape of it in the same frame.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const title = window.prompt("Title for the new page");
              if (title?.trim()) {
                create(title.trim());
              }
            }}
          >
            <PlusIcon aria-hidden="true" /> New page
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetVault();
              setNoteId("index");
              setFocus(null);
              setQuery("");
              toast.info("Vault reset", { description: "Back to the seeded pages." });
            }}
          >
            <ArrowClockwiseIcon aria-hidden="true" /> Reset
          </Button>
        </div>
      </div>

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="h-8 w-64 pl-8 text-xs"
              placeholder="Search the wiki"
              aria-label="Search the wiki"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <span className="text-xs text-muted-foreground">
            <span className="data-value">{graph.stats.notes}</span> pages ·{" "}
            <span className="data-value">{graph.stats.edges}</span> links ·{" "}
            <span className="data-value">{graph.stats.wanted}</span> not written yet
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="xs"
              variant={rightPane === "sources" ? "secondary" : "ghost"}
              onClick={() => setRightPane((current) => (current === "sources" ? "note" : "sources"))}
            >
              <FileTextIcon aria-hidden="true" /> Sources
            </Button>
            <Button
              size="xs"
              variant={rightPane === "lint" ? "secondary" : "ghost"}
              onClick={() => setRightPane((current) => (current === "lint" ? "note" : "lint"))}
            >
              <StethoscopeIcon aria-hidden="true" />
              {report.healthy ? "Wiki is healthy" : "Lint"}
            </Button>
            {!report.healthy && (
              <>
                {report.counts.orphans > 0 && (
                  <Badge variant="outline">{report.counts.orphans} orphans</Badge>
                )}
                {report.counts.unsourced_claims > 0 && (
                  <Badge variant="destructive">{report.counts.unsourced_claims} unsourced</Badge>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 p-3">
          <Button
            size="xs"
            variant={namespace === null ? "secondary" : "ghost"}
            onClick={() => {
              setNamespace(null);
              setFocus(null);
            }}
          >
            All
          </Button>
          {namespaces.map(([name, count]) => (
            <Button
              key={name}
              size="xs"
              variant={namespace === name ? "secondary" : "ghost"}
              title={NAMESPACE_BLURB[name]}
              onClick={() => {
                setNamespace(name);
                setFocus(null);
              }}
            >
              <span
                className="mr-0.5 inline-block size-2 rounded-full"
                style={{ background: namespaceColor(name) }}
                aria-hidden="true"
              />
              {name} ({count})
            </Button>
          ))}

          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

          <Button
            size="xs"
            variant={includeWanted ? "secondary" : "ghost"}
            onClick={() => setIncludeWanted((value) => !value)}
            title="Pages that are linked to but not written yet"
          >
            Wanted pages
          </Button>
          <Button
            size="xs"
            variant={includeTags ? "secondary" : "ghost"}
            onClick={() => setIncludeTags((value) => !value)}
          >
            Tags
          </Button>
          {focus && (
            <Button size="xs" variant="ghost" onClick={() => setFocus(null)}>
              Clear focus on {focus.id}
            </Button>
          )}
        </div>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_28rem]">
        <Card className="gap-0 overflow-hidden p-0">
          {hits && hits.length > 0 && (
            <div className="border-b bg-muted/25 p-2.5">
              <p className="instrument-label mb-1.5">
                {hits.length} matches
                {hits.length > 8 ? ", top 8 listed" : ""} — the graph dims everything else
              </p>
              <div className="flex flex-wrap gap-1">
                {hits.slice(0, 8).map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    onClick={() => openNote(hit.id)}
                    className="rounded-md border bg-card px-1.5 py-0.5 text-[11px] transition-colors hover:bg-muted"
                    title={hit.why}
                  >
                    {hit.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          {hits && hits.length === 0 && (
            <p className="border-b bg-muted/25 p-2.5 text-[11px] text-muted-foreground">
              Nothing matched. Navigating from <span className="font-mono">index</span> usually
              beats searching in a vault this size.
            </p>
          )}
          <GraphCanvas
            className="h-[34rem] w-full lg:h-[42rem]"
            graph={graph}
            selectedId={note?.id ?? null}
            highlightIds={highlightIds}
            onSelect={onSelectNode}
            onFocus={(node) => setFocus({ id: node.id, depth: 2 })}
          />
        </Card>

        <Card className="flex max-h-[52rem] min-h-[34rem] flex-col gap-0 overflow-hidden p-0 lg:min-h-[42rem]">
          {rightPane === "sources" ? (
            <SourcesPanel
              sources={sources}
              raw={raw}
              citationCounts={citationCounts}
              onOpenNote={openNote}
              onClose={() => setRightPane("note")}
            />
          ) : rightPane === "lint" ? (
            <LintPanel
              report={report}
              onOpenNote={(id) => {
                setRightPane("note");
                openNote(id);
              }}
              onClose={() => setRightPane("note")}
            />
          ) : rightPane === "history" ? (
            <HistoryPanel
              pageId={note?.id ?? null}
              history={history}
              log={log}
              onOpenNote={(id) => {
                setRightPane("note");
                openNote(id);
              }}
              onRestore={(stamp) => {
                if (!note) return;
                try {
                  restorePage(note.id, stamp);
                  toast.success("Restored", { description: `Back to the version from ${stamp}.` });
                  setRightPane("note");
                } catch (error) {
                  toast.error(error instanceof VaultError ? error.message : "Unable to restore");
                }
              }}
              onClose={() => setRightPane("note")}
            />
          ) : (
            <NoteEditor
              note={note}
              isReadOnly={isReadOnly}
              readOnlyReason={readOnlyReason}
              onSave={(content, reason) => {
                if (!note) return;
                try {
                  savePage(note.id, content, reason);
                  toast.success("Saved", {
                    description: "The assistant reads the new text on its next turn.",
                  });
                } catch (error) {
                  toast.error(error instanceof VaultError ? error.message : "Unable to save");
                }
              }}
              onDelete={() => {
                if (!note) return;
                if (!window.confirm(`Delete ${note.id}?`)) return;
                try {
                  deletePage(note.id, "deleted from the knowledge pane");
                  toast.success("Deleted", {
                    description:
                      "Every link to it is now a wanted page, so nothing about it is lost quietly.",
                  });
                  setNoteId("index");
                } catch (error) {
                  toast.error(error instanceof VaultError ? error.message : "Unable to delete");
                }
              }}
              onNavigate={openNote}
              onCreate={(target) => create(target)}
              resolveLink={pageExists}
              onShowHistory={() => setRightPane("history")}
            />
          )}
        </Card>
      </div>

      <p className={cn("text-xs leading-5 text-muted-foreground")}>
        Everything on this page runs in the browser. The vault is markdown held in memory, the graph
        and the search index are derived from it on read, and edits last until the tab is reloaded —
        which is what &ldquo;Reset&rdquo; does deliberately.
      </p>
    </div>
  );
}
