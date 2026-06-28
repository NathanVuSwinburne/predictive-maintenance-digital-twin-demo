# Contributors

This project was developed as part of Swinburne University COS40005 (Computing Technology Project A/B) by a team of six students.

## Team

### Thanh Nam Vu
**Role:** ML/AI Engineer

Analysed the limitations of the existing LangGraph router-based architecture and led the migration to a native tool-calling architecture using the OpenAI Agents SDK. Implemented a supervisor agent that dynamically routes user intent across six tools: failure prediction, simulation, recommendation proposals, complaint signal extraction, knowledge vault lookups, and database queries. Built a dedicated SQL sub-agent with read-only enforcement and schema/routing documentation injected via an `agent_wiki` directory at startup. Replaced the previous FAISS/RAG knowledge layer with an Obsidian wiki integration as the agent's second brain for domain knowledge lookups. Added an agent trace feature so the agent's internal reasoning steps are stored in the database and surfaced in the chat UI. Implemented session-level working memory so the agent retains context across conversation turns. Wrote unit tests to validate tool imports, complaint extraction, and proposal management.

---

### Sy Dam Viet Nguyen
**Role:** Frontend Engineer

Redesigned and rebuilt the dashboard interface to better reflect the current state of the system and improve the usefulness of information presented to users. Added fleet-level summary metrics, machine status cards with health/risk/uptime percentages, a Risk vs Health fleet posture scatter plot, and a weekly event breakdown chart. Collaborated on the TSGM synthetic data evaluation report.

---

### Nathan Wijaya
**Role:** Full-Stack / DevOps Engineer

Added automatic intent parsing and machine selection to the conversational interface with manual override support. Removed obsolete frontend mock-data components and performed regression testing. Containerised the frontend and integrated it into the shared Docker Compose setup. Added Vitest and Playwright testing libraries with comprehensive unit and end-to-end tests. Contributed to the MQTT ingestion framework and implemented configurable model input profiles and sensor-feature mapping.

---

### Alexander Rigato
**Role:** IoT / Backend Engineer

Planned and researched the gRPC sensor framework using ESPHome. Implemented an MQTT subscription-based assignment manager for live data ingestion. Built a prototype of frontend features for live data integration designed to work with the client's existing MQTT topics, built to be dynamic and support as many data streams as the client requires.

---

### Hoang Trang Anh Pham
**Role:** AI Engineer / Project Coordinator

Contributed to the tool-calling supervisor agent and agent trace implementation. Helped prepare sprint planning and Gantt charts. Contributed to the TSGM synthetic data report.

---

### Andy Truong
**Role:** ML Researcher / Project Manager

Conducted deep-dive analysis into the TSGM module evaluating LSTM training performance and synthetic dataset fidelity. Collaborated on the technical assessment report. Built and maintained sprint Gantt charts and monitored team progress throughout the final sprint.
