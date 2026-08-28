/**
 * The vault, in memory.
 *
 * A module-scope store read through `useSyncExternalStore`, the same seam the MLOps workspace uses.
 * There is no backend in this build, so "the file on disk" is a string in a Map — but everything
 * downstream of that string is real: the graph, the search index and the lint report are all
 * derived from the markdown on read, so an edit in the pane changes the graph in the same frame,
 * exactly as it would against a filesystem.
 *
 * Two rules are enforced here rather than hidden in the UI, because a rule you can see refused is
 * a rule you believe: `raw/` is immutable, and `agent/` is the assistant's own instructions and so
 * is not the assistant's to rewrite.
 */

import { SEED_PAGES, WRITABLE_NAMESPACES } from "./corpus";
import { slugify } from "./frontmatter";
import { buildGraph, buildIndex, noteDetail, resolveTarget, type VaultIndex } from "./graph";
import { lint } from "./lint";
import { buildCorpus, search as runSearch } from "./search";
import type {
  GraphFilters,
  HistoryEntry,
  KnowledgeGraph,
  LintReport,
  LogEntry,
  NoteDetail,
  SearchHit,
} from "./types";

/** Keeps the last N versions of a page. Nothing written here is unrecoverable. */
const HISTORY_LIMIT = 20;

export class VaultError extends Error {}

type State = {
  pages: Map<string, string>;
  log: LogEntry[];
  history: Map<string, HistoryEntry[]>;
  /** Bumped on every mutation; the derived index is memoized against it. */
  revision: number;
};

function seedState(): State {
  return {
    pages: new Map(Object.entries(SEED_PAGES)),
    log: [
      {
        stamp: "2026-08-26 15:01 UTC",
        operation: "seed",
        page: "vault",
        reason: `${Object.keys(SEED_PAGES).length} pages seeded`,
        actor: "seed",
      },
    ],
    history: new Map(),
    revision: 0,
  };
}

let state: State = seedState();
const listeners = new Set<() => void>();

// The snapshot must be referentially stable between mutations or `useSyncExternalStore` loops.
let snapshot: VaultSnapshot | null = null;
let derived: { revision: number; index: VaultIndex; corpus: ReturnType<typeof buildCorpus> } | null =
  null;

export type VaultSnapshot = {
  revision: number;
  pageCount: number;
  log: LogEntry[];
};

function currentIndex() {
  if (!derived || derived.revision !== state.revision) {
    const index = buildIndex(Object.fromEntries(state.pages));
    derived = { revision: state.revision, index, corpus: buildCorpus(index) };
  }
  return derived;
}

function emit() {
  state.revision += 1;
  snapshot = null;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): VaultSnapshot {
  if (!snapshot) {
    snapshot = { revision: state.revision, pageCount: state.pages.size, log: state.log };
  }
  return snapshot;
}

/** The server renders the seeded vault; the client takes over from the same state. */
export function getServerSnapshot(): VaultSnapshot {
  return getSnapshot();
}

// --- reads --------------------------------------------------------------------------------

export function getGraph(filters: GraphFilters = {}): KnowledgeGraph {
  return buildGraph(currentIndex().index, filters);
}

export function getNote(id: string): NoteDetail | null {
  const { index } = currentIndex();
  return noteDetail(index, resolveTarget(index, id));
}

export function search(query: string, options?: { namespace?: string | null; limit?: number }): SearchHit[] {
  const { index, corpus } = currentIndex();
  return runSearch(index, corpus, query, options);
}

export function getLint(): LintReport {
  return lint(currentIndex().index);
}

export function getLog(): LogEntry[] {
  return state.log;
}

export function getHistory(id: string): HistoryEntry[] {
  return state.history.get(id) ?? [];
}

/** Whether a wikilink target resolves to a page that exists. Used by the editor's preview. */
export function pageExists(target: string): boolean {
  const { index } = currentIndex();
  return index.notes.has(resolveTarget(index, target));
}

export function resolve(target: string): string {
  return resolveTarget(currentIndex().index, target);
}

/** The `sources/` pages, in reading order, for the provenance panel. */
export function listNamespace(namespace: string) {
  const { index } = currentIndex();
  return [...index.notes.values()]
    .filter((note) => note.namespace === namespace || note.namespace.startsWith(namespace + "/"))
    .sort((a, b) => a.title.localeCompare(b.title));
}

// --- writes -------------------------------------------------------------------------------

function stamp(): string {
  const now = new Date();
  return now.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function guardWritable(id: string) {
  const head = id.split("/")[0];
  if (head === "raw") {
    throw new VaultError(
      "raw/ is immutable. Originals are never edited — summarise this into a sources/ page instead.",
    );
  }
  if (head === "agent") {
    throw new VaultError(
      "agent/ holds the assistant's own operating instructions, which a person owns. Edit it outside the pane.",
    );
  }
}

function appendLog(entry: LogEntry) {
  state.log = [...state.log, entry];
}

function snapshotHistory(id: string, reason: string) {
  const previous = state.pages.get(id);
  if (previous === undefined) {
    return;
  }
  const entries = state.history.get(id) ?? [];
  const next = [{ stamp: stamp(), content: previous, reason }, ...entries].slice(0, HISTORY_LIMIT);
  state.history.set(id, next);
}

export function savePage(id: string, content: string, reason: string): void {
  guardWritable(id);
  if (!state.pages.has(id)) {
    throw new VaultError(`No page at ${id}.`);
  }
  if (!reason.trim()) {
    throw new VaultError(
      "A save needs a reason. It lands in the log and is the only thing a future reader gets.",
    );
  }
  snapshotHistory(id, reason.trim());
  state.pages.set(id, content);
  appendLog({
    stamp: stamp(),
    operation: "update",
    page: id,
    reason: reason.trim(),
    actor: "user",
  });
  emit();
}

export function createPage(
  namespace: string,
  title: string,
  options: { content?: string; reason?: string } = {},
): string {
  const head = namespace.split("/")[0];
  if (!(WRITABLE_NAMESPACES as readonly string[]).includes(head)) {
    throw new VaultError(
      `New pages go in ${WRITABLE_NAMESPACES.join(", ")} — not ${head}.`,
    );
  }
  const slug = slugify(title);
  if (!slug) {
    throw new VaultError("A page needs a title.");
  }
  const id = `${namespace}/${slug}`;
  if (state.pages.has(id)) {
    throw new VaultError(`${id} already exists.`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const content =
    options.content ??
    [
      "---",
      `title: ${title}`,
      `namespace: ${namespace}`,
      "type: concept",
      "tags: []",
      `updated: ${today}`,
      "updated_by: user",
      "confidence: low",
      "---",
      "",
      `# ${title}`,
      "",
      "Written from the knowledge pane. Nothing here is sourced yet, which is what",
      "`confidence: low` is for — link it to the pages that wanted it, then fill it in.",
      "",
    ].join("\n");

  state.pages.set(id, content);
  appendLog({
    stamp: stamp(),
    operation: "create",
    page: id,
    reason: options.reason ?? "created from the knowledge pane",
    actor: "user",
  });
  emit();
  return id;
}

export function deletePage(id: string, reason: string): void {
  guardWritable(id);
  if (!state.pages.has(id)) {
    throw new VaultError(`No page at ${id}.`);
  }
  snapshotHistory(id, reason);
  state.pages.delete(id);
  appendLog({ stamp: stamp(), operation: "delete", page: id, reason, actor: "user" });
  emit();
}

export function restorePage(id: string, historyStamp: string): void {
  guardWritable(id);
  const entries = state.history.get(id) ?? [];
  const entry = entries.find((candidate) => candidate.stamp === historyStamp);
  if (!entry) {
    throw new VaultError("That version is no longer held.");
  }
  snapshotHistory(id, `restoring ${historyStamp}`);
  state.pages.set(id, entry.content);
  appendLog({
    stamp: stamp(),
    operation: "restore",
    page: id,
    reason: `restored the version from ${historyStamp}`,
    actor: "user",
  });
  emit();
}

/** Back to the seeded vault. The demo is meant to be explored and then handed to the next reader. */
export function resetVault(): void {
  state = seedState();
  derived = null;
  emit();
}

/** Test seam: a fresh index over an arbitrary set of pages, without touching the live store. */
export function indexOf(pages: Record<string, string>): VaultIndex {
  return buildIndex(pages);
}
