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

  it("uses soft instrument geometry in shared cards and controls", () => {
    expect(source("components/ui/card.tsx")).toContain("rounded-xl");
    expect(source("components/ui/button.tsx")).toContain("rounded-lg");
    expect(source("components/ui/input.tsx")).toContain("rounded-lg");
  });

  it("keeps the monitoring shell and login portal visibly branded", () => {
    expect(source("components/layout/app-sidebar.tsx")).toContain("SYSTEM ONLINE");
    expect(source("components/auth/login-form.tsx")).toContain("Operations intelligence");
  });
});
