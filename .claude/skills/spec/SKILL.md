---
name: spec
description: Turn docs/work/<NNN-slug>/intent.md into spec.md in the same folder.
argument-hint: "<NNN-slug>"
disable-model-invocation: true
---

# Write spec

Input: `docs/work/$ARGUMENTS/intent.md` (if no argument, use the newest folder in `docs/work/`).
Read it and `docs/project-brief.md`, then write `spec.md` next to it with these sections:

1. `## How does the form schema change?` — always first. Say "No change" explicitly if so.
2. `## Requirements` — numbered, testable statements.
3. `## Design` — data flow, components, API surface. Reference brief sections.
4. `## Roadmap phase` — exactly one of MVP / Phase 2 / Phase 3, with a one-line reason.
5. `## Acceptance criteria` — `- [ ]` checklist items, each provable by a test or a check.
6. `## Flags` — anything that conflicts with the brief's design rules or non-goals, or that
   pulls in BI features (pivot tables, custom formulas, drag-drop dashboards). Write "None" if
   clean.

Resolve open questions from intent.md or list them under Flags. Do not plan or write code.
Ask the user to approve the spec, then run `/impl-plan`.
