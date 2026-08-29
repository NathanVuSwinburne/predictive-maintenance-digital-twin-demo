/**
 * Vault health, the third operation, after ingest and query.
 *
 * Lint answers "what is wrong with the wiki right now" in a form both the pane and the assistant
 * can act on. Everything it reports is a piece of work, not a violation: a wanted page is a page
 * worth writing, an orphan is a page nobody can find, an unsourced number is a claim waiting for a
 * citation. Presenting them as errors would be the wrong frame; a healthy vault under active use
 * always has some.
 */

import { orphans, wantedPages, type VaultIndex } from "./graph";
import { slugify } from "./frontmatter";
import type { GraphStats, LintFinding, LintKey, LintReport } from "./types";

const STALE_DAYS = 90;

const CONFLICT = /^>\s*\*\*Conflict\b/m;
const UNSOURCED = /^>\s*\*\*Unsourced\b/m;

/** A bare number with a unit or a comparison, the shape of a claim that needs a citation. */
const NUMERIC_CLAIM = /\b\d+(?:[.,]\d+)?\s*(?:mm\/s|Hz|kHz|°C|degC|%|rpm|RPM|bar|kW|Nm|dB|K)\b/;

/** Only these namespaces are held to the citation rule; `fleet/` reports observations. */
const SOURCED_NAMESPACES = ["domain", "concepts"];

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Two pages that are really the same page.
 *
 * This is what a forked write looks like from the outside: one file keeps the content while another
 * takes the name, and every symptom after that (an orphan, a link resolving to the wrong one) is
 * downstream of it. Naming the pair says what actually happened.
 *
 * Filenames only collide within one folder, because a vault deliberately has several `index` pages
 * and they are different pages. Titles are compared across the whole vault, because that is the
 * scope in which a title lookup can land on the wrong one.
 */
function duplicates(index: VaultIndex): LintFinding[] {
  const groups = new Map<string, { id: string; title: string }[]>();

  for (const note of index.notes.values()) {
    if (note.namespace === "raw") {
      continue;
    }
    const folder = note.id.includes("/") ? note.id.slice(0, note.id.lastIndexOf("/")) : "";
    const stem = note.id.split("/").pop() ?? note.id;
    const keys = ["file:" + folder + "/" + slugify(stem), "title:" + slugify(note.title)];
    for (const key of keys) {
      const bucket = groups.get(key) ?? [];
      if (!bucket.some((entry) => entry.id === note.id)) {
        bucket.push({ id: note.id, title: note.title });
      }
      groups.set(key, bucket);
    }
  }

  const seen = new Set<string>();
  const found: LintFinding[] = [];
  for (const [key, members] of [...groups.entries()].sort()) {
    if (members.length < 2) {
      continue;
    }
    const signature = members
      .map((member) => member.id)
      .sort()
      .join("|");
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    found.push({
      id: members[0].id,
      label: members.map((member) => member.id).join("  vs  "),
      detail: key.startsWith("title:") ? "same title" : "same filename in one folder",
    });
  }
  return found;
}

export function lint(index: VaultIndex, today = new Date()): LintReport {
  const wantedIds = new Set(
    [...index.nodes.values()].filter((node) => !node.exists).map((node) => node.id),
  );

  const brokenLinks: LintFinding[] = [];
  const seenBroken = new Set<string>();
  for (const edge of index.edges) {
    if (!wantedIds.has(edge.target)) {
      continue;
    }
    const key = edge.source + "->" + edge.target;
    if (seenBroken.has(key)) continue;
    seenBroken.add(key);
    const source = index.nodes.get(edge.source);
    brokenLinks.push({
      id: edge.source,
      label: (source?.title ?? edge.source) + " → " + edge.target,
      detail: "via " + edge.type,
    });
  }

  const unsourced: LintFinding[] = [];
  const conflicts: LintFinding[] = [];
  const stale: LintFinding[] = [];
  const missingFrontmatter: LintFinding[] = [];

  for (const note of index.notes.values()) {
    const head = note.namespace.split("/")[0];

    if (!note.type || !note.content.startsWith("---")) {
      missingFrontmatter.push({
        id: note.id,
        label: note.title,
        detail: note.content.startsWith("---") ? "no type" : "no frontmatter block",
      });
    }

    if (CONFLICT.test(note.body)) {
      conflicts.push({ id: note.id, label: note.title, detail: "records a disagreement" });
    }

    if (SOURCED_NAMESPACES.includes(head)) {
      const claimsNumbers = NUMERIC_CLAIM.test(note.body);
      const cited = Object.keys(note.frontmatterEdges).includes("sources");
      if (claimsNumbers && !cited && !UNSOURCED.test(note.body)) {
        unsourced.push({
          id: note.id,
          label: note.title,
          detail: "states a numeric threshold with no sources: entry and no Unsourced callout",
        });
      }
    }

    const updated = parseDate(note.updated);
    if (updated) {
      const days = Math.floor((today.getTime() - updated.getTime()) / 86_400_000);
      if (days > STALE_DAYS) {
        stale.push({ id: note.id, label: note.title, detail: days + " days" });
      }
    }
  }

  const findings: Record<LintKey, LintFinding[]> = {
    duplicates: duplicates(index),
    unsourced_claims: unsourced,
    broken_links: brokenLinks,
    orphans: orphans(index).map((id) => ({
      id,
      label: index.nodes.get(id)?.title ?? id,
      detail: "nothing links here",
    })),
    wanted: wantedPages(index).map((id) => ({ id: null, label: id, detail: "not written yet" })),
    conflicts,
    missing_frontmatter: missingFrontmatter,
    stale,
  };

  const counts = Object.fromEntries(
    Object.entries(findings).map(([key, list]) => [key, list.length]),
  ) as Record<LintKey, number>;

  const stats: GraphStats = {
    notes: index.notes.size,
    edges: index.edges.length,
    wanted: wantedIds.size,
    namespaces: {},
  };
  for (const note of index.notes.values()) {
    const head = note.namespace.split("/")[0];
    stats.namespaces[head] = (stats.namespaces[head] ?? 0) + 1;
  }

  // Conflicts and wanted pages are deliberate states, not defects, so a vault full of both is
  // still healthy. Only the things that make the wiki wrong or unreachable count against it.
  const healthy =
    counts.duplicates === 0 &&
    counts.unsourced_claims === 0 &&
    counts.orphans === 0 &&
    counts.missing_frontmatter === 0;

  return { healthy, counts, findings, stats };
}
