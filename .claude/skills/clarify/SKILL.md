---
name: clarify
description: Ask up to five targeted questions about underspecified parts of docs/work/<NNN-slug>/spec.md and write the answers back into the spec.
argument-hint: "<NNN-slug> [focus area]"
disable-model-invocation: true
---

# Clarify the spec

Delegate the writing to the `requirements-analyst` subagent (Planning/Requirements/Design/… roles in
`docs/work/README.md`). Choose its `model` and `effort` from "Subagent model and effort" there
(default, escalate for high-risk areas, or light work), pass them to the Agent tool, and say
which you chose and why; an explicit owner request overrides it. You keep the conversation
with the owner, approvals and commits.

Input: `docs/work/<NNN-slug>/spec.md` (first word of `$ARGUMENTS`; default: newest folder in
`docs/work/`). The rest of `$ARGUMENTS` is an optional focus area.

1. Read the spec, its `intent.md`, `docs/constitution.md` and the brief.
2. Scan for ambiguity in this order, skipping what is already clear: schema impact, users and
   permissions (admin vs respondent), data lifecycle and edge cases, failure and empty states,
   i18n (en/th), self-host constraints, roadmap phase, acceptance criteria that cannot be
   tested.
3. Ask **at most five** questions with AskUserQuestion, highest impact first. Each question is
   multiple choice with the recommended option first and a one-line trade-off per option.
4. Write each answer into the section it affects (not a Q&A dump) and log it under
   `## Clarifications` → `### Session <YYYY-MM-DD>` as `- Q: … → A: …`.
5. If `checklists/requirements.md` exists, re-evaluate its items. Never touch custom
   checklists.
6. Report what changed and what is still open. Suggest `/clarify` again for another area, or
   `/impl-plan` when the spec is clear.
