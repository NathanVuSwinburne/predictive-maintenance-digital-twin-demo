/** Types for the knowledge vault. Everything is derived from markdown; nothing here is stored. */

export type Confidence = "high" | "medium" | "low";

export type NoteMeta = {
  title?: string;
  namespace?: string;
  type?: string;
  tags: string[];
  aliases: string[];
  updated?: string;
  updatedBy?: string;
  confidence?: Confidence;
  /**
   * Every list-valued frontmatter key whose values are wikilinks, keyed by the key itself. This is
   * what lets someone invent `mitigated_by` in the editor and see the edge in the graph without a
   * code change.
   */
  edges: Record<string, string[]>;
};

export type NoteRecord = {
  id: string;
  title: string;
  namespace: string;
  type: string | null;
  tags: string[];
  aliases: string[];
  updated: string | null;
  updatedBy: string | null;
  confidence: Confidence | null;
  /** The full markdown, frontmatter included: what the editor shows in source mode. */
  content: string;
  /** The markdown below the frontmatter: what the preview renders. */
  body: string;
  bytes: number;
  bodyLinks: string[];
  frontmatterEdges: Record<string, string[]>;
};

export type GraphNode = {
  id: string;
  title: string;
  namespace: string;
  type: string | null;
  tags: string[];
  /** False for a wanted page: linked to, not written yet. Drawn dashed and unfilled. */
  exists: boolean;
  inDegree: number;
  outDegree: number;
};

export type GraphEdge = {
  source: string;
  target: string;
  /** `link` for a body wikilink, otherwise the frontmatter key that declared it. */
  type: string;
};

export type GraphStats = {
  notes: number;
  edges: number;
  wanted: number;
  namespaces: Record<string, number>;
};

export type KnowledgeGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
  /** Nodes dropped by a node cap. Reported, never silent. */
  truncated: number;
};

export type NoteLink = {
  id: string;
  title: string;
  relation: string;
  exists: boolean;
};

export type NoteDetail = NoteRecord & {
  backlinks: NoteLink[];
  outbound: NoteLink[];
};

export type SearchHit = {
  id: string;
  title: string;
  namespace: string;
  score: number;
  /** Why this hit scored, in words. An exact title match should be distinguishable from a mention. */
  why: string;
  snippet: string;
  updated: string | null;
};

export type LintFinding = {
  id: string | null;
  label: string;
  detail: string | null;
};

export type LintKey =
  | "duplicates"
  | "unsourced_claims"
  | "broken_links"
  | "orphans"
  | "wanted"
  | "conflicts"
  | "missing_frontmatter"
  | "stale";

export type LintReport = {
  healthy: boolean;
  counts: Record<LintKey, number>;
  findings: Record<LintKey, LintFinding[]>;
  stats: GraphStats;
};

export type LogEntry = {
  stamp: string;
  operation: "create" | "update" | "delete" | "restore" | "ingest" | "seed";
  page: string;
  reason: string;
  actor: "user" | "agent" | "seed";
};

export type HistoryEntry = {
  stamp: string;
  content: string;
  reason: string;
};

export type GraphFilters = {
  namespace?: string | null;
  around?: string | null;
  depth?: number;
  includeTags?: boolean;
  includeWanted?: boolean;
};
