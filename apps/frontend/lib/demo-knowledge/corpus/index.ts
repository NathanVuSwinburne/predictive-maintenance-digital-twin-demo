/**
 * The seeded vault, assembled.
 *
 * Everything here is markdown text, exactly as a person would see it in an editor. The graph, the
 * search index and the lint report are all derived from these strings on read — there is no stored
 * graph and nothing to reindex, which is what makes an edit in the pane take effect immediately.
 */

import { AGENT_PAGES } from "./agent";
import { CONCEPTS_PAGES } from "./concepts";
import { DOMAIN_PAGES } from "./domain";
import { FLEET_PAGES } from "./fleet";
import { RAW_PAGES } from "./raw";
import { ROOT_PAGES } from "./root";
import { SOURCES_PAGES } from "./sources";

/** Page id → raw markdown, frontmatter included. Ids are paths without the `.md`. */
export const SEED_PAGES: Record<string, string> = {
  ...ROOT_PAGES,
  ...DOMAIN_PAGES,
  ...CONCEPTS_PAGES,
  ...FLEET_PAGES,
  ...SOURCES_PAGES,
  ...AGENT_PAGES,
  ...RAW_PAGES,
};

/** Namespaces the assistant may write to. `agent/` is its own instructions; `raw/` is immutable. */
export const WRITABLE_NAMESPACES = ["domain", "concepts", "fleet", "sources"] as const;

/** The pages a fresh reader should land on, in the order the vault expects to be read. */
export const ORIENTATION_PAGES = ["index", "AGENT-WIKI", "agent/supervisor/routing-guide"] as const;
