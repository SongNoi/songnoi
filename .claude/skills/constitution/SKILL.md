---
name: constitution
description: Create or amend docs/constitution.md, the principles every SDLC gate is checked against, and sync dependent skills, agents and docs.
argument-hint: "[principles to add or change]"
disable-model-invocation: true
---

# Constitution

Input: `$ARGUMENTS` (principles to add, change or remove). With no argument, re-derive the
constitution from the brief and ADRs and report drift.

1. Read `docs/constitution.md`, `docs/project-brief.md` (§2, §6, §10, §11), `docs/adr/*.md`,
   `CLAUDE.md`, `REVIEW.md` and `.claude/rules/*.md`.
2. Draft the change. Every principle is MUST or SHOULD, is testable at a gate, and cites its
   source (brief section or ADR). Never edit `docs/project-brief.md`: if a product principle
   (section I) needs to change, stop and tell the user the brief must change first.
3. Bump the version (MAJOR: removed/redefined principle, MINOR: added, PATCH: wording) and set
   "Last amended" to today.
4. Write a **Sync impact report** at the end of your reply: version change, principles
   changed, and every file that must change to stay consistent (skills in `.claude/skills/`,
   agents in `.claude/agents/`, `REVIEW.md`, `CLAUDE.md`, `.claude/rules/`). Apply those edits
   in the same commit.
5. Commit as `docs(constitution): <summary>`.
