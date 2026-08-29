import { beforeEach, describe, expect, it } from "vitest";

import { SEED_PAGES, WRITABLE_NAMESPACES } from "@/lib/demo-knowledge/corpus";
import { edgeKeys, extractWikilinks, readMeta, splitFrontmatter } from "@/lib/demo-knowledge/frontmatter";
import { buildGraph, buildIndex, noteDetail, wantedPages } from "@/lib/demo-knowledge/graph";
import { lint } from "@/lib/demo-knowledge/lint";
import { buildCorpus, search as runSearch, tokenize } from "@/lib/demo-knowledge/search";
import {
  createPage,
  deletePage,
  getGraph,
  getHistory,
  getLint,
  getLog,
  getNote,
  resetVault,
  restorePage,
  savePage,
  search,
  VaultError,
} from "@/lib/demo-knowledge/store";

const index = buildIndex(SEED_PAGES);

describe("the seeded vault", () => {
  it("carries no client or private machine data", () => {
    // The production vault this corpus is drawn from has a page of real customer sampling
    // cadences and session gaps. It is not here, and this test is what keeps it out.
    const all = Object.entries(SEED_PAGES);
    for (const [id, content] of all) {
      expect(id).not.toMatch(/machine-c(?![a-z])/i);
      expect(content).not.toMatch(/machine-c(?![a-z])/i);
      expect(content).not.toMatch(/real client|client sensor|customer sensor/i);
    }
  });

  it("names every machine it discusses against the MLOps registry", () => {
    const fleet = Object.keys(SEED_PAGES).filter((id) => id.startsWith("fleet/"));
    expect(fleet).toContain("fleet/ai4i-milling-machine");
    expect(fleet).toContain("fleet/utility-pump-02");
    expect(fleet).toContain("fleet/packaging-drive-01");
    expect(SEED_PAGES["fleet/ai4i-milling-machine"]).toContain("mach-ai4i-mill");
    expect(SEED_PAGES["fleet/utility-pump-02"]).toContain("mach-utility-pump");
    expect(SEED_PAGES["fleet/packaging-drive-01"]).toContain("mach-packaging-drive");
  });

  it("gives every page a title, a namespace and a type", () => {
    for (const [id, content] of Object.entries(SEED_PAGES)) {
      const { meta } = readMeta(content);
      expect(meta.title, id).toBeTruthy();
      expect(meta.namespace, id).toBeTruthy();
      expect(meta.type, id).toBeTruthy();
    }
  });
});

describe("frontmatter", () => {
  it("reads scalars, inline lists and block lists", () => {
    const { meta } = splitFrontmatter(
      ["---", "title: A Page", "tags: [one, two]", "sources:", '  - "[[sources/x]]"', '  - "[[sources/y]]"', "---", "", "body"].join("\n"),
    );
    expect(meta.title).toBe("A Page");
    expect(meta.tags).toEqual(["one", "two"]);
    expect(meta.sources).toEqual(["[[sources/x]]", "[[sources/y]]"]);
  });

  it("turns any list of wikilinks into a typed edge, including one nobody wrote code for", () => {
    const edges = edgeKeys({
      tags: ["ignored"],
      relates_to: ["[[a]]"],
      mitigated_by: ["[[b]]", "[[c]]"],
      notes: ["not a link"],
    });
    expect(edges.relates_to).toEqual(["a"]);
    expect(edges.mitigated_by).toEqual(["b", "c"]);
    expect(edges.tags).toBeUndefined();
    expect(edges.notes).toBeUndefined();
  });

  it("survives a half-typed frontmatter rather than throwing at the editor", () => {
    const { meta, body } = readMeta("---\ntitle: Half\ntags: [\n---\nbody\n");
    expect(meta.title).toBe("Half");
    expect(body.trim()).toBe("body");
  });

  it("reads a wikilink with an alias or a heading anchor", () => {
    expect(extractWikilinks("see [[domain/tool-wear|tool wear]] and [[index#rules]]")).toEqual([
      "domain/tool-wear",
      "index",
    ]);
  });
});

describe("the graph", () => {
  it("derives edges from the body and from typed frontmatter keys", () => {
    const built = buildIndex({
      "a/one": "---\ntitle: One\nnamespace: a\ntype: concept\ncaused_by:\n  - \"[[a/two]]\"\n---\n\nSee [[a/two]].\n",
      "a/two": "---\ntitle: Two\nnamespace: a\ntype: concept\n---\n\nBody.\n",
    });
    const types = built.edges.filter((edge) => edge.target === "a/two").map((edge) => edge.type);
    expect(types).toContain("link");
    expect(types).toContain("caused_by");
  });

  it("keeps a link to an unwritten page as a wanted node rather than dropping it", () => {
    const built = buildIndex({
      "a/one": "---\ntitle: One\nnamespace: a\ntype: concept\n---\n\nSee [[a/not-written]].\n",
    });
    const wanted = built.nodes.get("a/not-written");
    expect(wanted?.exists).toBe(false);
    expect(wantedPages(built)).toContain("a/not-written");
  });

  it("resolves a link by title and by alias, not only by id", () => {
    const built = buildIndex({
      "a/one": "---\ntitle: One\nnamespace: a\ntype: concept\n---\n\nSee [[Rolling Thing]] and [[rt]].\n",
      "a/two": "---\ntitle: Rolling Thing\nnamespace: a\ntype: concept\naliases: [rt]\n---\n\nBody.\n",
    });
    const inbound = built.edges.filter((edge) => edge.target === "a/two");
    expect(inbound.length).toBe(2);
    expect(built.nodes.get("a/two")?.inDegree).toBe(2);
  });

  it("gives a page its backlinks, which is often the more informative half", () => {
    const detail = noteDetail(index, "domain/vibration-severity-zones");
    expect(detail).not.toBeNull();
    expect(detail!.backlinks.length).toBeGreaterThan(2);
    expect(detail!.outbound.some((link) => link.id.startsWith("sources/"))).toBe(true);
  });

  it("keeps one page twice when it points here under two relations, and names each", () => {
    // The list is longer than the number of pages in it, which is why the panel counts
    // distinct pages rather than rows. Every entry has to say which relation it came by,
    // or the repeat just looks like a bug.
    const detail = noteDetail(index, "domain/bearing-degradation-stages")!;
    const pages = new Set(detail.backlinks.map((link) => link.id));
    expect(detail.backlinks.length).toBeGreaterThan(pages.size);
    expect(detail.backlinks.every((link) => link.relation.length > 0)).toBe(true);
    for (const link of detail.backlinks) {
      const sameSource = detail.backlinks.filter((other) => other.id === link.id);
      expect(new Set(sameSource.map((other) => other.relation)).size).toBe(sameSource.length);
    }
  });

  it("leaves the seeded vault reachable: index links to every namespace", () => {
    const detail = noteDetail(index, "index")!;
    const namespaces = new Set(detail.outbound.map((link) => link.id.split("/")[0]));
    for (const expected of ["domain", "concepts", "fleet", "sources", "agent", "raw"]) {
      expect([...namespaces], expected).toContain(expected);
    }
  });

  it("reports truncation instead of quietly drawing half a graph", () => {
    const pages: Record<string, string> = {};
    for (let i = 0; i < 400; i += 1) {
      pages[`bulk/page-${i}`] = `---\ntitle: Page ${i}\nnamespace: bulk\ntype: concept\n---\n\nBody.\n`;
    }
    const drawn = buildGraph(buildIndex(pages));
    expect(drawn.truncated).toBeGreaterThan(0);
    expect(drawn.nodes.length).toBeLessThan(400);
  });
});

describe("search", () => {
  const corpus = buildCorpus(index);

  it("drops stopwords and one-character noise", () => {
    expect(tokenize("What is the P-F interval?")).toEqual(["interval"]);
  });

  it("says why each hit scored, so a title match is distinguishable from a mention", () => {
    const hits = runSearch(index, corpus, "envelope analysis", { limit: 5 });
    expect(hits[0].id).toBe("domain/envelope-analysis");
    expect(hits[0].why).toMatch(/exact title match|title mentions/);
    expect(hits[0].snippet.length).toBeGreaterThan(0);
  });

  it("finds a page by its body when the title gives nothing away", () => {
    const hits = runSearch(index, corpus, "majority class baseline", { limit: 5 });
    expect(hits.map((hit) => hit.id)).toContain("concepts/class-imbalance-in-failure-data");
  });

  it("returns nothing for a query that is entirely stopwords", () => {
    expect(runSearch(index, corpus, "the and of").length).toBe(0);
  });
});

describe("lint", () => {
  const report = lint(index, new Date("2026-08-28T00:00:00Z"));

  it("reports every wanted page as work rather than as an error", () => {
    expect(report.counts.wanted).toBe(wantedPages(index).length);
  });

  it("names a numeric claim in domain/ that carries no citation", () => {
    const built = buildIndex({
      "domain/loose": "---\ntitle: Loose\nnamespace: domain\ntype: concept\n---\n\nStop above 18 mm/s.\n",
    });
    const found = lint(built, new Date("2026-08-28T00:00:00Z"));
    expect(found.counts.unsourced_claims).toBe(1);
    expect(found.healthy).toBe(false);
  });

  it("accepts the same claim once it is cited, or once it is flagged unsourced", () => {
    const cited = buildIndex({
      "domain/cited":
        '---\ntitle: Cited\nnamespace: domain\ntype: concept\nsources:\n  - "[[sources/x]]"\n---\n\nStop above 18 mm/s.\n',
      "domain/flagged":
        "---\ntitle: Flagged\nnamespace: domain\ntype: concept\n---\n\n> **Unsourced:** no citation.\n\nStop above 18 mm/s.\n",
    });
    expect(lint(cited, new Date("2026-08-28T00:00:00Z")).counts.unsourced_claims).toBe(0);
  });

  it("counts a recorded conflict without calling the vault unhealthy for it", () => {
    expect(report.counts.conflicts).toBeGreaterThan(0);
    expect(report.findings.conflicts.some((finding) => finding.id?.startsWith("domain/"))).toBe(true);
  });

  it("names two pages that are really one page", () => {
    const forked = buildIndex({
      "fleet/drive": "---\ntitle: The Drive\nnamespace: fleet\ntype: entity\n---\n\nContent.\n",
      "fleet/the-drive": "---\ntitle: The Drive\nnamespace: fleet\ntype: entity\n---\n\nStub.\n",
    });
    const found = lint(forked, new Date("2026-08-28T00:00:00Z"));
    expect(found.counts.duplicates).toBe(1);
    expect(found.findings.duplicates[0].label).toContain("vs");
  });

  it("finds the seeded vault free of orphans, duplicates and unsourced numbers", () => {
    expect(report.counts.duplicates).toBe(0);
    expect(report.counts.unsourced_claims).toBe(0);
    expect(report.counts.orphans).toBe(0);
    expect(report.counts.missing_frontmatter).toBe(0);
    expect(report.healthy).toBe(true);
  });
});

describe("the store", () => {
  beforeEach(() => {
    resetVault();
  });

  it("serves the seeded graph and a readable page", () => {
    const graph = getGraph();
    expect(graph.stats.notes).toBe(Object.keys(SEED_PAGES).length);
    expect(getNote("domain/tool-wear")?.title).toBe("Tool Wear");
    // Resolution works by title too, the way a wikilink does.
    expect(getNote("Tool Wear")?.id).toBe("domain/tool-wear");
  });

  it("refuses to edit raw/, because the original is the thing that can be checked against", () => {
    expect(() => savePage("raw/legacy-maintenance-guidelines", "x", "why")).toThrowError(VaultError);
    expect(() => savePage("raw/legacy-maintenance-guidelines", "x", "why")).toThrowError(/immutable/i);
  });

  it("refuses to edit agent/, which is the assistant's own instructions", () => {
    expect(() => savePage("agent/sql/gotchas", "x", "why")).toThrowError(/instructions/i);
  });

  it("refuses a save with no reason", () => {
    const note = getNote("concepts/data-drift")!;
    expect(() => savePage(note.id, note.content + "\nmore\n", "  ")).toThrowError(/reason/i);
  });

  it("saves, logs the reason, and reflects the edit in the graph immediately", () => {
    const before = getNote("concepts/data-drift")!;
    savePage(before.id, before.content + "\nAlso see [[concepts/threshold-selection]].\n", "linked the threshold page");

    const after = getNote("concepts/data-drift")!;
    expect(after.outbound.some((link) => link.id === "concepts/threshold-selection")).toBe(true);
    expect(getLog().at(-1)).toMatchObject({
      operation: "update",
      page: "concepts/data-drift",
      reason: "linked the threshold page",
    });
  });

  it("keeps the previous version and restores it", () => {
    const before = getNote("concepts/data-drift")!;
    savePage(before.id, "---\ntitle: Data Drift\nnamespace: concepts\ntype: concept\n---\n\nReplaced.\n", "rewrote it");
    expect(getNote(before.id)!.body.trim()).toBe("Replaced.");

    const history = getHistory(before.id);
    expect(history.length).toBe(1);
    restorePage(before.id, history[0].stamp);
    expect(getNote(before.id)!.content).toBe(before.content);
  });

  it("creates a page only in a writable namespace, and the new page closes its wanted node", () => {
    const id = createPage("concepts", "Alarm Volume Budgeting");
    expect(id).toBe("concepts/alarm-volume-budgeting");
    expect(getNote(id)?.confidence).toBe("low");
    expect(() => createPage("agent", "Sneaky")).toThrowError(/New pages go in/);
    // A second page with an existing name is the forked write that lint calls a duplicate;
    // the store refuses it up front rather than leaving the pair to be found later.
    expect(() => createPage("concepts", "Data Drift")).toThrowError(/already exists/);
  });

  it("deletes a page and turns every link to it into a wanted page rather than a dangling edge", () => {
    deletePage("concepts/data-drift", "merged into threshold selection");
    const graph = getGraph();
    const node = graph.nodes.find((entry) => entry.id === "concepts/data-drift");
    expect(node?.exists).toBe(false);
    expect(getLint().counts.broken_links).toBeGreaterThan(0);
  });

  it("searches the live vault, including a page written a moment ago", () => {
    createPage("concepts", "Cavitation Onset", {
      content:
        "---\ntitle: Cavitation Onset\nnamespace: concepts\ntype: concept\n---\n\nCavitation shows as pressure oscillation.\n",
    });
    const hits = search("cavitation", { limit: 5 });
    expect(hits[0].id).toBe("concepts/cavitation-onset");
  });

  it("resets back to the seeded vault", () => {
    deletePage("concepts/data-drift", "testing");
    resetVault();
    expect(getNote("concepts/data-drift")).not.toBeNull();
    expect(getGraph().stats.notes).toBe(Object.keys(SEED_PAGES).length);
  });

  it("only lets the assistant write where AGENT-WIKI says it may", () => {
    expect([...WRITABLE_NAMESPACES]).toEqual(["domain", "concepts", "fleet", "sources"]);
  });
});
