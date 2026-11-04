---
name: intent
description: Interview the user to capture a feature's intent as docs/work/<NNN-slug>/intent.md.
argument-hint: "[rough idea]"
disable-model-invocation: true
---

# Capture intent

Goal: write `docs/work/<NNN-slug>/intent.md` for the idea in `$ARGUMENTS`.

1. Read `docs/project-brief.md` so your questions are grounded in it.
2. Interview the user with multiple-choice questions (AskUserQuestion), a few at a time,
   until you can fill every section below. Offer a recommended option first. Ask about
   problem, desired outcome, users (admin vs respondent), constraints and roadmap fit.
3. Pick the next `NNN` by scanning `docs/work/` for the highest existing 3-digit prefix
   (start at `001`). Use a short kebab-case slug.
4. Write `intent.md` with exactly these sections, each a few bullets:
   `## Problem`, `## Outcome`, `## Users`, `## Constraints`, `## Open questions`.
5. Do not write a spec or code. Tell the user to run `/spec` next.
