import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("demo visual system", () => {
  it("uses the production semantic theme with a dark variant", () => {
    const globals = source("app/globals.css");
    for (const token of ["--primary", "--success", "--warning", "--destructive"]) {
      expect(globals).toContain(token);
    }
    expect(globals).toContain(".dark {");
    expect(globals).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("maps the demo-only status and type helpers onto production tokens, not a second palette", () => {
    const globals = source("app/globals.css");
    expect(globals).toContain("--status-healthy: var(--success)");
    expect(globals).toContain("--status-watch: var(--warning)");
    expect(globals).toContain("--status-risk: var(--destructive)");
    expect(globals).toContain(".instrument-label");
    expect(globals).toContain(".data-value");
  });

  it("keeps the corner radius tight and panel edges drawn by a border", () => {
    const radius = /--radius:\s*([\d.]+)rem/.exec(source("app/globals.css"));
    expect(radius).not.toBeNull();
    expect(Number(radius![1])).toBeLessThanOrEqual(0.3);
    expect(source("components/ui/card.tsx")).toContain("border");
  });

  it("keeps the theme toggle and demo notice in the shell and on the login page", () => {
    expect(source("components/layout/app-header.tsx")).toContain("ThemeToggle");
    expect(source("components/layout/app-shell.tsx")).toContain("DemoDisclaimer");
    expect(source("components/auth/login-form.tsx")).toContain("Explore live demo");
  });
});
