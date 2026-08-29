/**
 * The knowledge graph, derived from the markdown on read.
 *
 * There is no graph database and no stored adjacency list. Nodes are pages and edges are links
 * written inside the pages themselves, so nothing can drift out of sync with the text, because the
 * text *is* the graph. That is the property that lets someone edit a page in the pane and see the
 * new edge appear in the same frame.
 *
 * Edges come from three places:
 *
 * - `[[Wikilinks]]` in the body: edge type `link`
 * - any list-valued frontmatter key whose values are wikilinks: edge type is the key itself
 * - `tags:` gives edges to synthetic tag nodes, off by default
 *
 * A link to a page that does not exist yet becomes a **wanted** node rather than a dropped edge.
 * Those are not errors; they are the worklist.
 */

import { readMeta, titleFromId } from "./frontmatter";
import type {
  GraphEdge,
  GraphFilters,
  GraphNode,
  KnowledgeGraph,
  NoteDetail,
  NoteLink,
  NoteRecord,
} from "./types";

export const TAG_PREFIX = "tag:";

/** Above this the layout is unreadable and the simulation is the page's main cost. */
const MAX_NODES = 260;

export type VaultIndex = {
  notes: Map<string, NoteRecord>;
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  /** Resolution table: lowercased title, alias and filename stem → page id. */
  lookup: Map<string, string>;
};

function record(id: string, content: string): NoteRecord {
  const { meta, body } = readMeta(content);
  return {
    id,
    title: meta.title ?? titleFromId(id),
    namespace: meta.namespace ?? (id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "root"),
    type: meta.type ?? null,
    tags: meta.tags,
    aliases: meta.aliases,
    updated: meta.updated ?? null,
    updatedBy: meta.updatedBy ?? null,
    confidence: meta.confidence ?? null,
    content,
    body,
    bytes: content.length,
    bodyLinks: [],
    frontmatterEdges: meta.edges,
  };
}

/**
 * Builds the whole index in one pass over the pages. Cheap enough at this size that it is rebuilt
 * from scratch on every write rather than patched; a patched index is one more thing that can be
 * wrong, and being wrong here is invisible.
 */
export function buildIndex(pages: Record<string, string>): VaultIndex {
  const notes = new Map<string, NoteRecord>();
  const lookup = new Map<string, string>();

  for (const [id, content] of Object.entries(pages)) {
    const entry = record(id, content);
    const { body } = readMeta(content);
    entry.bodyLinks = extractBodyLinks(body);
    notes.set(id, entry);
  }

  // Resolution is by id first, then title, then alias, then filename stem. Registering the
  // weaker keys first means a genuine id always wins a collision.
  for (const note of notes.values()) {
    const stem = note.id.split("/").pop();
    if (stem) {
      lookup.set(stem.toLowerCase(), note.id);
    }
    for (const alias of note.aliases) {
      lookup.set(alias.toLowerCase(), note.id);
    }
    lookup.set(note.title.toLowerCase(), note.id);
  }
  for (const note of notes.values()) {
    lookup.set(note.id.toLowerCase(), note.id);
  }

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const note of notes.values()) {
    nodes.set(note.id, {
      id: note.id,
      title: note.title,
      namespace: note.namespace,
      type: note.type,
      tags: note.tags,
      exists: true,
      inDegree: 0,
      outDegree: 0,
    });
  }

  function resolve(target: string): string {
    const cleaned = target.trim();
    return lookup.get(cleaned.toLowerCase()) ?? cleaned;
  }

  function connect(source: string, rawTarget: string, type: string) {
    const target = resolve(rawTarget);
    if (target === source) {
      return;
    }
    if (!nodes.has(target)) {
      // A wanted page: linked to, not written. Kept as a node so the graph shows the gap.
      nodes.set(target, {
        id: target,
        title: titleFromId(target),
        namespace: target.includes("/") ? target.slice(0, target.lastIndexOf("/")) : "wanted",
        type: null,
        tags: [],
        exists: false,
        inDegree: 0,
        outDegree: 0,
      });
    }
    edges.push({ source, target, type });
  }

  for (const note of notes.values()) {
    for (const target of note.bodyLinks) {
      connect(note.id, target, "link");
    }
    for (const [relation, targets] of Object.entries(note.frontmatterEdges)) {
      for (const target of targets) {
        connect(note.id, target, relation);
      }
    }
  }

  for (const edge of edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (source) source.outDegree += 1;
    if (target) target.inDegree += 1;
  }

  return { notes, nodes, edges, lookup };
}

function extractBodyLinks(body: string): string[] {
  // Code is not prose. `AGENT-WIKI` explains the syntax by writing `[[link]]` inside backticks,
  // and treating those as real links fills the graph with wanted pages nobody meant to ask for.
  const prose = body.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
  const pattern = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
  const found: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(prose)) !== null) {
    const target = match[1].trim();
    if (target && !seen.has(target)) {
      seen.add(target);
      found.push(target);
    }
  }
  return found;
}

/** Resolve a wikilink target the way the graph does, so the editor and the graph agree. */
export function resolveTarget(index: VaultIndex, target: string): string {
  return index.lookup.get(target.trim().toLowerCase()) ?? target.trim();
}

function tagNodesFor(index: VaultIndex): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const counts = new Map<string, number>();
  const edges: GraphEdge[] = [];
  for (const note of index.notes.values()) {
    for (const tag of note.tags) {
      const id = TAG_PREFIX + tag;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      edges.push({ source: note.id, target: id, type: "tag" });
    }
  }
  const nodes: GraphNode[] = [...counts.entries()].map(([id, count]) => ({
    id,
    title: "#" + id.slice(TAG_PREFIX.length),
    namespace: "tag",
    type: "tag",
    tags: [],
    exists: true,
    inDegree: count,
    outDegree: 0,
  }));
  return { nodes, edges };
}

/** The set of nodes within `depth` hops of `start`, following edges in either direction. */
function neighbourhood(edges: GraphEdge[], start: string, depth: number): Set<string> {
  const reached = new Set<string>([start]);
  let frontier = [start];
  for (let step = 0; step < Math.max(1, depth); step += 1) {
    const next: string[] = [];
    for (const edge of edges) {
      if (frontier.includes(edge.source) && !reached.has(edge.target)) {
        reached.add(edge.target);
        next.push(edge.target);
      }
      if (frontier.includes(edge.target) && !reached.has(edge.source)) {
        reached.add(edge.source);
        next.push(edge.source);
      }
    }
    if (next.length === 0) {
      break;
    }
    frontier = next;
  }
  return reached;
}

/** The graph as the pane draws it, after the filters the pane offers. */
export function buildGraph(index: VaultIndex, filters: GraphFilters = {}): KnowledgeGraph {
  const includeWanted = filters.includeWanted ?? true;
  const includeTags = filters.includeTags ?? false;

  let nodes = [...index.nodes.values()];
  let edges = [...index.edges];

  if (includeTags) {
    const tagged = tagNodesFor(index);
    nodes = nodes.concat(tagged.nodes);
    edges = edges.concat(tagged.edges);
  }

  if (!includeWanted) {
    nodes = nodes.filter((node) => node.exists);
  }

  if (filters.namespace) {
    const head = filters.namespace;
    nodes = nodes.filter((node) => node.namespace === head || node.namespace.startsWith(head + "/"));
  }

  if (filters.around) {
    const reachable = neighbourhood(edges, filters.around, filters.depth ?? 1);
    nodes = nodes.filter((node) => reachable.has(node.id));
  }

  let truncated = 0;
  if (nodes.length > MAX_NODES) {
    // Keep the hubs. Dropping quietly would read as a complete picture, so the count is
    // reported back to the pane and shown.
    const ranked = [...nodes].sort((a, b) => b.inDegree + b.outDegree - (a.inDegree + a.outDegree));
    truncated = nodes.length - MAX_NODES;
    nodes = ranked.slice(0, MAX_NODES);
  }

  const kept = new Set(nodes.map((node) => node.id));
  edges = edges.filter((edge) => kept.has(edge.source) && kept.has(edge.target));

  const namespaces: Record<string, number> = {};
  for (const node of nodes) {
    if (!node.exists) continue;
    const head = node.namespace.split("/")[0];
    namespaces[head] = (namespaces[head] ?? 0) + 1;
  }

  return {
    nodes,
    edges,
    stats: {
      notes: [...index.nodes.values()].filter((node) => node.exists).length,
      edges: index.edges.length,
      wanted: [...index.nodes.values()].filter((node) => !node.exists).length,
      namespaces,
    },
    truncated,
  };
}

/** One page, with the two things a reader needs beside it: what it links to, and what links back. */
export function noteDetail(index: VaultIndex, id: string): NoteDetail | null {
  const note = index.notes.get(id);
  if (!note) {
    return null;
  }

  const backlinks: NoteLink[] = [];
  const outbound: NoteLink[] = [];
  const seenBack = new Set<string>();
  const seenOut = new Set<string>();

  for (const edge of index.edges) {
    if (edge.target === id && edge.source !== id) {
      const key = edge.source + "|" + edge.type;
      if (seenBack.has(key)) continue;
      seenBack.add(key);
      const node = index.nodes.get(edge.source);
      backlinks.push({
        id: edge.source,
        title: node?.title ?? edge.source,
        relation: edge.type,
        exists: node?.exists ?? false,
      });
    }
    if (edge.source === id && edge.target !== id) {
      const key = edge.target + "|" + edge.type;
      if (seenOut.has(key)) continue;
      seenOut.add(key);
      const node = index.nodes.get(edge.target);
      outbound.push({
        id: edge.target,
        title: node?.title ?? edge.target,
        relation: edge.type,
        exists: node?.exists ?? false,
      });
    }
  }

  return { ...note, backlinks, outbound };
}

/** Pages nothing links to. Reachable only by knowing they exist. */
export function orphans(index: VaultIndex): string[] {
  const linked = new Set(index.edges.map((edge) => edge.target));
  return [...index.notes.keys()].filter((id) => !linked.has(id)).sort();
}

/** Pages that are linked to but not written. The worklist. */
export function wantedPages(index: VaultIndex): string[] {
  return [...index.nodes.values()]
    .filter((node) => !node.exists)
    .map((node) => node.id)
    .sort();
}
