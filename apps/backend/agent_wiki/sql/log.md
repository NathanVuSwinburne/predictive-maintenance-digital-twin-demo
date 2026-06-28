---
wiki: sql-agent
type: log
---

# SQL Agent Wiki Log

Append-only record of wiki changes and notable query sessions.

## [2026-06-01] init | SQL agent wiki created

Initial pages:
- index.md — quick-rules and catalog
- schema-reference.md — all tables and columns with descriptions
- machine-routing.md — telemetry table routing + relationship map + person-to-machine join patterns
- query-patterns.md — worked examples for common query shapes
- gotchas.md — known failure modes (wrong timestamp column, person name column, join rules)

Breaking changes encoded:
- Machine B machine_type changed from `sensor` → `synthetic`
- Machine C `kaggle` alias removed; canonical type is `real-sensor`
