---
name: tasks
description: Break an approved docs/work/<NNN-slug>/plan.md into a dependency-ordered tasks.md.
argument-hint: "<NNN-slug>"
disable-model-invocation: true
---

# Generate tasks

Input: `docs/work/<NNN-slug>/` (default: newest folder). Requires `spec.md` and `plan.md`.

1. Read `spec.md` (user stories, requirements, acceptance criteria), `plan.md` (files, design,
   order, proof) and `docs/constitution.md`.
2. Write `tasks.md` with these phases, in order:
   - `## Phase 1 — Setup` (dependencies, config, scaffolding)
   - `## Phase 2 — Foundational` (blocking prerequisites: schema, migrations, ports, guards)
   - `## Phase 3+ — <User story title> (P<n>)` — one phase per user story, highest priority
     first; each phase ends in an independently testable increment
   - `## Phase N — Polish` (docs, ADR updates, i18n strings, cleanup)
3. Task format: `- [ ] T001 [P] [US1] <imperative description> — \`path/to/file\``
   - `T###` sequential IDs; `[P]` only if it touches different files and depends on no
     unfinished task; `[US<n>]` only inside a user-story phase.
   - Test tasks come **before** the implementation tasks they prove, inside the same phase,
     and name the acceptance criterion: `(proves AC: <criterion>)`.
   - Every acceptance criterion in `spec.md` is covered by at least one task.
4. End with `## Dependencies` (phase order + notable cross-task edges) and
   `## Parallel opportunities`.
5. Report task counts per phase and any requirement with no task. Next step: `/analyze`.
