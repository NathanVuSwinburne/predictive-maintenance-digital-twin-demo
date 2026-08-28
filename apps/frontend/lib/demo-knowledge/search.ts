/**
 * Ranked lexical search over the vault. BM25 over the body, plus exact boosts for title, alias and
 * tag.
 *
 * No embeddings, and that is a decision rather than a shortcut. The wiki's value is that knowledge
 * is *compiled and linked*, so the primary way to find something is `index` → the page → its
 * `[[links]]`. Search is the fallback for when the reader does not know what the page is called.
 *
 * At this size BM25 is faster than a vector round trip, fully explainable — every hit can say
 * "it matched the title" — costs nothing, works offline, and needs no reindex after a write. The
 * point at which that stops being true is somewhere around a few hundred pages; a vault that
 * outgrows it should say so out loud rather than quietly getting worse.
 */

import type { SearchHit } from "./types";
import type { VaultIndex } from "./graph";

const TOKEN = /[a-z0-9]+/g;

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in",
  "is", "it", "of", "on", "or", "that", "the", "to", "was", "what", "when",
  "which", "with",
]);

const K1 = 1.2;
const B = 0.75;

export function tokenize(text: string): string[] {
  const found = String(text).toLowerCase().match(TOKEN) ?? [];
  return found.filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

type Corpus = {
  documents: Map<string, { counts: Map<string, number>; length: number; body: string }>;
  documentFrequency: Map<string, number>;
  count: number;
  averageLength: number;
};

/** Token statistics for the whole vault. Rebuilt with the index, which is cheap at this size. */
export function buildCorpus(index: VaultIndex): Corpus {
  const documents: Corpus["documents"] = new Map();
  const documentFrequency = new Map<string, number>();
  let totalLength = 0;

  for (const note of index.notes.values()) {
    const tokens = tokenize(note.body);
    const counts = new Map<string, number>();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    for (const token of counts.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
    totalLength += tokens.length;
    documents.set(note.id, { counts, length: tokens.length, body: note.body });
  }

  return {
    documents,
    documentFrequency,
    count: Math.max(1, documents.size),
    averageLength: documents.size > 0 ? totalLength / documents.size : 1,
  };
}

function bm25(queryTokens: string[], id: string, corpus: Corpus): number {
  const document = corpus.documents.get(id);
  if (!document || document.length === 0) {
    return 0;
  }
  let score = 0;
  for (const token of queryTokens) {
    const frequency = document.counts.get(token) ?? 0;
    if (frequency === 0) {
      continue;
    }
    const df = corpus.documentFrequency.get(token) ?? 0;
    const idf = Math.log(1 + (corpus.count - df + 0.5) / (df + 0.5));
    const denominator = frequency + K1 * (1 - B + (B * document.length) / corpus.averageLength);
    score += (idf * (frequency * (K1 + 1))) / denominator;
  }
  return score;
}

/** The first line that mentions a query term, so a hit shows its own evidence. */
function snippet(body: string, queryTokens: string[], limit = 200): string {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("|"));
  for (const line of lines) {
    const lowered = line.toLowerCase();
    if (queryTokens.some((token) => lowered.includes(token))) {
      return line.length > limit ? line.slice(0, limit) + "…" : line;
    }
  }
  const first = lines[0] ?? "";
  return first.length > limit ? first.slice(0, limit) + "…" : first;
}

export function search(
  index: VaultIndex,
  corpus: Corpus,
  query: string,
  options: { namespace?: string | null; limit?: number } = {},
): SearchHit[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const lowered = query.trim().toLowerCase();
  const limit = Math.max(1, options.limit ?? 8);
  const results: SearchHit[] = [];

  for (const note of index.notes.values()) {
    if (options.namespace && !note.namespace.startsWith(options.namespace)) {
      continue;
    }

    const reasons: string[] = [];
    let score = 0;

    if (
      note.title.trim().toLowerCase() === lowered ||
      note.aliases.some((alias) => alias.trim().toLowerCase() === lowered)
    ) {
      score += 100;
      reasons.push("exact title match");
    }

    const titleTokens = new Set(tokenize(note.title));
    const overlap = queryTokens.filter((token) => titleTokens.has(token));
    if (overlap.length > 0) {
      score += 20 * overlap.length;
      reasons.push("title mentions " + [...new Set(overlap)].sort().join(", "));
    }

    const tags = new Set(note.tags.map((tag) => tag.toLowerCase()));
    const tagHits = queryTokens.filter((token) => tags.has(token));
    if (tagHits.length > 0) {
      score += 15 * tagHits.length;
      reasons.push("tagged " + [...new Set(tagHits)].sort().join(", "));
    }

    const bodyScore = bm25(queryTokens, note.id, corpus);
    if (bodyScore > 0) {
      score += bodyScore;
      reasons.push("body relevance");
    }

    if (score <= 0) {
      continue;
    }

    results.push({
      id: note.id,
      title: note.title,
      namespace: note.namespace,
      score: Math.round(score * 1000) / 1000,
      why: reasons.join("; "),
      snippet: snippet(corpus.documents.get(note.id)?.body ?? "", queryTokens),
      updated: note.updated,
    });
  }

  results.sort(
    (a, b) => b.score - a.score || (a.updated ?? "").localeCompare(b.updated ?? "") || a.title.localeCompare(b.title),
  );
  return results.slice(0, limit);
}
