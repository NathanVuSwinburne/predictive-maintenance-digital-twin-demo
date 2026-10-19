import * as vault from "@/lib/demo-knowledge/store";
import type { NoteDetail } from "@/lib/demo-knowledge/types";
import type {
  KnowledgeGraph,
  KnowledgeGraphQuery,
  KnowledgeHistoryEntry,
  KnowledgeLintReport,
  KnowledgeNoteDetail,
  KnowledgeNoteSummary,
  KnowledgeSearchHit,
} from "@/lib/domain/types";

/**
 * Projects the browser-side demo vault (`lib/demo-knowledge`) onto the production
 * knowledge contract, so provider callers (the chat's "Save to Knowledge Base") write
 * into the same vault the Knowledge pane reads.
 */

const pathOf = (id: string) => `${id}.md`;
const idOf = (pathOrId: string) => pathOrId.replace(/\.md$/, "");
const mtimeOf = (updated: string | null) => (updated ? Date.parse(updated) / 1000 || 0 : 0);

function excerptOf(body: string) {
  return body.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function summaryOf(note: NoteDetail): KnowledgeNoteSummary {
  return {
    id: note.id,
    path: pathOf(note.id),
    title: note.title,
    namespace: note.namespace,
    type: note.type,
    tags: note.tags,
    updated: note.updated,
    updatedBy: note.updatedBy,
    confidence: note.confidence,
    excerpt: excerptOf(note.body),
    mtime: mtimeOf(note.updated),
    size: note.bytes,
    inDegree: note.backlinks.length,
    outDegree: note.outbound.length,
  };
}

function detailOf(note: NoteDetail): KnowledgeNoteDetail {
  return {
    ...summaryOf(note),
    content: note.content,
    body: note.body,
    frontmatter: { title: note.title, namespace: note.namespace, type: note.type, tags: note.tags, aliases: note.aliases, confidence: note.confidence, ...note.frontmatterEdges },
    backlinks: note.backlinks.map((link) => ({ ...link, namespace: link.id.split("/")[0] })),
    outbound: note.outbound.map((link) => ({ ...link, namespace: link.id.split("/")[0] })),
  };
}

function requireNote(pathOrId: string): KnowledgeNoteDetail {
  const note = vault.getNote(idOf(pathOrId));
  if (!note) throw new vault.VaultError(`No page at ${idOf(pathOrId)}.`);
  return detailOf(note);
}

export const demoKnowledge = {
  listNotes(namespace?: string): KnowledgeNoteSummary[] {
    const graph = vault.getGraph({ namespace: namespace ?? null });
    return graph.nodes
      .filter((node) => node.exists && !node.id.startsWith("tag:"))
      .map((node) => vault.getNote(node.id))
      .filter((note): note is NoteDetail => Boolean(note))
      .map(summaryOf);
  },
  getNote: requireNote,
  saveNote(pathOrId: string, input: { content: string; reason?: string }) {
    vault.savePage(idOf(pathOrId), input.content, input.reason ?? "edited through the assistant");
    return requireNote(pathOrId);
  },
  createNote(input: { namespace: string; title: string; content?: string; reason?: string }) {
    return requireNote(vault.createPage(input.namespace, input.title, { content: input.content, reason: input.reason }));
  },
  deleteNote(pathOrId: string, reason?: string) {
    vault.deletePage(idOf(pathOrId), reason ?? "removed");
  },
  history(pathOrId: string): KnowledgeHistoryEntry[] {
    return vault.getHistory(idOf(pathOrId)).map((entry) => ({ stamp: entry.stamp, mtime: Date.parse(entry.stamp.replace(" UTC", "Z").replace(" ", "T")) / 1000 || 0, size: entry.content.length }));
  },
  restore(pathOrId: string, stamp: string) {
    vault.restorePage(idOf(pathOrId), stamp);
    return requireNote(pathOrId);
  },
  graph(query: KnowledgeGraphQuery = {}): KnowledgeGraph {
    const graph = vault.getGraph({ namespace: query.namespace ?? null, around: query.around ?? null, depth: query.depth, includeTags: query.includeTags, includeWanted: query.includeWanted });
    return {
      nodes: graph.nodes.map((node) => {
        const note = node.exists ? vault.getNote(node.id) : null;
        return { ...node, path: node.exists ? pathOf(node.id) : null, namespace: node.namespace || null, updated: note?.updated ?? null, updatedBy: note?.updatedBy ?? null, confidence: note?.confidence ?? null, size: note?.bytes ?? 0 };
      }),
      edges: graph.edges,
      stats: graph.stats,
      truncated: graph.truncated,
    };
  },
  search(query: string, options?: { namespace?: string; limit?: number }): KnowledgeSearchHit[] {
    return vault.search(query, options).map((hit) => ({ ...hit, path: pathOf(hit.id) }));
  },
  lint(): KnowledgeLintReport {
    const report = vault.getLint();
    return { stats: report.stats, counts: report.counts, healthy: report.healthy, findings: report.findings as unknown as KnowledgeLintReport["findings"] };
  },
  log(limit = 50): string[] {
    return vault.getLog().slice(-limit).map((entry) => `${entry.stamp} · ${entry.operation} · ${entry.page} · ${entry.reason}`);
  },
  reset() {
    const before = vault.getSnapshot().pageCount;
    vault.resetVault();
    return { restored: before, trashed: [] as string[], trashPath: "" };
  },
  capture(input: { title: string; content: string; namespace?: string; reason?: string }) {
    const namespace = input.namespace ?? "fleet";
    const today = new Date().toISOString().slice(0, 10);
    const content = [
      "---",
      `title: ${input.title}`,
      `namespace: ${namespace}`,
      "type: insight",
      "tags: [assistant-answer]",
      `updated: ${today}`,
      "updated_by: user",
      "confidence: medium",
      "---",
      "",
      `# ${input.title}`,
      "",
      "> Saved from an AI Assistant answer in the portfolio demo. Saving makes it reusable; it does not confirm it is correct.",
      "",
      input.content,
      "",
    ].join("\n");
    return requireNote(vault.createPage(namespace, input.title, { content, reason: input.reason ?? "saved from an AI Assistant answer" }));
  },
};
