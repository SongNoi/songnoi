---
name: impl-plan
description: Write plan.md from an approved docs/work/<NNN-slug>/spec.md, then stop for approval.
argument-hint: "<NNN-slug>"
disable-model-invocation: true
---

# Write implementation plan

Input: `docs/work/$ARGUMENTS/spec.md` (if no argument, use the newest folder in `docs/work/`).
Read it, its `intent.md`, the brief and the relevant code. Write `plan.md` next to it:

- `## Files to touch` — path + one-line reason each.
- `## Order` — numbered steps, smallest shippable increments first.
- `## Risks` — what could break, and how you'll detect or limit it.
- `## Proof` — for every acceptance criterion in spec.md: the test file or check that proves it.

Then STOP. Do not write code until the user approves the plan.

During implementation, if the work diverges from plan.md, update plan.md in the same commit
as the diverging change.
