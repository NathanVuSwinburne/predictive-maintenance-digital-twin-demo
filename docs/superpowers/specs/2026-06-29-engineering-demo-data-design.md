# Engineering Demo Data and Interactive Analysis Design

## Objective

Make portfolio demo mode behave like a coherent predictive-maintenance environment. Machines, History, AI Assistant, Predict, and Simulation must share deterministic engineering data so that measurements, anomalies, explanations, predictions, and maintenance actions agree across pages.

This work applies only to the frontend demo provider. FastAPI and production-backed behavior remain unchanged.

## Data Architecture

Add a frontend demo engineering profile layer as the single source of truth for assets, telemetry, client monitoring sessions, thresholds, predictions, simulation outputs, history events, and scripted Assistant responses.

The layer will expose focused deterministic functions rather than keeping all generation logic in `demo-provider.ts`. A fixed seed or stable formulas must ensure that the same machine, session, and prompt always produce the same output.

All generated records will distinguish their provenance:

- `observed`: measurements retained from the available client dataset or a curated observed fixture derived from it.
- `synthetic`: deterministic continuation used to fill missing demo context or represent future forecast horizons.

UI copy and README documentation must state that client sessions are intermittent monitoring captures rather than continuous plant telemetry.

## Machine Profiles

Retain the existing ten demo assets and their identities. Add plausible asset-specific operating envelopes, sensor values, operating hours, service dates, failure modes, health/risk rationale, and 24-hour telemetry.

### Presses and spindles

Expose air temperature, process temperature, rotational speed, torque, tool wear, product grade, and derived power/load where relevant. Condition logic will account for thermal differential, the torque-speed relationship, accumulated tool wear, and overstrain.

### Pumps and fans

Expose bearing temperature, vibration RMS, discharge or static pressure, humidity, power, and load. Condition logic will represent cavitation or flow restriction, imbalance, condensation exposure, and overload without claiming a production ML model exists.

### Packaging drives and motors

Expose Vibration X/Y/Z and bearing temperature. Vibration will combine broadband noise, rotational components, amplitude modulation, and occasional transient bursts. Temperature will vary more slowly and may contain load steps, thermal lag, sharp sensor transients, and recovery. Cross-axis and vibration-temperature relationships must remain plausible.

## Client Monitoring Sessions

Machine C simulation sessions represent supervisor monitoring visits based on client data. Each session lasts approximately one to five hours, and independent sessions may have gaps of several days.

Use real session IDs, timestamps, durations, and observed measurements where repository data provides them. The demo should include representative choices such as sessions 10, 20, 78, and 100 when those IDs exist in the source data. Do not reinterpret session IDs as fault scenarios.

When a selected session lacks enough context for the demo or a future horizon is requested, continue from its observed endpoint. Synthetic continuation must preserve the session's baseline, variance, cross-axis relationships, sampling cadence, and local trend while adding realistic non-periodic vibration fluctuation and slower thermal response.

Charts must distinguish observed and synthetic segments, including a forecast-boundary marker and clear legend.

## Machines and History Pages

Machines will receive richer, internally consistent mock summaries and telemetry instead of uniform sinusoidal values. Existing filtering, sorting, access, and navigation behavior remains unchanged.

History will contain about 40 events over 30 days across telemetry anomalies, fault predictions, maintenance actions, simulation runs, and Assistant insights. Events should form traceable chains: an anomaly can lead to prediction review, Assistant investigation, simulation, and maintenance action. Machine IDs, sensor values, severity, timestamps, and descriptions must agree with the shared profiles.

## Predict Mode

All ten demo machines support manual prediction in demo mode. Input fields depend on machine type:

- Press/spindle: air temperature, process temperature, rotational speed, torque, tool wear, and product grade.
- Pump/fan: bearing temperature, vibration RMS, pressure, humidity, and power or load.
- Packaging drive/motor: Vibration X, Vibration Y, Vibration Z, and bearing temperature.

Each field includes units, plausible observed/recommended ranges, typical values, and out-of-envelope warnings. Prediction results use deterministic engineering scoring appropriate to the machine type and explain which fields drove the result. They must be labelled as simulated demo results, not production inference.

## AI Assistant

Retain automatic intent routing and make the scripted demo resemble production agent-selected response formatting. Assistant responses may contain text, status cards, comparison blocks, tables, charts, and links using the existing content-block contract.

Suggested prompts must be prominent and accurately describe supported scripted behavior. Include reliable examples for:

- Plotting telemetry for a named machine or client session.
- Returning a latest-values table with units and condition limits.
- Comparing fleet or machine risk in a table.
- Running a prediction and explaining breached fields.
- Starting or summarizing a simulation with observed-versus-forecast charts.

The demo provider will select response blocks automatically from prompt intent and optional wording such as "show as table." Tool traces remain visible and must name the simulated lookup, prediction, or simulation step honestly.

Unsupported prompts receive a concise boundary message and point back to working suggested prompts.

## Simulation Mode

Session selection will show client session ID, collection timestamps, duration, sample count, cadence, observed/synthetic counts, and gap from the previous session where known.

Simulation output will render all available sensor groups, not temperature alone. Machine C includes three-axis vibration and bearing temperature. Vibration should fluctuate materially rather than follow smooth repeated sine waves; temperature should show plausible steps, lag, transient spikes, and recovery where supported by the selected session profile.

Generated classification windows, risk, downtime, summary, and recommendations derive from the same sensor trajectory. A simulated imbalance signature, for example, must produce compatible risk language and bearing inspection or balancing recommendations.

## Error and Empty States

- Missing observed sessions fall back to a clearly labelled curated demo fixture.
- Insufficient context is reported without presenting synthetic data as observed.
- Unknown machines and unsupported prompts retain clear, non-crashing messages.
- Empty charts and tables render explanatory states rather than blank panels.
- Existing demo access rules and read-only security behavior remain unchanged.

## Documentation

Update README documentation to explain:

- Demo mode uses deterministic engineering mock data.
- Machine C sessions reflect intermittent one-to-five-hour client monitoring captures separated by multi-day gaps.
- Observed client-derived points and synthetic continuations are labelled separately.
- Assistant rich responses are scripted demonstrations of production agent capabilities.

Update relevant local context documentation if the implementation introduces or changes architectural intent.

## Verification

- Add unit tests for deterministic profile generation, machine-type prediction fields, session metadata, provenance boundaries, history consistency, and Assistant content-block selection.
- Extend provider tests to cover table, chart, prediction, and simulation prompts.
- Verify all generated numeric values are finite, timestamps are ordered, session durations are one to five hours, and observed/synthetic counts match readings.
- Verify prediction warnings and breached fields correspond to entered values.
- Run frontend unit tests, lint, and production build.
- Run the existing Playwright demo journey and add focused Playwright coverage for one telemetry-chart prompt, one prediction flow, and one simulation-session flow.
- Inspect Machines, History, Assistant, Predict, and Simulation in the browser at desktop and mobile widths.

## Scope Boundaries

- No FastAPI endpoint, database seed, production model, or production agent behavior changes.
- No claim that mock prediction scores are validated production inference.
- No unrelated visual redesign or provider-contract expansion unless required to represent provenance or session metadata safely.
