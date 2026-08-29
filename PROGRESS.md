# PROGRESS: porting MLOps + Agent Knowledge Wiki into the public demo

Working branch: **`dev`** (created off `main`; nothing is to be committed to `main`).
Repo: `C:\Users\Admin\predictive-maintenance-digital-twin-demo`
Production reference (read-only): `C:\Users\Admin\Uni\ProjectA\Predictive-maintenance-digital-twin-simulator`

Status: **All four milestones complete and verified.**
Verified with `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (104 passing, 52 of them
new across `test/demo-mlops.test.ts` and `test/demo-knowledge.test.ts`), `npm run build`
(both `/mlops` and `/knowledge` prerender static), and `npx playwright test` (9 passing,
including three that walk the wiki by graph, link, search, edit and refusal in a real
browser).

---

## The brief (four milestones)

1. **Port two production frontend experiences into the demo as frontend-only, mocked
   experiences**: MLOps and the Agent Knowledge Wiki. No backend, no API, no database.
   Public datasets only (AI4I etc.). **No Machine C data, no client/private telemetry.**
   Production is the source of truth for *behaviour*; the demo is the source of truth for
   *visual language*.
2. **Update the README** in its existing narrative voice, explaining why both features
   exist (ML-engineer-intern experience behind MLOps; the LLM-Wiki paper behind the wiki;
   inspiration only, no inherited benchmark claims).
3. **Capture screenshots** of the finished panes for the README.
4. **Make the README wiki-like / navigable** rather than linear chapters.

### Extra story the user asked for mid-session

Before the MLOps work, Machine C was **not generic**: a bespoke pipeline with column order,
window length and model path fixed in code. Part of this work was forcing it into a
**generic machine schema**: named, typed, versioned columns; timestamp and session as
metadata; both goals declared on one contract. This is already encoded in the demo data as
`migrations` on each machine (see `lib/demo-mlops/datasets.ts`) and rendered as a "Schema
history" timeline in the machine stage. It still needs to be told in the README (Milestone 2).

---

## What the two repos look like

### Demo repo (this one)
- Next.js 16 / React 19 / TS / Tailwind v4 / shadcn-style `components/ui`, app lives in
  `apps/frontend`.
- Design language: teal "control room" theme in `app/globals.css`: `--primary #167c78`,
  rounded (`--radius: 0.72rem`), `--panel-shadow`, and utility classes `instrument-label`,
  `data-value`, `display-mark`, `status-dot`, `panel-enter`. Page pattern is
  `instrument-label` eyebrow → `text-2xl font-semibold tracking-[-0.04em]` h1 → muted
  description → Cards.
- Data seam: `lib/data/provider.ts` (`DigitalTwinDataProvider`), `demo-provider.ts`,
  `fastapi-provider.ts`, `provider-factory.ts` (switches on `NEXT_PUBLIC_DEMO_MODE`).
  **Decision made: do NOT extend that interface** for the new features: `provider-contract.ts`
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
- Knowledge corpus: `knowledge/` at repo root: `domain/` (12 pages, ISO/bearing/vibration
  physics), `concepts/` (11 pages, ML evaluation), `sources/` (11 provenance pages),
  `agent/` (supervisor + sql operational pages), `fleet/` (machine-a/b/c), `index.md`,
  `AGENT-WIKI.md`, `log.md`. Markdown with YAML frontmatter and `[[wikilinks]]`, typed
  relations (`sources`, `caused_by`, `detected_by`, `relates_to`), `> **Conflict:**`
  callouts, `confidence:` levels.
  **`knowledge/fleet/machine-c.md` must NOT be ported**: it describes the real client
  machine's sampling, session gaps and drift. Everything in `domain/`, `concepts/`,
  `sources/`, `agent/` and `fleet/machine-a.md` is public/non-sensitive and reusable.

---

## Decisions already made

- **The demo actually computes.** The preprocessing recipe and the training are real, not
  scripted: statistics are fitted on Train only and applied to Test, and the models are
  genuinely fitted in the browser. This is what makes the honest-metrics story land: a
  recipe that drops the informative columns produces a model that really does lose to the
  majority-class baseline, and the quality gate really does block it.
- **Honesty about architectures.** Browser-trainable: logistic regression, random forest,
  gradient boosting, small MLP, ridge-on-lags forecaster. LSTM / GRU / TCN / XGBoost are
  listed and described but **refuse to run** with a message saying they train on the
  production worker; no invented scores.
- **Three registry machines**, all public or synthetic:
  `mach-ai4i-mill` (AI4I 2020 rules, 2 000 generated rows, predict only),
  `mach-utility-pump` (synthetic 5-sensor, simulate + predict),
  `mach-packaging-drive` (synthetic 3-axis fixture, simulate + predict; carries the
  generalisation story in its 5-entry `migrations` list).
  AI4I rows are regenerated from the dataset's **published** generative rules, so TWF / HDF /
  PWF / OSF really do depend on products and differences of columns, which is why the
  calculated-feature editor earns its place.
- **Five stages** in the demo (production has four + a separate admin page):
  machine → data → prepare → train → **promote**.
- Added deps to `apps/frontend/package.json`: `d3-force@^3.0.0`, `@types/d3-force@^3.0.10`
  (already `npm install`ed). `papaparse` deliberately **not** added: no CSV upload in the
  demo; bundled public sources instead.

---

## Files written so far (all new, all on `dev`, none committed)

```
apps/frontend/lib/demo-mlops/types.ts            : Capability, recipes, dataset versions, runs, deployments
apps/frontend/lib/demo-mlops/datasets.ts         : 3 machines + seeded row generators + migrations
apps/frontend/lib/demo-mlops/formula.ts          : formula grammar: validation (ported) + real
                                                    shunting-yard tokenizer/compiler/evaluator (new)
apps/frontend/lib/demo-mlops/preprocessing.ts    : retypeColumn, defaultRecipe, digestOf,
                                                    materialiseRows, split, Train-only statistics,
                                                    transform, warnings, previewRecipe
apps/frontend/lib/demo-mlops/training.ts         : ARCHITECTURES, real learners (logistic, CART
                                                    forest, gradient boosting, MLP, ridge-lag
                                                    forecaster), scoring + quality gate
apps/frontend/lib/demo-mlops/store.ts            : module-scope store (subscribe/getSnapshot),
                                                    buildDataset, startTraining, cancelRun,
                                                    promoteRun, workflowProgress
apps/frontend/components/mlops/workflow-nav.tsx
apps/frontend/components/mlops/machine-registry-stage.tsx   : machine list + schema-history timeline
apps/frontend/components/mlops/machine-data-stage.tsx       : column contract, sources, readiness gates, row preview
apps/frontend/components/mlops/derived-feature-editor.tsx   : ported + per-machine suggestions
apps/frontend/components/mlops/preprocessing-workspace.tsx  : recipe controls + raw/train/test preview
apps/frontend/components/mlops/model-scorecard.tsx          : headline figures, per-outcome table,
                                                              confusion matrix, quality verdict
```

Known nit already fixed: the Gaussian-elimination `solve()` in `training.ts` had a bad
return expression; it now returns `augmented.map((row, index) => row[size] / row[index])`.

---

## Next steps, in order

### Milestone 1a: MLOps ✅ done

Route `/mlops`, wired into `app-sidebar.tsx` and `app-header.tsx`. Five stages:

1. `machine-registry-stage.tsx`: machine list, why there is no add-machine form, and the
   **schema history timeline** that carries the bespoke → generic story.
2. `machine-data-stage.tsx`: column contract, connected sources, per-goal readiness gates
   (`readinessFor`), 8-row authoritative preview.
3. `preprocessing-workspace.tsx` + `derived-feature-editor.tsx`: recipe sidebar and a
   raw/train/test preview that really recomputes. Freezing produces a dataset version.
4. `training-stage.tsx`: dataset picker over ready versions, model picker split into
   *trains here* vs *production worker only*, hyperparameter form with `parameterRange` and
   `configurationProblems`, the exact JSON the run will carry, run list with progress,
   cancel, `<ModelScorecard>` and a technical-details dump.
5. `promotion-stage.tsx`: candidate table scored against the trivial answer, quality
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

### Milestone 1b: Agent Knowledge Wiki ✅ done

Route `/knowledge`, wired into `app-sidebar.tsx` and `app-header.tsx`.

**The corpus: 50 pages, reviewed page by page before porting.**
`lib/demo-knowledge/corpus/{root,domain,concepts,sources,fleet,agent,raw}.ts` hold the
markdown as template literals, frontmatter and all.

- `domain/` (12) and `concepts/` (11) ported essentially verbatim: public standards and
  modelling knowledge, every numeric claim carrying a `sources:` entry or an explicit
  Unsourced callout.
- `sources/` (11) ported, with production repo paths scrubbed. The AI4I page was rewritten
  where it mattered: production checks the real CSV into the repo, this demo does not, so
  the page now separates the published counts (339 failures, 96.61 % baseline) from what the
  demo's own seeded reconstruction produces (114 of 2 000, 94.30 % baseline) and says why
  the two are not interchangeable.
- `fleet/` (4) **written fresh** for this demo's registry: `ai4i-milling-machine`,
  `utility-pump-02`, `packaging-drive-01`, and `schema-generalisation`: the page that tells
  the bespoke-pipeline → generic-schema story in full, including what the abstraction cost.
  Every number on them was read off the MLOps registry, not invented.
- `agent/` (8) **rewritten**, not ported. Production's operational pages carry a real
  database schema and real client sampling cadences; these describe this demo's own tool
  catalogue, capability guards and browser-side data contract instead.
- `raw/` (1): the legacy maintenance-guidelines document, unedited, so the corpus's claim
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

### Milestone 2: README ✅ done

Two new chapters, written in the existing voice, and the surrounding renumbering:

- **Chapter 3: "A trained model is not yet a workflow"** (new). Opens with the ML-engineer
  intern motivation and the gap between training a model and having a rerunnable workflow,
  then tells the **Machine C bespoke → generic schema** story as a before/after table
  (positional columns, `contextRows = 30` in two places, implicit temporality, one model
  path, notebook preprocessing, a scaler fitted twice), what forced it (the mill has no time
  axis and no value of `contextRows` means "there is no context"), **what it cost**, then the
  five stages, the calculated-feature result and the honesty rules.
- **Chapter 6: "Memory the agent can read, and so can you"** (new). LLM-Wiki paper as
  *inspiration only* with the benchmark disclaimer, the BM25 + interconnected wiki +
  navigable relations + human-editable design in one sentence, why chunk-and-embed is the
  wrong shape for "what caused this and what did we do last time", then the derived graph,
  typed relations, wanted pages, sourced numbers, kept conflicts, provenance and the two
  store-enforced rules. Ends on the sensitive-data boundary.
- Chapters 3/4/5 renumbered to 4/5/7; the agent badge anchor followed.
- Also: the discipline strip gained `MLOPS`; the top nav line gained MLOps and Knowledge
  wiki; the demo callout now says the two panes really compute in the browser rather than
  being scripted; the mermaid diagram gained the MLOps stage and renamed the wiki node; the
  stack table gained two rows; the explore list gained two bullets; and the credit paragraph
  now names the wiki and the schema migration.

The calculated-feature figures in the README were **measured, not recalled**: same forest,
same options, raw columns 0.795 balanced accuracy / 0.609 failure recall / 96.00 % accuracy,
with `power_w` + `temp_difference_k` + `overstrain` 0.929 / 0.870 / 98.25 %, against a
94.25 % class prior on that split.

Anchor and relative-path check over the whole README: 9 internal links all resolve, every
image and file path exists.

<details><summary>Original brief for this milestone</summary>

- Keep the existing narrative voice and structure; do not turn it into product docs.
- MLOps: inspired partly by the user's previous **ML Engineer intern** experience and the
  gap between training a model and having a reproducible, usable ML workflow, brought into
  this project to make preparation, evaluation, promotion and serving transparent.
- Knowledge Wiki: inspired by **"Retrieval as Reasoning: Self-Evolving Agent-Native
  Retrieval via LLM-Wiki"**, <https://arxiv.org/abs/2605.25480>. Say it **inspired the
  design**; the paper *reports* promising gains for multi-hop / cross-document reasoning;
  **do not imply this implementation inherits those benchmark results.** Design in one
  breath: BM25 for fast retrieval · a persistent interconnected wiki for structured
  knowledge · the agent navigates relationships when it needs to reason deeper ·
  human-readable, human-editable knowledge instead of an opaque vector store.
- Also add the generalisation story (bespoke Machine C pipeline → generic machine schema).

</details>

### Milestone 3: screenshots ✅ done

Seven shots under `assets/`, all 1600 px wide, captured by a throwaway Playwright spec that
was deleted afterwards:

| File | What it shows |
|---|---|
| `mlops_machine_registry.png` | The registry and the schema-history timeline (the generalisation story) |
| `mlops_prepare_recipe.png` | The recipe sidebar with all three calculated features written out, beside the recomputed preview |
| `mlops_model_scorecard.png` | **Two runs on one screen**: the same forest on raw columns and on the calculated ones |
| `mlops_promotion_gate.png` | Both candidates scored against the trivial answer, one selected, nothing serving yet |
| `knowledge_wiki_graph.png` | The 50-page graph beside the index |
| `knowledge_wiki_page.png` | A BM25 search, the graph dimming everything else, and the page open |
| `knowledge_wiki_provenance.png` | The provenance panel: each source's kind and how many pages cite it |

Three things the capture had to handle:

- **The Next.js dev-overlay badge** sits over the sidebar footer, and **sonner toasts** sit
  over the header. Both are hidden with an injected style before each shot.
- **`fullPage` puts sticky chrome in the wrong place.** The viewport is grown to the
  document height instead and the shot is a plain viewport shot.
- **The scorecard is scripted to earn its caption.** The spec trains the forest on the raw
  recipe, goes back to Prepare, adds `power_w`, `temp_difference_k` and `overstrain`,
  freezes v2 and trains again, so the two runs in the image are the comparison the README
  claims, not two unrelated runs.

The README's calculated-feature table was **restated against the workspace's own defaults**
(24 trees, depth 7, min leaf 4, balanced) so the numbers in the prose and the numbers in the
screenshot under it are the same run: balanced accuracy 83.7 % → 93.1 %, failure recall
69.6 % → 87.0 %, plain accuracy 96.3 % → 98.5 %, against a 94.3 % class prior.

### Milestone 4: navigable README ✅ done

The README is now a set of linked pages rather than a numbered sequence, in plain GitHub
Markdown: no framework, no generated table of contents, no HTML beyond the `<sub>` the
trails use.

- **`Chapter N:` is gone from every heading.** Sections are named for what they answer, and
  the two prose references to a chapter number were rewritten as links.
- **A `Start anywhere` map** sits under the header: thirteen rows, each a page and the
  question it answers. The header keeps a short jump line pointing into it.
- **Every page ends with a trail** (`↑ Map · → Next · ↔ Related`), so the reader is always
  one click from the map, the next page, and the page this one leans on.
- **Two new pages.** `The demo, in pictures` indexes all ten screens against the section that
  explains each, and `What this leans on` collects the datasets, standards, TSGM, the
  LLM-Wiki paper (inspiration only, benchmark results explicitly not claimed) and the intern
  experience behind the promotion gate.

74 internal anchors, all checked against GitHub's own slugging rules; every image and
relative path resolves.

---

## Session 2026-08-29: production UX parity (branch `fix/production-ux-parity`)

PR #2 (`dev` -> `main`) is open and unmerged. This branch sits on top of `dev` and should be
folded into that PR or opened as its own once the screenshots land.

Started from six things the user reported after reviewing the Vercel preview:

1. **The wiki note preview could not be scrolled.** Root cause: all four right-pane panels
   were `flex h-full flex-col` inside a Card that was itself a column flex container with
   `max-h-[52rem] overflow-hidden`. `h-full` against an indefinite parent height resolves to
   `auto`, so the body's `flex-1 min-h-0 overflow-auto` never got a bounded height and the
   markdown was clipped with no scrollbar. Edit mode worked only because the textarea scrolls
   itself. Fixed by giving the Card a definite height and the panels `min-h-0 flex-1`.
   **Then a second bug appeared:** with a definite height, the unconstrained 15-item backlinks
   panel took the whole pane and `min-h-0` let the body shrink to nothing. Links list is
   capped at `max-h-44` and scrolls on its own; body is `basis-0` so it is sized from what is
   left. e2e test asserts the pane is over 300px tall BEFORE asserting it scrolls, because the
   first version of that test passed against a 30px body.
2. **MLOps machine pane too verbose.** Rebuilt to production's shape: plain list, register
   form on the right (disabled, one line saying why). The "why there is no add machine form"
   essay is gone; schema history is a `<details>`.
3. **Missing JSON configuration.** Ported production's `training-configuration-panel.tsx`:
   read-only parameter hints, editable Configuration JSON, Download effective JSON, Apply JSON
   with validation. Deleted the per-parameter number fields, which is exactly what production
   had already deleted (its source carries a comment saying two sets of controls were only ever
   a way for the two to disagree).
4. **"Who invented the promote?"** Nobody. It is real: production
   `app/(protected)/admin/models/page.tsx` calls `promoteEntityTrainingRun` and moves the
   MLflow `@production` alias, with a required override reason on `not_recommended`. The demo
   had invented only the *placement*. Moved to `/admin/models` as the approvals table, wired
   into the admin tab bar and overview. `Stage` type lost `"promote"`; the wizard is four
   stages and links across.
5. **Design read as AI-generated.** User chose "sharpen, keep teal": `--radius` 0.72rem ->
   0.25rem, panel shadows flattened, cards solid instead of `bg-card/95` over the page grid.
   Production's own tokens (blue `#1d4ed8`, `--radius: 0.18rem`) were deliberately NOT adopted,
   so existing screenshots stay valid.
6. **Dark mode hard to read.** Measured: contrast was fine (muted text 7.64:1, AAA). The real
   problem was borders at 1.52:1 against a card plus shadows invisible on a dark ground, so
   panels ran together. Borders `#30454b` -> `#46646e` (2.42:1), inputs and muted text up,
   `instrument-label` 0.68rem/0.14em -> 0.72rem/0.08em, page grid alpha 26% -> 18%.

### Found while reviewing the screenshots, not reported by the user

- **Backlinks showed the same page twice** with nothing to tell the entries apart, under a
  label reading "15 pages point here" while counting rows. A page can point here under two
  relations, which is the typed-link feature working, but the relation was only in a `title`
  tooltip. Each chip names its relation now; the label counts distinct pages. Test added.
- Three README captions were wrong about their own screenshots: a "paywalled" provenance
  category that does not exist in the corpus (only Primary/Secondary/Internal), calculated
  features described as applied when the screenshot shows them offered as suggestions, and a
  schema-history claim that no longer matched the collapsible.
- Registry copy said the machine list was "below" the form, true only once the layout stacks.

### README

Cut roughly 240 words net (more gross, since the JSON stage and the approvals paragraph are
new text): the sentences restating the "In plain terms" summary directly above them, bullets
repeating the table above them, and transitions that only announced the next section. No
number or claim changed. Still zero long dashes; all anchors resolve.

### Verified

`tsc --noEmit`, `eslint`, `vitest run` (35 knowledge tests incl. the new backlink one),
`npm run build` with `/admin/models` routed, and Playwright green including the new scroll
regression, which was confirmed to fail with the fix reverted.

**The click-through reproduces the README's headline table exactly:** Random forest at UI
defaults gives 83.7% balanced / 69.6% failure recall on raw columns and 93.1% / 87.0% with
the three calculated features, against the 94.3% trivial answer. So "a run anyone can
reproduce by clicking" is now a checked claim, not a hopeful one.

---

## Session 2026-08-29b: preprocessing terminology, and no long dashes anywhere (on `main`)

Two asks, both cosmetic on the surface and a little less so underneath.

### "Prepare" is now "Preprocessing"

Stage three said **Prepare**, which is what a person says rather than what the pipeline does.
Renamed through the stack, not just on the chip, because a label and an id that disagree are
the next reader's small confusion:

- `Stage` union: `"prepare"` becomes `"preprocess"` (`lib/demo-mlops/types.ts`), and with it
  the `complete` record and the three `setStage` calls.
- Nav chip reads **Preprocessing**; caption "Write the recipe" is unchanged.
- The button leaving the data stage: "Prepare this data" becomes "Preprocess this data".
- `workflowProgress()` in `lib/demo-mlops/store.ts` deleted. Exported, called by nothing,
  still keyed on the `promote` stage that moved to `/admin/models` last session, and its doc
  comment still said "five stages". Dead code that lies is worse than dead code.
- README stage table and the two glossary sentences follow the rename.

### Long dashes: 438 of them, none left

`grep -o` counts bytes, not characters, so the first count came back three times too high.
The real inventory across `apps/frontend`, excluding `node_modules`: **438**, of which 349
were in the seven knowledge-corpus files, which are UI, because that markdown is what the
preview pane renders.

They were not all the same problem, so they did not all get the same fix:

- **Prose dashes** became a colon, semicolon, comma or full stop depending on what the clause
  was doing. Appositives that interrupt a sentence became parentheses, which is what the
  paired dashes were imitating: `That framing (not the engine physics) is what makes C-MAPSS
  the reference example`.
- **Numeric ranges** (`0-2.8 mm/s`, `250-350 kHz`, `1-10`) became hyphens inside tables, and
  "to" where a hyphen next to a unit would misread: `≈300 kW to 50 MW`.
- **Null placeholders** were the interesting ones. A lone dash in a table cell is not
  punctuation, it is a value, so it needed a word rather than a substitute mark: `n/a` in the
  column contract, `none` in the wiki's own tables, `not scored` where a metric is missing.
  One did not survive as a placeholder at all: a dash after `Dataset v` would have read
  "Dataset vn/a", so the whole expression now branches to "No dataset version".
- **ISO standard titles** keep an ASCII hyphen as their part separator, which is the ordinary
  citation convention: *Mechanical vibration - Evaluation of machine vibration ... - Part 3*.
- **YAML titles** could not take the obvious colon. `title: Supervisor: Routing Guide` parses
  under the hand-rolled frontmatter reader but is not valid YAML, and the source view shows
  the raw text, so those became `title: Supervisor Routing Guide`.

`PROGRESS.md` got the same pass, since it is written in the same voice. The backend and `ml/`
markdown was left alone: it is not the demo UI and predates this work.

### Screenshots

Every MLOps and wiki shot showed either the old **Prepare** chip or copy that has since
changed, so seven were recaptured through a scripted click-through: registry, recipe,
scorecard, approvals, graph, page, provenance. `mlops_training_config.png` shows neither and
was left as it was. Framing is now the `main` element at a 1592px viewport, so the sidebar
and top bar stay out, matching how the previous set was cropped.

The scorecard reproduces the README's headline table again, on purpose: Random forest at UI
defaults, 83.7 % balanced / 69.6 % failure recall on the registered columns, 93.1 % / 87.0 %
with the three calculated features, against a 94.3 % trivial answer.

### Verified

`tsc --noEmit`, `eslint`, `vitest run` (19 files, 106 tests), `npm run build`, and Playwright
10 passed. Dash count across `apps/frontend`: 0.

---

## Working rules to keep honouring

- Inspect both repos before changing anything; production = behaviour, demo = styling.
- No backend in the demo. No private/client machine data. Mock data must stay believable
  and internally consistent.
- Verify each milestone before moving to the next.
- Preserve unrelated work; do not revert existing changes.
- Final report must list exactly what changed, screenshots created, checks run, and
  anything intentionally left out.
