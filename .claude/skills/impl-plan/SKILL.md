---
name: impl-plan
description: Write plan.md (the how) from an approved docs/work/<NNN-slug>/spec.md, then stop for approval.
argument-hint: "<NNN-slug> [tech notes]"
disable-model-invocation: true
---

# Write implementation plan

Delegate the writing to the `solution-architect` subagent (Planning/Requirements/Design/… roles in
`docs/work/README.md`). Choose its `model` and `effort` from "Subagent model and effort" there
(default, escalate for high-risk areas, or light work), pass them to the Agent tool, and say
which you chose and why; an explicit owner request overrides it. You keep the conversation
with the owner, approvals and commits.

Input: `docs/work/<NNN-slug>/spec.md` (first word of `$ARGUMENTS`; default: newest folder in
`docs/work/`). The rest of `$ARGUMENTS` are optional technical notes from the user.

Refuse to plan while the spec still has `[NEEDS CLARIFICATION]` markers; suggest `/clarify`.

Read the spec, its `intent.md`, the brief, `docs/constitution.md`, `docs/standards.md`, the ADRs
and the relevant code. Write `plan.md` next to it:

- `## Constitution check` — one line per relevant MUST principle: ✅ or ❌ + why. Any ❌ must be
  fixed or justified under Complexity tracking; SHOULD violations need a justification.
- `## Design` — data flow, module layout (`domain` / `application` / `infrastructure` /
  `actions.ts` / `queries.ts`), Prisma changes, Server Actions and any allow-listed route
  handlers, i18n keys. Reference brief sections and ADRs.
- `## Files to touch` — path + one-line reason each.
- `## Order` — numbered steps, smallest shippable increments first.
- `## Risks` — what could break, and how you'll detect or limit it.
- `## Proof` — for every acceptance criterion in spec.md: the test file or check that proves it.
- `## Complexity tracking` — only if a principle is bent: what, why, simpler alternative
  rejected because.

If the design needs a decision that is hard to reverse, draft an ADR in `docs/adr/`.

Then STOP. Do not write code until the user approves the plan. After approval the flow is
`/checklist` (optional) → `/tasks` → `/analyze` → `/implement`.

During implementation, if the work diverges from plan.md, update plan.md in the same commit
as the diverging change.
