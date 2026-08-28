/**
 * A small YAML reader for exactly the frontmatter this vault writes.
 *
 * Not a YAML parser, and deliberately not: pulling a full one into the bundle to read six scalar
 * keys and some string lists would cost more than the feature. It handles what the schema in
 * `AGENT-WIKI` describes — scalars, inline lists, block lists, quoted strings, comments — and
 * ignores anything else rather than throwing, because a half-typed frontmatter in the editor must
 * still render a page.
 */

import type { Confidence, NoteMeta } from "./types";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const WIKILINK = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

/** Strips one layer of matching quotes, and nothing else. */
function unquote(value: string): string {
  const text = value.trim();
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return text.slice(1, -1);
    }
  }
  return text;
}

function parseInlineList(value: string): string[] {
  const inner = value.trim().slice(1, -1);
  if (!inner.trim()) {
    return [];
  }
  return inner
    .split(",")
    .map((item) => unquote(item))
    .filter(Boolean);
}

type Parsed = Record<string, string | string[]>;

/** Splits a document into its frontmatter map and the markdown below it. */
export function splitFrontmatter(text: string): { meta: Parsed; body: string } {
  const match = FRONTMATTER.exec(text);
  if (!match) {
    return { meta: {}, body: text };
  }

  const meta: Parsed = {};
  const lines = match[1].split(/\r?\n/);
  let currentKey: string | null = null;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }

    // A block-list item belongs to whichever key opened it.
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && currentKey) {
      const bucket = meta[currentKey];
      const value = unquote(item[1]);
      if (Array.isArray(bucket)) {
        bucket.push(value);
      } else {
        meta[currentKey] = [value];
      }
      continue;
    }

    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!pair) {
      continue;
    }

    const [, key, rawValue] = pair;
    const value = rawValue.trim();
    currentKey = key;

    if (!value) {
      // A bare `key:` opens a block list. If nothing follows it stays an empty list, which is
      // what the writer meant.
      meta[key] = [];
    } else if (value.startsWith("[") && value.endsWith("]")) {
      meta[key] = parseInlineList(value);
    } else {
      meta[key] = unquote(value);
      currentKey = null;
    }
  }

  return { meta, body: text.slice(match[0].length) };
}

function asList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function asText(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value?.trim() || undefined;
}

/** Frontmatter keys that carry meaning to the reader rather than an edge to the graph. */
const RESERVED = new Set([
  "title",
  "namespace",
  "type",
  "tags",
  "aliases",
  "updated",
  "updated_by",
  "confidence",
]);

/** Every wikilink in a body, in the order they appear, de-duplicated. */
export function extractWikilinks(body: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  // A fresh regex per call: a shared global one carries `lastIndex` between calls.
  const pattern = new RegExp(WIKILINK.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const target = match[1].trim();
    if (target && !seen.has(target)) {
      seen.add(target);
      found.push(target);
    }
  }
  return found;
}

/**
 * Typed edges. Any list-valued key that is not reserved, whose values are wikilinks, becomes a
 * relation named after the key — which is how `caused_by` and `mitigated_by` work without either
 * appearing anywhere in this file.
 */
export function edgeKeys(meta: Parsed): Record<string, string[]> {
  const edges: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (RESERVED.has(key) || !Array.isArray(value)) {
      continue;
    }
    const targets = value.flatMap((entry) => extractWikilinks(entry));
    if (targets.length > 0) {
      edges[key] = targets;
    }
  }
  return edges;
}

const CONFIDENCE = new Set<Confidence>(["high", "medium", "low"]);

/** The reader's view of a page's frontmatter, with every field optional and nothing thrown. */
export function readMeta(text: string): { meta: NoteMeta; body: string } {
  const { meta: raw, body } = splitFrontmatter(text);
  const confidence = asText(raw.confidence) as Confidence | undefined;
  return {
    meta: {
      title: asText(raw.title),
      namespace: asText(raw.namespace),
      type: asText(raw.type),
      tags: asList(raw.tags).map((tag) => tag.replace(/^#/, "")),
      aliases: asList(raw.aliases),
      updated: asText(raw.updated),
      updatedBy: asText(raw.updated_by),
      confidence: confidence && CONFIDENCE.has(confidence) ? confidence : undefined,
      edges: edgeKeys(raw),
    },
    body,
  };
}

/** `domain/tool-wear` → `Tool Wear`, for a page whose frontmatter never got a title. */
export function titleFromId(id: string): string {
  const stem = id.split("/").pop() ?? id;
  return stem
    .split("-")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** `Bearing Failure Modes` → `bearing-failure-modes`. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
