# Portfolio Demo Decision Record

## Deployment decision

The public Vercel deployment is frontend-only. `NEXT_PUBLIC_DEMO_MODE=true` selects `DemoDigitalTwinProvider`; FastAPI remains the default for local Docker/full-stack use. Vercel must use `apps/frontend` as its project root.

The demo provider supplies ten fictional fleet instances derived from the three existing model profiles. These instances demonstrate UI scale and access controls; they do not represent ten independently trained models. Its fixed timestamps, formula-based telemetry, scripted simulations, and curated chat responses make the experience repeatable and remove all backend, database, credential, and private-data dependencies.

Free-form chat input outside the supported fleet-risk, telemetry, prediction, simulation, and maintenance scenarios returns a prompt guide. It never calls an external LLM.

## Public-data boundary

- All “live” metrics in the hosted app are simulated.
- Machine A’s model foundation is the public AI4I dataset.
- Machine C’s hosted demonstration uses only synthetic/sanitized data.
- No sensitive or proprietary client data is deployed.
- The disclaimer remains visible on login and throughout protected application pages.

## Corrected project narrative

The work progressed from public baseline data, through the discovery that client coverage was insufficient, to TSGM augmentation and Autoresearch-guided LSTM tuning. The retained forecasting contract is a 20-minute context window, 10-minute prediction horizon, 5-minute training stride, and autoregressive rollout to one hour. PostgreSQL persistence, chatbot redesign, authentication/access control, and dashboard feedback followed.

The chatbot redesign moved from fixed routing toward native supervisor tool calling. The reported 75% response-time improvement is explicitly a team-observed estimate, not a controlled benchmark.

## Documentation decisions

The README leads with the hosted demo and data disclaimer, presents the development story chronologically, retains measured model metrics with caveats, groups screenshots by purpose, and contains an ER diagram representing every ORM table in `apps/backend/app/db/models.py`.

## Verification contract

- Demo provider contract, ten-machine filtering/sorting, one-click auth, simulation, scripted chat, and unsupported prompts are covered by Vitest.
- Disclaimer/provenance copy is component-tested.
- Playwright covers entry → one-click demo → chat response/tool trace.
- Completion requires unit tests, lint, production build, Playwright, README asset validation, Mermaid fence validation, and ORM/ERD table-name comparison.
