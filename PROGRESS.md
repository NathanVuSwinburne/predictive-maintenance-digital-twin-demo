# PROGRESS — porting MLOps + Agent Knowledge Wiki into the public demo

Working branch: **`dev`** (created off `main`; nothing is to be committed to `main`).
Repo: `C:\Users\Admin\predictive-maintenance-digital-twin-demo`
Production reference (read-only): `C:\Users\Admin\Uni\ProjectA\Predictive-maintenance-digital-twin-simulator`

Status: **Milestone 1 complete and verified — both MLOps and the Agent Knowledge Wiki are
in. Milestone 2 (README) is next.**
Verified with `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (104 passing, 52 of them
new across `test/demo-mlops.test.ts` and `test/demo-knowledge.test.ts`), `npm run build`
(both `/mlops` and `/knowledge` prerender static), and `npx playwright test` (9 passing,
including three that walk the wiki by graph, link, search, edit and refusal in a real
browser).

---

## The brief (four milestones)

1. **Port two production frontend experiences into the demo as frontend-only, mocked
   experiences** — MLOps and the Agent Knowledge Wiki. No backend, no API, no database.
   Public datasets only (AI4I etc.). **No Machine C data, no client/private telemetry.**
   Production is the source of truth for *behaviour*; the demo is the source of truth for
   *visual language*.
2. **Update the README** in its existing narrative voice, explaining why both features
   exist (ML-engineer-intern experience behind MLOps; the LLM-Wiki paper behind the wiki —
   inspiration only, no inherited benchmark claims).
3. **Capture screenshots** of the finished panes for the README.
4. **Make the README wiki-like / navigable** rather than linear chapters.

### Extra story the user asked for mid-session

Before the MLOps work, Machine C was **not generic**: a bespoke pipeline with column order,
window length and model path fixed in code. Part of this work was forcing it into a
**generic machine schema** — named, typed, versioned columns; timestamp and session as
metadata; both goals declared on one contract. This is already encoded in the demo data as
`migrations` on each machine (see `lib/demo-mlops/datasets.ts`) and rendered as a "Schema
history" timeline in the machine stage. It still needs to be told in the README (Milestone 2).

---

## What the two repos look like

### Demo repo (this one)
- Next.js 16 / React 19 / TS / Tailwind v4 / shadcn-style `components/ui`, app lives in
  `apps/frontend`.
- Design language: teal "control room" theme in `app/globals.css` — `--primary #167c78`,
  rounded (`--radius: 0.72rem`), `--panel-shadow`, and utility classes `instrument-label`,
  `data-value`, `display-mark`, `status-dot`, `panel-enter`. Page pattern is
  `instrument-label` eyebrow → `text-2xl font-semibold tracking-[-0.04em]` h1 → muted
  description → Cards.
- Data seam: `lib/data/provider.ts` (`DigitalTwinDataProvider`), `demo-provider.ts`,
  `fastapi-provider.ts`, `provider-factory.ts` (switches on `NEXT_PUBLIC_DEMO_MODE`).
  **Decision made: do NOT extend that interface** for the new features — `provider-contract.ts`
  type-guards both providers, so every new method would have to be implemented in the dead
  FastAPI provider too. New features use standalone modules under `lib/demo-mlops/` and
  (planned) `lib/demo-knowledge/`.
- Layout: `components/layout/app-sidebar.tsx` (nav array), `app-header.tsx` (`pageLabelMap`),
  `app-shell.tsx`.

### Production repo (behaviour reference)
- MLOps: `app/(protected)/mlops/page.tsx` (1293 lines, 4 stages: machine → data → prepare →
  train), `components/mlops/*` (workflow nav, registry stage, data workspace, preprocessing
  workspace, derived-feature editor, training-configuration panel, model scorecard,
  time-grid control), `lib/mlops/workflow.ts`, `lib/mlops/csv.ts`.
  Promotion lives separately in `app/(protected)/admin/models/page.tsx` (quality gate +
  required override reason + MLflow `@production` alias).
- Knowledge Wiki: `app/(protected)/knowledge/page.tsx` (541 lines) plus
  `components/knowledge/{graph-canvas,note-editor,sources-panel,lint-panel,conflict-dialog,save-to-wiki-button}.tsx`.
  Types at `lib/domain/types.ts` from line ~1230 (`KnowledgeNoteDetail`, `KnowledgeGraph`,
  `KnowledgeSearchHit`, `KnowledgeLintReport`, …).
- Knowledge corpus: `knowledge/` at repo root — `domain/` (12 pages, ISO/bearing/vibration
  physics), `concepts/` (11 pages, ML evaluation), `sources/` (11 provenance pages),
  `agent/` (supervisor + sql operational pages), `fleet/` (machine-a/b/c), `index.md`,
  `AGENT-WIKI.md`, `log.md`. Markdown with YAML frontmatter and `[[wikilinks]]`, typed
  relations (`sources`, `caused_by`, `detected_by`, `relates_to`), `> **Conflict:**`
  callouts, `confidence:` levels.
  **`knowledge/fleet/machine-c.md` must NOT be ported** — it describes the real client
  machine's sampling, session gaps and drift. Everything in `domain/`, `concepts/`,
  `sources/`, `agent/` and `fleet/machine-a.md` is public/non-sensitive and reusable.

---

## Decisions already made

- **The demo actually computes.** The preprocessing recipe and the training are real, not
  scripted: statistics are fitted on Train only and applied to Test, and the models are
  genuinely fitted in the browser. This is what makes the honest-metrics story land — a
  recipe that drops the informative columns produces a model that really does lose to the
  majority-class baseline, and the quality gate really does block it.
- **Honesty about architectures.** Browser-trainable: logistic regression, random forest,
  gradient boosting, small MLP, ridge-on-lags forecaster. LSTM / GRU / TCN / XGBoost are
  listed and described but **refuse to run** with a message saying they train on the
  production worker — no invented scores.
- **Three registry machines**, all public or synthetic:
  `mach-ai4i-mill` (AI4I 2020 rules, 2 000 generated rows, predict only),
  `mach-utility-pump` (synthetic 5-sensor, simulate + predict),
  `mach-packaging-drive` (synthetic 3-axis fixture, simulate + predict — carries the
  generalisation story in its 5-entry `migrations` list).
  AI4I rows are regenerated from the dataset's **published** generative rules, so TWF / HDF /
  PWF / OSF really do depend on products and differences of columns — which is why the
  calculated-feature editor earns its place.
- **Five stages** in the demo (production has four + a separate admin page):
  machine → data → prepare → train → **promote**.
- Added deps to `apps/frontend/package.json`: `d3-force@^3.0.0`, `@types/d3-force@^3.0.10`
  (already `npm install`ed). `papaparse` deliberately **not** added — no CSV upload in the
  demo; bundled public sources instead.

---

## Files written so far (all new, all on `dev`, none committed)

```
apps/frontend/lib/demo-mlops/types.ts            — Capability, recipes, dataset versions, runs, deployments
apps/frontend/lib/demo-mlops/datasets.ts         — 3 machines + seeded row generators + migrations
apps/frontend/lib/demo-mlops/formula.ts          — formula grammar: validation (ported) + real
                                                    shunting-yard tokenizer/compiler/evaluator (new)
apps/frontend/lib/demo-mlops/preprocessing.ts    — retypeColumn, defaultRecipe, digestOf,
                                                    materialiseRows, split, Train-only statistics,
                                                    transform, warnings, previewRecipe
apps/frontend/lib/demo-mlops/training.ts         — ARCHITECTURES, real learners (logistic, CART
                                                    forest, gradient boosting, MLP, ridge-lag
                                                    forecaster), scoring + quality gate
apps/frontend/lib/demo-mlops/store.ts            — module-scope store (subscribe/getSnapshot),
                                                    buildDataset, startTraining, cancelRun,
                                                    promoteRun, workflowProgress
apps/frontend/components/mlops/workflow-nav.tsx
apps/frontend/components/mlops/machine-registry-stage.tsx   — machine list + schema-history timeline
apps/frontend/components/mlops/machine-data-stage.tsx       — column contract, sources, readiness gates, row preview
apps/frontend/components/mlops/derived-feature-editor.tsx   — ported + per-machine suggestions
apps/frontend/components/mlops/preprocessing-workspace.tsx  — recipe controls + raw/train/test preview
apps/frontend/components/mlops/model-scorecard.tsx          — headline figures, per-outcome table,
                                                              confusion matrix, quality verdict
```

Known nit already fixed: the Gaussian-elimination `solve()` in `training.ts` had a bad
return expression; it now returns `augmented.map((row, index) => row[size] / row[index])`.

---

## Next steps, in order

### Milestone 1a — MLOps ✅ done

Route `/mlops`, wired into `app-sidebar.tsx` and `app-header.tsx`. Five stages:

1. `machine-registry-stage.tsx` — machine list, why there is no add-machine form, and the
   **schema history timeline** that carries the bespoke → generic story.
2. `machine-data-stage.tsx` — column contract, connected sources, per-goal readiness gates
   (`readinessFor`), 8-row authoritative preview.
3. `preprocessing-workspace.tsx` + `derived-feature-editor.tsx` — recipe sidebar and a
   raw/train/test preview that really recomputes. Freezing produces a dataset version.
4. `training-stage.tsx` — dataset picker over ready versions, model picker split into
   *trains here* vs *production worker only*, hyperparameter form with `parameterRange` and
   `configurationProblems`, the exact JSON the run will carry, run list with progress,
   cancel, `<ModelScorecard>` and a technical-details dump.
5. `promotion-stage.tsx` — candidate table scored against the trivial answer, quality
   verdict, **required override reason** (≥ 12 chars) when a run is `not_recommended`,
   blocked entirely when `incompatible`, and the currently-serving alias card.

Two corrections made while verifying, both worth keeping in mind:

- **The AI4I generator was wrong.** Rotational speed was computed from the published
  "2 860 W" figure, which put every row far outside the power-failure band, so *every* row
  came out as a failure. It now reproduces the real dataset's speed/torque anti-correlation
  (`1538 − 15.6·(torque−40) + N(0, 88)`), which yields a 5.7 % failure rate and makes the
  published rules fire the way they do in the real data.
- **The quality gate was too blunt.** It called any model below the majority-class accuracy
  `not_recommended`, which condemned every class-balanced model. It now reserves that verdict
  for models that fail to beat chance on the outcomes (balanced accuracy ≤ 0.5) and calls the
  accuracy-for-recall trade `borderline`, spelled out in the note.

The story this now genuinely demonstrates, reproducible on screen and asserted in tests:
raw columns give a random forest ~0.80 balanced accuracy; adding the three calculated
features the AI4I rules are actually written in (`power_w`, `temp_difference_k`,
`overstrain`) takes it to ~0.93.

### Milestone 1b — Agent Knowledge Wiki ✅ done

Route `/knowledge`, wired into `app-sidebar.tsx` and `app-header.tsx`.

**The corpus — 50 pages, reviewed page by page before porting.**
`lib/demo-knowledge/corpus/{root,domain,concepts,sources,fleet,agent,raw}.ts` hold the
markdown as template literals, frontmatter and all.

- `domain/` (12) and `concepts/` (11) ported essentially verbatim — public standards and
  modelling knowledge, every numeric claim carrying a `sources:` entry or an explicit
  Unsourced callout.
- `sources/` (11) ported, with production repo paths scrubbed. The AI4I page was rewritten
  where it mattered: production checks the real CSV into the repo, this demo does not, so
  the page now separates the published counts (339 failures, 96.61 % baseline) from what the
  demo's own seeded reconstruction produces (114 of 2 000, 94.30 % baseline) and says why
  the two are not interchangeable.
- `fleet/` (4) **written fresh** for this demo's registry: `ai4i-milling-machine`,
  `utility-pump-02`, `packaging-drive-01`, and `schema-generalisation` — the page that tells
  the bespoke-pipeline → generic-schema story in full, including what the abstraction cost.
  Every number on them was read off the MLOps registry, not invented.
- `agent/` (8) **rewritten**, not ported. Production's operational pages carry a real
  database schema and real client sampling cadences; these describe this demo's own tool
  catalogue, capability guards and browser-side data contract instead.
- `raw/` (1) — the legacy maintenance-guidelines document, unedited, so the corpus's claim
  that its vibration table is four times too permissive can be checked by the reader rather
  than taken on trust.

`fleet/machine-c.md` was **not** ported, and a unit test asserts no page mentions it or any
client sensor.

**The library.** `frontmatter.ts` (a small YAML reader for exactly this schema, which never
throws on half-typed input), `graph.ts` (nodes/edges/wanted pages/tags/truncation, typed
frontmatter relations, title and alias resolution), `search.ts` (BM25 plus exact title,
alias and tag boosts, each hit saying *why* it scored), `lint.ts` (duplicates, unsourced
numbers, missing frontmatter, orphans, broken links, wanted pages, conflicts, stale),
`store.ts` (subscribe/getSnapshot, save/create/delete/restore, version history, append-only
log with a required reason).

**The pane.** `graph-canvas.tsx` (d3-force, pan/zoom, drag-to-pin, neighbour highlight,
namespace colours from `--chart-*`, wanted pages dashed and hollow), `note-editor.tsx`
(preview/source toggle, wikilinks as navigable buttons, backlinks and links-out footer,
save-with-reason), `lint-panel.tsx`, `sources-panel.tsx` (provenance, with each source's
kind read out of its own Kind row and a count of what cites it), `history-panel.tsx`
(version history plus the vault log).

Three things that came out of actually looking at the result:

- **Code spans were being read as links.** `AGENT-WIKI` explains the syntax by writing
  ``[[link]]`` inside backticks, which produced three phantom wanted pages. Body-link
  extraction now strips fenced and inline code first, which is also what Obsidian does.
- **The force layout collapsed into a ball.** 50 nodes and 409 edges at d3's default charge
  is unreadable; charge is now −720 with a 112 px link distance and weak link strength.
- **Labelling every node was noise.** Only hubs are named by default; everything else is
  named on hover, on selection, or once the reader has zoomed in.

Two rules are enforced in the store rather than hidden in the UI, and both are asserted in
tests: `raw/` is immutable, and `agent/` is the assistant's own instructions and so is not
editable from the pane the assistant writes through.

### Verification (Milestone 1: all green)
```
cd apps/frontend
npx tsc --noEmit
npm run lint
npm run test:unit     # 104 passing
npm run build
npx playwright test   # 9 passing
```

### Milestone 2 — README
- Keep the existing narrative voice and structure; do not turn it into product docs.
- MLOps: inspired partly by the user's previous **ML Engineer intern** experience and the
  gap between training a model and having a reproducible, usable ML workflow — brought into
  this project to make preparation, evaluation, promotion and serving transparent.
- Knowledge Wiki: inspired by **"Retrieval as Reasoning: Self-Evolving Agent-Native
  Retrieval via LLM-Wiki"** — <https://arxiv.org/abs/2605.25480>. Say it **inspired the
  design**; the paper *reports* promising gains for multi-hop / cross-document reasoning;
  **do not imply this implementation inherits those benchmark results.** Design in one
  breath: BM25 for fast retrieval · a persistent interconnected wiki for structured
  knowledge · the agent navigates relationships when it needs to reason deeper ·
  human-readable, human-editable knowledge instead of an opaque vector store.
- Also add the generalisation story (bespoke Machine C pipeline → generic machine schema).

### Milestone 3 — screenshots
Run the demo (`cd apps/frontend && npm run dev` with `NEXT_PUBLIC_DEMO_MODE=true`), capture
at least: MLOps main workflow/pane, Knowledge Wiki graph, and a wiki page/editor view.
Clean consistent filenames under `assets/`, e.g. `mlops_prepare_pane.png`,
`mlops_model_scorecard.png`, `knowledge_wiki_graph.png`, `knowledge_wiki_page.png`.

### Milestone 4 — navigable README
Markdown anchors + small contextual nav lines so a reader can hop between project story,
Digital Twin, AI assistant, MLOps, Knowledge Wiki, architecture, screenshots and research.
Wiki-like, but still plain GitHub Markdown — no documentation framework.

---

## Working rules to keep honouring

- Inspect both repos before changing anything; production = behaviour, demo = styling.
- No backend in the demo. No private/client machine data. Mock data must stay believable
  and internally consistent.
- Verify each milestone before moving to the next.
- Preserve unrelated work; do not revert existing changes.
- Final report must list exactly what changed, screenshots created, checks run, and
  anything intentionally left out.
