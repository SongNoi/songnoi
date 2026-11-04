---
name: converge
description: After /implement, check the code against spec, plan and tasks; append any remaining work to tasks.md (append-only).
argument-hint: "<NNN-slug>"
disable-model-invocation: true
---

# Converge

Input: `docs/work/<NNN-slug>/` (default: newest folder). Run only after `/implement` has run on
the current `tasks.md`.

1. Delegate to the `convergence-auditor` subagent with the folder path. It is read-only and
   returns severity-graded findings plus proposed tasks.
2. Print its findings summary.
3. Resolve to exactly one outcome:
   - **Converged** — no findings that need work. Leave `tasks.md` byte-for-byte unchanged and
     print `✅ Converged — the implementation satisfies the spec, plan and tasks.` Next step:
     `/review`.
   - **Tasks appended** — append a `## Convergence <n>` section to the end of `tasks.md` with
     the proposed tasks, continuing the `T###` numbering. Say how many were added and suggest
     `/implement` then `/converge` again.
4. This skill never edits or deletes code and never changes existing lines of `tasks.md`; its
   only write is the appended section.
