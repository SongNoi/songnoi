---
name: implement
description: Execute docs/work/<NNN-slug>/tasks.md phase by phase, test-first, keeping artifacts in sync.
argument-hint: "<NNN-slug> [scope, e.g. 'Setup and Foundational only']"
disable-model-invocation: true
---

# Implement tasks

Input: `docs/work/<NNN-slug>/tasks.md` (first word of `$ARGUMENTS`; default: newest folder).
The rest of `$ARGUMENTS` optionally limits scope to some phases or user stories.

## Gates (before writing code)

1. The user approved `plan.md`, and the last `/analyze` had no CRITICAL/HIGH findings. If not,
   stop and say which gate is missing.
2. Read every file in `checklists/`. Count `[ ]` vs `[x]` per file and show the table. If any
   item is unchecked, ask the user whether to proceed. **Never change checklist markers.**

## Execution

3. Read `spec.md`, `plan.md`, `tasks.md`, `docs/constitution.md` and the `.claude/rules/` that
   match the files you will touch.
4. Work phase by phase in order, with two role subagents per phase (`docs/work/README.md`,
   "Roles"); pick each one's `model`/`effort` for that phase from "Subagent model and effort"
   and say which and why:
   - `test-engineer` writes the phase's test tasks first and confirms they fail for the right
     reason;
   - `developer` implements the phase's tasks until those tests pass, runs `pnpm lint`,
     `pnpm typecheck` and the relevant tests, and ticks the tasks in `tasks.md`;
   - `[P]` tasks touching different files may go to parallel `developer` runs.
     Verify the result yourself (run the checks) before moving to the next phase.
5. Commit at least once per phase (Conventional Commits). If the work diverges from
   `plan.md` or `tasks.md`, update them **in the same commit**.
6. Stop at the end of the requested scope or on a failure you cannot fix; report what is done,
   what failed (with output) and what remains.
7. When all tasks are done, suggest `/converge`.
