# AGENTS.md

## Purpose

This repository is maintained for Codex-first workflows. Use the local context files and the external Obsidian vault to minimize token use while keeping project memory current.

## Instruction Precedence

1. `AGENTS.md`
2. `CONTEXT-map.md`
3. The nearest relevant module `CONTEXT.md` files
4. Code and tests
5. Targeted Obsidian notes

## Required Workflow

1. Read `AGENTS.md` first.
2. Open only the smallest set of files needed for the task.
3. Verify current behavior in code instead of assuming context files are fully current.
4. Before finishing any non-trivial task, update relevant docs if behavior, interfaces, or architecture intent changed.

## Context Usage Rules

- Prefer context-first navigation, then verify in code as needed.
- Treat code as the source of truth for actual behavior.

## Final Summary Rule

In the task summary, mention which files were consulted and which were updated.
