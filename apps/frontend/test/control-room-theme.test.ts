import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("control room visual system", () => {
  it("defines adaptive engineering theme tokens and accessible motion", () => {
    const globals = source("app/globals.css");

    expect(globals).toContain("--font-display");
    expect(globals).toContain("--font-data");
    expect(globals).toContain("--status-healthy");
    expect(globals).toContain("--status-watch");
    expect(globals).toContain("--status-risk");
    expect(globals).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globals).toContain(".instrument-label");
    expect(globals).toContain(".data-value");
  });

  it("keeps the corner radius tight enough to read as an instrument", () => {
    // The radius token drives every rounded-* utility, so it is the thing to hold. Panels
    // used to sit at 0.72rem, which read as a marketing page rather than a tool.
    const radius = /--radius:\s*([\d.]+)rem/.exec(source("app/globals.css"));
    expect(radius).not.toBeNull();
    expect(Number(radius![1])).toBeLessThanOrEqual(0.3);

    expect(source("components/ui/card.tsx")).toContain("rounded-lg");
    expect(source("components/ui/button.tsx")).toContain("rounded-lg");
    expect(source("components/ui/input.tsx")).toContain("rounded-lg");
  });

  it("keeps panel edges visible rather than leaning on a shadow", () => {
    // In dark mode a shadow on a dark ground does nothing, so the border is the only edge a
    // panel has. It was 1.52:1 against the card, which lost every edge on the page.
    const card = source("components/ui/card.tsx");
    expect(card).toContain("border border-border");
    expect(card).not.toContain("bg-card/95");
  });

  it("keeps the monitoring shell and login portal visibly branded", () => {
    expect(source("components/layout/app-sidebar.tsx")).toContain("SYSTEM ONLINE");
    expect(source("components/auth/login-form.tsx")).toContain("Operations intelligence");
  });
});
