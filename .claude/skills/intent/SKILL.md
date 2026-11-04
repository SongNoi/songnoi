---
name: intent
description: Interview the user to capture a feature's intent as docs/work/<NNN-slug>/intent.md.
argument-hint: "[rough idea]"
disable-model-invocation: true
---

# Capture intent

Delegate the writing to the `planner` subagent (Planning/Requirements/Design/… roles in
`docs/work/README.md`). Choose its `model` and `effort` from "Subagent model and effort" there
(default, escalate for high-risk areas, or light work), pass them to the Agent tool, and say
which you chose and why; an explicit owner request overrides it. You keep the conversation
with the owner, approvals and commits.

Goal: write `docs/work/<NNN-slug>/intent.md` for the idea in `$ARGUMENTS`.

1. Read `docs/project-brief.md` and `docs/constitution.md` so your questions are grounded in them.
2. Interview the user with multiple-choice questions (AskUserQuestion), a few at a time,
   until you can fill every section below. Offer a recommended option first. Ask about
   problem, desired outcome, users (admin vs respondent), constraints and roadmap fit.
3. Pick the next `NNN` by scanning `docs/work/` for the highest existing 3-digit prefix
   (start at `001`). Use a short kebab-case slug.
4. Hand the interview notes to `planner`, which checks roadmap fit, proposes a split if the
   idea is too big, and writes `intent.md` with exactly these sections, each a few bullets:
   `## Problem`, `## Outcome`, `## Users`, `## Constraints`, `## Open questions`.
5. Do not write a spec or code. Tell the user to run `/spec` next.
