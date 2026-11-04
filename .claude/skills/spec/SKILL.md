---
name: spec
description: Turn docs/work/<NNN-slug>/intent.md into spec.md (the what and why) plus the built-in requirements checklist.
argument-hint: "<NNN-slug>"
disable-model-invocation: true
---

# Write spec

Input: `docs/work/$ARGUMENTS/intent.md` (if no argument, use the newest folder in `docs/work/`).
Read it, `docs/project-brief.md` and `docs/constitution.md`, then write `spec.md` next to it.

The spec says **what** and **why**, not how: no file paths, libraries or code structure — those
belong in `plan.md`. Sections, in order:

1. `## How does the form schema change?` — always first. Say "No change" explicitly if so.
2. `## User stories` — `### US<n> — <title> (P<n>)`, priority P1 highest. Each: who (admin or
   respondent), want, so that; plus an "Independent test" line saying how this story alone can
   be demonstrated. `/tasks` builds one phase per story.
3. `## Requirements` — numbered, testable statements (`R1`, `R2`, …), each tagged with the
   stories it serves.
4. `## Edge cases` — empty, failure, permission, i18n (en/th) and limit cases.
5. `## Roadmap phase` — exactly one of MVP / Phase 2 / Phase 3, with a one-line reason.
6. `## Acceptance criteria` — `- [ ]` checklist items, each provable by a test or a check,
   each citing the requirement(s) it proves.
7. `## Flags` — anything that conflicts with the brief or `docs/constitution.md`, or that pulls
   in BI features (pivot tables, custom formulas, drag-drop dashboards). Write "None" if clean.

Mark anything you cannot decide from intent.md as `[NEEDS CLARIFICATION: <question>]` (at most
three) instead of guessing.

Then write the built-in spec-quality checklist `checklists/requirements.md`: items like
`- [x] No implementation details in the spec`, `- [ ] All [NEEDS CLARIFICATION] resolved`,
`- [x] Every acceptance criterion is testable`, `- [x] Roadmap phase stated`, ticked according
to your own evaluation (this one checklist is author-owned; `/clarify` re-evaluates it).

Do not plan or write code. Next step: `/clarify` if there are open markers or real ambiguity,
otherwise ask the user to approve the spec and run `/impl-plan`.
