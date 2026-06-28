# Refined Control Room UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the complete frontend as a soft, professional engineering control room while preserving every existing workflow.

**Architecture:** Establish typography, colour, radius, shadow, motion, and status semantics in global tokens; flow those decisions through shared primitives and the application shell; then make targeted composition improvements to login and high-density workspaces. Keep data providers, routing, and feature logic unchanged.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/Radix primitives, Vitest, Playwright.

---

### Task 1: Add visual-system regression coverage

**Files:**
- Create: `apps/frontend/test/control-room-theme.test.tsx`
- Test: `apps/frontend/test/control-room-theme.test.tsx`

- [ ] **Step 1: Write the failing theme tests**

Read `app/globals.css`, `app/layout.tsx`, and the shared card/button components as text. Assert that the new font variables, control-room status tokens, reduced-motion rule, panel radius, and semantic instrument classes are present. Render the demo notice and login form to verify accessible labels remain unchanged.

```tsx
expect(globals).toContain("--font-display")
expect(globals).toContain("--status-healthy")
expect(globals).toContain("@media (prefers-reduced-motion: reduce)")
expect(cardSource).toContain("rounded-xl")
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test:unit -- test/control-room-theme.test.tsx`

Expected: FAIL because the control-room tokens and rounded panel treatments do not exist.

- [ ] **Step 3: Commit the failing coverage**

```bash
git add apps/frontend/test/control-room-theme.test.tsx
git commit -m "test: define control room visual contract"
```

### Task 2: Establish global typography, colour, depth, and motion

**Files:**
- Modify: `apps/frontend/app/layout.tsx`
- Modify: `apps/frontend/app/globals.css`

- [ ] **Step 1: Replace the single-font setup with display, body, and mono roles**

Use locally packaged Geist variants to avoid runtime font requests. Expose `--font-display`, `--font-body`, and `--font-data` through root classes, then apply the body font globally and display font to headings.

- [ ] **Step 2: Replace sharp colour tokens with the adaptive control-room palette**

Define warm mineral light surfaces, deep navy ink, muted teal primary, amber/red operational states, blue-charcoal dark surfaces, larger radii, and layered panel shadows. Add utility classes for instrument labels, numeric data, panel entry, and status indicators.

- [ ] **Step 3: Add restrained atmosphere and accessible motion**

Use a low-contrast engineering grid plus radial illumination on the body. Add one entry animation and hover lift, disabled under `prefers-reduced-motion: reduce`.

- [ ] **Step 4: Run focused tests and lint**

Run: `npm run test:unit -- test/control-room-theme.test.tsx && npm run lint`

Expected: PASS with zero lint errors.

- [ ] **Step 5: Commit the visual foundation**

```bash
git add apps/frontend/app/layout.tsx apps/frontend/app/globals.css apps/frontend/test/control-room-theme.test.tsx
git commit -m "feat: establish adaptive control room theme"
```

### Task 3: Restyle shared primitives and application shell

**Files:**
- Modify: `apps/frontend/components/ui/card.tsx`
- Modify: `apps/frontend/components/ui/button.tsx`
- Modify: `apps/frontend/components/ui/input.tsx`
- Modify: `apps/frontend/components/ui/textarea.tsx`
- Modify: `apps/frontend/components/ui/badge.tsx`
- Modify: `apps/frontend/components/ui/table.tsx`
- Modify: `apps/frontend/components/ui/tabs.tsx`
- Modify: `apps/frontend/components/ui/dialog.tsx`
- Modify: `apps/frontend/components/ui/select.tsx`
- Modify: `apps/frontend/components/ui/sidebar.tsx`
- Modify: `apps/frontend/components/layout/app-sidebar.tsx`
- Modify: `apps/frontend/components/layout/app-header.tsx`
- Modify: `apps/frontend/components/layout/app-shell.tsx`
- Modify: `apps/frontend/components/demo/demo-disclaimer.tsx`

- [ ] **Step 1: Convert core primitives to soft instrument surfaces**

Use `rounded-xl` panels, `rounded-lg` controls, low-contrast borders, soft shadows, clear focus rings, tabular values, and restrained hover elevation. Preserve component APIs and variants.

- [ ] **Step 2: Refine navigation hierarchy**

Give the sidebar a compact engineering brand mark, grouped navigation spacing, pill-like active states, and a quieter operator identity block. Turn the header into a translucent command bar with stronger breadcrumb hierarchy.

- [ ] **Step 3: Soften the demo notice and shell spacing**

Render the disclaimer as a calm blue/teal information strip and increase responsive content padding while retaining compact mobile behavior.

- [ ] **Step 4: Verify unit tests and build**

Run: `npm run test:unit && npm run build`

Expected: 31+ tests pass and Next.js production compilation succeeds.

- [ ] **Step 5: Commit shared UI changes**

```bash
git add apps/frontend/components/ui apps/frontend/components/layout apps/frontend/components/demo
git commit -m "feat: soften monitoring shell and shared controls"
```

### Task 4: Refine login and high-density workspace composition

**Files:**
- Modify: `apps/frontend/components/auth/login-form.tsx`
- Modify: `apps/frontend/app/(protected)/dashboard/page.tsx`
- Modify: `apps/frontend/app/(protected)/machines/page.tsx`
- Modify: `apps/frontend/components/machines/machine-detail-page.tsx`
- Modify: `apps/frontend/components/chat/chat-workspace.tsx`
- Modify: `apps/frontend/app/(protected)/simulator/page.tsx`
- Modify as needed: history, account, security, and admin page class names

- [ ] **Step 1: Recompose login as an operational entry portal**

Add a concise system identity, monitoring proof points, and clearer separation between one-click demo and credential access. Preserve labels, submission behavior, and provenance text.

- [ ] **Step 2: Apply page-level hierarchy to operational workspaces**

Add instrument eyebrow labels, more consistent page headings, calm metric emphasis, improved card grids, and clearer grouping around filters, charts, messages, simulation controls, tables, and recommendations. Do not alter data fetching or event handlers.

- [ ] **Step 3: Run auth and demo tests**

Run: `npm run test:unit -- test/auth-forms.test.tsx test/demo-disclaimer.test.tsx`

Expected: PASS; one-click demo and provenance assertions remain intact.

- [ ] **Step 4: Commit page composition changes**

```bash
git add apps/frontend/components/auth apps/frontend/components/machines apps/frontend/components/chat apps/frontend/app
git commit -m "feat: refine operational workspace hierarchy"
```

### Task 5: Browser QA, responsive checks, and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-06-29-control-room-ui-design.md` only if implementation decisions differ
- Modify: `README.md` only if screenshots or UI narrative need correction

- [ ] **Step 1: Start the demo locally**

Run: `$env:NEXT_PUBLIC_DEMO_MODE='true'; npm run dev -- --hostname 127.0.0.1 --port 3210`

Expected: Next.js serves the application at `http://127.0.0.1:3210`.

- [ ] **Step 2: Inspect all primary pages in the browser**

Verify login, dashboard, machines, one machine detail, chat, simulator, history, account, security, and admin. Check desktop light mode, dark mode, and a narrow mobile viewport. Confirm no overflow, clipped controls, unreadable status, or low-contrast text.

- [ ] **Step 3: Run the full verification gate**

Run: `$env:NEXT_PUBLIC_DEMO_MODE='true'; npm run test:all`

Expected: lint passes, all Vitest tests pass, the Playwright entry-to-chat journey passes, and production build succeeds.

- [ ] **Step 4: Check repository hygiene**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intentional documentation adjustments remain.

- [ ] **Step 5: Commit final visual QA/documentation adjustments**

```bash
git add README.md docs apps/frontend
git commit -m "docs: record control room UI refresh"
```
