# CODEX-plan.md

## Task: Create a sanitized public portfolio repo from a private university capstone project.

## Context
Original repo (read-only reference, do NOT modify or push to it):
  git clone https://github.com/COS40005-P7/Predictive-maintenance-digital-twin-simulator original-repo

Target: create a new clean repo at NathanVuSwinburne/predictive-maintenance-digital-twin-demo

The original repo is a predictive maintenance digital twin system with:
- Next.js/TypeScript frontend dashboard
- FastAPI Python backend with agentic AI (OpenAI Agents SDK supervisor + SQL sub-agent)
- RAG chatbot with tool calling (6 tools: prediction, simulation, recommendation, complaint, knowledge, database)
- ML models for 3 machine types (anomaly detection, LSTM forecasting, failure classification)
- PostgreSQL database, Docker Compose setup

---

## STEP 1 — Clone original repo as read-only reference

```bash
git clone https://github.com/COS40005-P7/Predictive-maintenance-digital-twin-simulator original-repo
```

---

## STEP 2 — Create fresh sanitized directory

Create a new directory called `predictive-maintenance-digital-twin-demo` (no git history).

### FILES TO COPY AS-IS (safe, keep):
```
original-repo/apps/backend/app/                     → apps/backend/app/
original-repo/apps/backend/requirements.txt         → apps/backend/requirements.txt
original-repo/apps/backend/Dockerfile               → apps/backend/Dockerfile
original-repo/apps/backend/.dockerignore            → apps/backend/.dockerignore
original-repo/apps/backend/models/                  → apps/backend/models/
original-repo/apps/backend/rag_docs/                → apps/backend/rag_docs/
original-repo/apps/backend/agent_wiki/              → apps/backend/agent_wiki/
original-repo/apps/backend/tests/                   → apps/backend/tests/
original-repo/apps/frontend/app/                    → apps/frontend/app/
original-repo/apps/frontend/components/             → apps/frontend/components/
original-repo/apps/frontend/lib/                    → apps/frontend/lib/
original-repo/apps/frontend/public/                 → apps/frontend/public/
original-repo/apps/frontend/test/                   → apps/frontend/test/
original-repo/apps/frontend/next.config.ts          → apps/frontend/next.config.ts
original-repo/apps/frontend/package.json            → apps/frontend/package.json
original-repo/apps/frontend/package-lock.json       → apps/frontend/package-lock.json
original-repo/apps/frontend/tsconfig.json           → apps/frontend/tsconfig.json
original-repo/apps/frontend/postcss.config.mjs      → apps/frontend/postcss.config.mjs
original-repo/apps/frontend/playwright.config.ts    → apps/frontend/playwright.config.ts
original-repo/apps/frontend/vitest.config.ts        → apps/frontend/vitest.config.ts
original-repo/apps/frontend/proxy.ts                → apps/frontend/proxy.ts
original-repo/docker-compose.yml                    → docker-compose.yml
original-repo/ml/machine_a/                         → ml/machine_a/
original-repo/ml/machine_b/notebooks/               → ml/machine_b/notebooks/
original-repo/ml/machine_c/models/                  → ml/machine_c/models/
original-repo/ml/machine_c/scripts/                 → ml/machine_c/scripts/
original-repo/ml/machine_c/notebooks/               → ml/machine_c/notebooks/
original-repo/ml/machine_c/data/processed/          → ml/machine_c/data/processed/
original-repo/ml/machine_c/tsgm_data_generate/figures/  → ml/machine_c/tsgm_data_generate/figures/
original-repo/ml/data/raw_data/ai4i2020.csv         → ml/data/raw_data/ai4i2020.csv
original-repo/ml/data/raw_data/machine_failure_data.csv → ml/data/raw_data/machine_failure_data.csv
original-repo/ml/data/raw_data/synthetic_machine_failure_data.csv → ml/data/raw_data/synthetic_machine_failure_data.csv
original-repo/LICENSE.md                            → LICENSE.md
```

### FILES TO EXCLUDE (do NOT copy):
```
# Real client data
original-repo/ml/data/raw_data/sensordata 1.csv       ← REAL CLIENT SENSOR DATA

# Internal AI dev scaffolding
original-repo/.claude/
original-repo/apps/backend/.claude/
original-repo/ml/.claude/
original-repo/apps/frontend/.agents/
original-repo/AGENTS.md                               ← replaced by this repo's AGENTS.md
original-repo/CLAUDE.md                               ← replaced by this repo's CLAUDE.md
original-repo/CONTEXT-map.md
original-repo/**/CONTEXT.md

# Internal university documents
original-repo/ml/machine_c/tsgm_data_generate/report/TSGM Synthetic Data Report.docx

# Internal dev artifacts
original-repo/ml/machine_c/autoresearch/
original-repo/ml/machine_c/tsgm_data_generate/*.py
original-repo/ml/machine_c/tsgm_data_generate/*.md
original-repo/ml/machine_c/tsgm_data_generate/*.tsv
original-repo/ml/machine_c/tsgm_data_generate/*.json
original-repo/ml/machine_c/tsgm_data_generate/*.png
original-repo/ml/machine_c/tsgm_data_generate/uv.lock
original-repo/results.tsv
original-repo/.gitignore                              ← replaced with new one below

# Skill lock files
original-repo/apps/frontend/skills-lock.json
original-repo/apps/frontend/.agents/
```

---

## STEP 3 — Generate synthetic Machine C demo sensor data

Create `ml/data/raw_data/sensordata_demo.csv` with this schema (matching the real file's structure):

Columns: `session_id, timestamp, VibrationX, VibrationY, VibrationZ, Temperature, label`

Generate 500 rows of synthetic data:
- session_id: integers 1–10 (50 rows each)
- timestamp: sequential datetime starting 2024-01-01 00:00:00, 1-second intervals per session
- VibrationX/Y/Z: random normal values, mean=0.02, std=0.005 for label=low; mean=0.08, std=0.015 for label=medium; mean=0.18, std=0.03 for label=high
- Temperature: random normal, mean=35.0, std=2.0 for low; mean=42.0, std=3.0 for medium; mean=55.0, std=5.0 for high
- label: distribute as 60% low, 30% medium, 10% high across sessions

Write a Python script `ml/machine_c/scripts/generate_demo_data.py` that generates this file so anyone can reproduce it.

---

## STEP 4 — Create .env.example

Create `apps/backend/.env.example`:

```
# LLM Provider — set one of the following
DEFAULT_LLM_PROVIDER=deepseek

# DeepSeek (recommended for demo — fast and low cost)
DEEPSEEK_API_KEY=your-deepseek-api-key-here

# OpenAI (alternative)
# OPENAI_API_KEY=your-openai-api-key-here
# OPENAI_MODEL=gpt-4o-mini

# Ollama (free local alternative — requires Ollama installed)
# DEFAULT_LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://localhost:11434
# OLLAMA_MODEL=qwen2.5:7b

# Google Gemini (alternative)
# GEMINI_API_KEY=your-gemini-api-key-here

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/predictive_maintenance

# Optional: path to external Obsidian vault for LLM Wiki
# KNOWLEDGE_VAULT_PATH=/absolute/path/to/your/vault

# CORS
CORS_ORIGINS=http://localhost:3000
```

---

## STEP 5 — Create .gitignore

Create `.gitignore` at repo root:

```
# Python
__pycache__/
*.py[cod]
*.pyo
.Python
*.egg-info/
dist/
build/
.venv/
venv/
env/
*.egg

# Environment
.env
.env.*
!.env.example

# ML artifacts (large binaries — tracked explicitly where needed)
*.pt
*.h5
*.pkl
# Note: .joblib files are intentionally included for demo inference

# Jupyter
.ipynb_checkpoints/

# Node / Next.js
node_modules/
.next/
out/
.cache/

# Testing
.pytest_cache/
htmlcov/
.coverage
coverage.json
playwright-report/

# Docker
*.log
logs/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/

# Data — never commit real sensor data
ml/data/raw_data/sensordata*.csv
!ml/data/raw_data/sensordata_demo.csv
```

---

## STEP 6 — Create README.md

Write `README.md` at repo root with the following content:

---

# Predictive Maintenance Digital Twin — Portfolio Demo

> **Sanitization notice:** This repository is a sanitized public portfolio version of a university capstone project originally developed for an industry-style client brief. Private client data, credentials, internal documents, and proprietary materials have been removed or replaced with synthetic/demo data.

## Project Overview

A full-stack predictive maintenance platform that monitors industrial equipment through a real-time dashboard, runs ML-based failure prediction and forecasting, and provides an agentic AI chatbot capable of querying the database, running predictions, and recommending maintenance actions.

Built as a university capstone (Swinburne COS40005) for an industry client with real manufacturing equipment.

## Why This Project Matters

Manufacturing downtime costs industry billions annually. This platform turns raw machine telemetry into actionable maintenance intelligence — moving from reactive ("fix it when it breaks") to predictive ("fix it before it breaks") maintenance.

## Key Features

- **Fleet dashboard** — real-time health scores, risk classifications, anomaly scores, and failure probability per machine
- **ML inference pipeline** — failure classification (Random Forest), LSTM time-series forecasting, and simulation serving
- **Agentic AI chatbot** — supervisor agent with 6 callable tools, RAG knowledge base, session memory, and trace logging
- **Simulation pane** — what-if scenario testing for operating conditions and maintenance actions
- **Docker Compose** — one-command local deployment of frontend, backend, and database

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js Frontend                      │
│   Dashboard │ Chat UI │ Simulation Pane │ Auth           │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────┐
│                  FastAPI Backend                          │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  ML Inference│  │ Agent System │  │  Auth / Users │  │
│  │  prediction  │  │  supervisor  │  │  JWT sessions │  │
│  │  forecasting │  │  SQL agent   │  └───────────────┘  │
│  │  simulation  │  │  RAG / Wiki  │                     │
│  └─────────────┘  └──────────────┘                     │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              PostgreSQL Database                          │
│  machines │ telemetry │ predictions │ chat_history        │
│  simulations │ agent_traces │ users                      │
└─────────────────────────────────────────────────────────┘
```

## Dashboard

The client-facing dashboard provides:
- **Fleet posture view** — risk vs. health scatter plot for all machines
- **Machine status cards** — health %, risk %, uptime, failure probability, risk classification
- **Weekly event breakdown** — fault predictions, anomalies, maintenance actions by day
- **Summary metrics** — fleet size, at-risk count, average risk score, recent simulation count

## Real-Time MLOps Pipeline

Three machine types each have dedicated ML pipelines:

| Machine | Model Type | Task |
|---------|-----------|------|
| Machine A | Random Forest (scikit-learn) | Binary failure classification |
| Machine B | Random Forest + feature engineering | Multi-label failure type classification |
| Machine C | LSTM (PyTorch) + Random Forest | Time-series forecasting + failure classification |

The backend exposes inference as REST endpoints, with model input profiles and feature mapping allowing different sensor schemas to be served without code changes.

## Agentic AI Chatbot

The chatbot uses a **supervisor agent architecture** built on the OpenAI Agents SDK.

### Tool Calling

The supervisor dynamically routes user intent to one of 6 tools:

| Tool | What it does |
|------|-------------|
| `query_database` | SQL sub-agent with read-only enforcement; schema injected at startup |
| `run_prediction` | Calls ML inference pipeline for a given machine |
| `run_simulation` | Executes simulation scenarios and returns forecast results |
| `lookup_knowledge` | RAG retrieval from the LLM Wiki (Obsidian vault) |
| `propose_maintenance` | Generates structured maintenance recommendations |
| `extract_complaint` | Extracts structured fault signals from natural language |

### RAG / LLM Wiki

The agent's knowledge layer uses an **Obsidian vault** as a structured wiki rather than a flat document store. At startup, the vault is indexed and made available for semantic retrieval. This gives the agent grounded domain knowledge about machine types, maintenance procedures, and failure modes.

### Agent Tracing

Every reasoning step the agent takes is persisted to the database and surfaced in the chat UI — giving operators full transparency into how the agent reached its recommendation.

### Session Memory

The agent maintains working memory across conversation turns within a session, so follow-up questions resolve correctly without re-stating context.

## Simulation Pane

The simulation pane allows users to test what-if scenarios:
- Adjust operating parameters (temperature, load, speed)
- Apply simulated maintenance actions
- View forecast risk changes over a time horizon
- Compare baseline vs. intervention outcomes

Simulation uses the Machine C LSTM model served through the backend inference API.

## Tech Stack

**Frontend:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Vitest, Playwright

**Backend:** Python 3.11, FastAPI, SQLAlchemy, Pydantic, OpenAI Agents SDK, LangChain (RAG)

**ML:** scikit-learn, PyTorch, joblib, pandas, numpy

**Database:** PostgreSQL 16

**Infrastructure:** Docker, Docker Compose

**LLM:** DeepSeek (default) | OpenAI GPT-4o-mini | Ollama (local) | Google Gemini

## Demo Data

This repo uses synthetic/demo data in place of private client sensor readings:

- `ml/data/raw_data/ai4i2020.csv` — public UCI AI4I 2020 Predictive Maintenance dataset (10,000 records)
- `ml/data/raw_data/machine_failure_data.csv` — synthetic telemetry simulation dataset
- `ml/data/raw_data/sensordata_demo.csv` — synthetic Machine C sensor data generated to match original schema (VibrationX/Y/Z, Temperature, session, label)

To regenerate demo sensor data: `python ml/machine_c/scripts/generate_demo_data.py`

ML models for Machine C were trained on proprietary sensor data from the capstone client engagement and are included as pre-trained binaries for demo inference.

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | Authenticate and get JWT |
| GET | `/api/v1/machines/` | List all machines with status |
| GET | `/api/v1/machines/{id}/telemetry` | Recent telemetry for a machine |
| POST | `/api/v1/chat/` | Send message to agent |
| GET | `/api/v1/history/` | Chat history for session |
| POST | `/api/v1/simulations/` | Run a simulation scenario |
| GET | `/api/v1/simulations/{id}` | Get simulation result |

Full API docs available at `http://localhost:8000/docs` when running locally.

## How to Run Locally

### Prerequisites
- Docker and Docker Compose
- A DeepSeek API key (free tier available at platform.deepseek.com)

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/NathanVuSwinburne/predictive-maintenance-digital-twin-demo
cd predictive-maintenance-digital-twin-demo

# 2. Set up environment
cp apps/backend/.env.example apps/backend/.env
# Edit apps/backend/.env and add your DEEPSEEK_API_KEY

# 3. Start all services
docker compose up --build

# 4. Open the dashboard
# Frontend: http://localhost:3000
# API docs: http://localhost:8000/docs
```

Default login credentials (seeded demo data):
- Username: `admin` / Password: `admin`

## Screenshots

### Synthetic Data Evaluation Plots
The following plots are from the TSGM synthetic data generation and evaluation process used to validate Machine C training data quality:

![VibrationX PSD](ml/machine_c/tsgm_data_generate/figures/mean_psd_0_VibrationX.png)
![VibrationY PSD](ml/machine_c/tsgm_data_generate/figures/mean_psd_1_VibrationY.png)
![VibrationZ PSD](ml/machine_c/tsgm_data_generate/figures/mean_psd_2_VibrationZ.png)
![Temperature PSD](ml/machine_c/tsgm_data_generate/figures/mean_psd_3_Temperature.png)
![PSD Band Powers](ml/machine_c/tsgm_data_generate/figures/psd_band_powers.png)

### Model Training
![Training Curves](ml/machine_c/models/training_curves.png)
![Long Horizon Evaluation](ml/machine_c/models/long_horizon_eval.png)

> Dashboard and chat UI screenshots to be added. Run locally to see the live interface.

## My Contribution (Thanh Nam Vu)

- Analysed limitations of the existing LangGraph router-based architecture and led migration to a native tool-calling architecture using the OpenAI Agents SDK
- Designed and implemented the supervisor agent with dynamic routing across 6 tools
- Built a dedicated SQL sub-agent with read-only enforcement and schema/routing documentation injected via `agent_wiki/` at startup
- Replaced the FAISS/RAG knowledge layer with an Obsidian wiki integration as the agent's second brain for domain knowledge lookups
- Added agent trace persistence so internal reasoning steps are stored in the database and surfaced in the chat UI
- Implemented session-level working memory so the agent retains context across conversation turns
- Wrote unit tests for tool imports, complaint extraction, and proposal management
- Contributed to model input profiles and sensor-feature mapping for multi-machine schema support

## Team & Contributions

| Name | Role | Key Contributions |
|------|------|-------------------|
| **Thanh Nam Vu** | ML/AI Engineer | Agentic supervisor, tool calling, RAG/wiki integration, agent tracing, session memory |
| Sy Dam Viet Nguyen | Frontend Engineer | Dashboard redesign, fleet posture scatter plot, weekly event chart, status cards |
| Nathan Wijaya | Full-Stack / DevOps | Intent parsing, mock data removal, Docker containerisation, Vitest/Playwright testing, MQTT ingestion framework |
| Alexander Rigato | IoT / Backend | gRPC/MQTT sensor framework, MQTT subscription-based assignment manager, live data integration prototype |
| Hoang Trang Anh Pham | AI / Project | Tool-calling agent contribution, agent trace support, sprint planning, synthetic data reporting |
| Andy Truong | ML Research / PM | TSGM LSTM evaluation, synthetic data quality assessment, sprint Gantt chart, team progress tracking |

## Limitations

- Live MQTT sensor integration is a prototype; the dashboard currently uses seeded demo data
- ML models for Machine C were trained on proprietary client data; retraining on public datasets is a future goal
- Per-user API rate limiting for the chatbot is not yet implemented
- Dashboard and chat UI screenshots not yet included in this README

## Future Improvements

- Live sensor ingestion via MQTT with configurable topic routing
- Per-user chatbot rate limiting (planned: 5 calls per session)
- Retrain Machine C models on fully public datasets
- Grafana/Prometheus monitoring for model drift and API latency
- CI/CD pipeline for model retraining and deployment

## Confidentiality Note

This repository is a sanitized public portfolio version of a university capstone project (Swinburne COS40005) originally developed for an industry-style client brief. Private client sensor data, credentials, internal documents, university submission files, and proprietary materials have been removed or replaced with synthetic/demo data. The original repository remains private.

---

## STEP 7 — Create CONTRIBUTORS.md

Write `CONTRIBUTORS.md` with this exact content:

```markdown
# Contributors

This project was developed as part of Swinburne University COS40005 (Computing Technology Project A/B) by a team of six students.

## Team

### Thanh Nam Vu
**Role:** ML/AI Engineer
Analysed the limitations of the existing LangGraph router-based architecture and led the migration to a native tool-calling architecture using the OpenAI Agents SDK. Implemented a supervisor agent that dynamically routes user intent across six tools: failure prediction, simulation, recommendation proposals, complaint signal extraction, knowledge vault lookups, and database queries. Built a dedicated SQL sub-agent with read-only enforcement and schema/routing documentation injected via an `agent_wiki` directory at startup. Replaced the previous FAISS/RAG knowledge layer with an Obsidian wiki integration as the agent's second brain for domain knowledge lookups. Added an agent trace feature so the agent's internal reasoning steps are stored in the database and surfaced in the chat UI. Implemented session-level working memory so the agent retains context across conversation turns. Wrote unit tests to validate tool imports, complaint extraction, and proposal management.

### Sy Dam Viet Nguyen
**Role:** Frontend Engineer
Redesigned and rebuilt the dashboard interface to better reflect the current state of the system. Added fleet-level summary metrics, machine status cards with health/risk/uptime percentages, a Risk vs Health scatter plot, and a weekly event breakdown chart. Collaborated on the TSGM synthetic data evaluation report.

### Nathan Wijaya
**Role:** Full-Stack / DevOps Engineer
Added automatic intent parsing and machine selection to the conversational interface with manual override support. Removed obsolete frontend mock-data components and performed regression testing. Containerised the frontend and integrated it into the shared Docker Compose setup. Added Vitest and Playwright testing libraries with comprehensive unit and end-to-end tests. Contributed to the MQTT ingestion framework and implemented configurable model input profiles and sensor-feature mapping.

### Alexander Rigato
**Role:** IoT / Backend Engineer
Planned and researched the gRPC sensor framework using ESPHome. Implemented an MQTT subscription-based assignment manager for live data ingestion. Built a prototype of frontend features for live data integration designed to work with the client's existing MQTT topics, built to be dynamic and support as many data streams as the client requires.

### Hoang Trang Anh Pham
**Role:** AI Engineer / Project Coordinator
Contributed to the tool-calling supervisor agent and agent trace implementation. Helped prepare sprint planning and Gantt charts. Contributed to the TSGM synthetic data report.

### Andy Truong
**Role:** ML Researcher / Project Manager
Conducted deep-dive analysis into the TSGM module evaluating LSTM training performance and synthetic dataset fidelity. Collaborated on the technical assessment report. Built and maintained sprint Gantt charts and monitored team progress throughout the final sprint.
```

---

## STEP 8 — Remove CONTEXT.md files and internal scaffolding

After copying all files, clean up any internal files that may have been included:

```bash
# Remove all CONTEXT.md files
find . -name "CONTEXT.md" -delete

# Remove any .claude directories
find . -name ".claude" -type d -exec rm -rf {} +

# Remove any .agents directories
find . -name ".agents" -type d -exec rm -rf {} +

# Remove skills-lock.json if present
find . -name "skills-lock.json" -delete

# Remove scheduled_tasks.lock if present
find . -name "scheduled_tasks.lock" -delete
```

---

## STEP 9 — Initialise git and create clean commit

```bash
git init
git add .
git commit -m "Initial public portfolio release — sanitized capstone demo"
```

---

## STEP 10 — Create GitHub repo and push

```bash
gh repo create NathanVuSwinburne/predictive-maintenance-digital-twin-demo \
  --public \
  --description "Predictive maintenance digital twin — FastAPI + Next.js + agentic AI chatbot with tool calling, LSTM forecasting, and real-time dashboard. Sanitized portfolio demo." \
  --source . \
  --remote origin \
  --push
```

---

## STEP 11 — Final verification checklist

After pushing, run these checks:

```bash
# Should show exactly 1 commit
git log --oneline

# Should return nothing (real client data excluded)
grep -r "sensordata 1" . 2>/dev/null

# Should return nothing (no real .env files)
find . -name ".env" -not -name ".env.example"

# Should return nothing (no Word docs)
find . -name "*.docx"

# Should return nothing (no internal AI scaffolding)
find . -name "CONTEXT.md"
find . -name ".claude" -type d
find . -name ".agents" -type d
```

Then visit `https://github.com/NathanVuSwinburne/predictive-maintenance-digital-twin-demo` and confirm:
- Repo is public
- README renders with architecture diagram and plots
- No sensitive files visible in the file browser

---

## Notes for Codex

- Do NOT modify or push anything to the original repo `COS40005-P7/Predictive-maintenance-digital-twin-simulator`
- `ml/machine_c/tsgm_data_generate/figures/*.png` — include these; they are the synthetic data evaluation plots referenced in the README
- `ml/machine_c/models/training_curves.png` and `long_horizon_eval.png` — include these; referenced in README Screenshots section
- ML model binaries (`.joblib`, `.pt`) — include intentionally; trained on proprietary data but binary format does not expose raw training data
- If any file copy fails due to binary format or size, skip and note it — do not abort the whole task
- The `results.tsv` at repo root is an internal benchmark artifact — exclude it
- `apps/frontend/skills-lock.json` — exclude (internal AI tooling)
- `ml/machine_c/tsgm_data_generate/report/*.docx` — exclude (internal university document)
