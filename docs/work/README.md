# docs/work — spec-driven SDLC

SongNoi follows a spec-driven development (SDD) process adapted from GitHub
[spec-kit's agentic SDD](https://github.github.com/spec-kit/reference/agentic-sdd.html). Every
feature gets a folder `NNN-slug/` (e.g. `001-define-field`), and every gate is checked against
[`docs/constitution.md`](../constitution.md).

```text
/constitution (once, then on change)

/intent → /spec → /clarify → /impl-plan → /checklist → /tasks → /analyze → /implement → /converge → /review
           what     resolve     how ⏸         req.        break    consist.   build        gaps        independent
           & why    ambiguity   approval      quality     down     check      test-first   append-only  verdict
```

| Step            | Writes                                  | Role                                                                                              | Required?      |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------- |
| `/constitution` | `docs/constitution.md`                  | Principles every gate checks; syncs dependent files                                               | Once           |
| `/intent`       | `intent.md`                             | Interview: problem, outcome, users, constraints                                                   | Yes            |
| `/spec`         | `spec.md`, `checklists/requirements.md` | What and why: schema impact, user stories (P1…), requirements, acceptance criteria, roadmap phase | Yes            |
| `/clarify`      | `spec.md` (`## Clarifications`)         | ≤ 5 targeted questions, answers written back into the spec                                        | When ambiguous |
| `/impl-plan`    | `plan.md`                               | How: constitution check, design, files, order, risks, proof. **Stops for owner approval.**        | Yes            |
| `/checklist`    | `checklists/<focus>.md`                 | "Unit tests for requirements"; reviewer-owned, never self-ticked                                  | Optional       |
| `/tasks`        | `tasks.md`                              | Setup → Foundational → one phase per story → Polish; `[P]` parallel markers; tests first          | Yes            |
| `/analyze`      | — (report)                              | Read-only consistency check by `artifact-analyzer`; fix issues at the owning step                 | Yes            |
| `/implement`    | code, `tasks.md` ticks                  | Checklist gate, then task by task, test-first; keep plan/tasks in sync                            | Yes            |
| `/converge`     | appends to `tasks.md` only              | `convergence-auditor` checks code vs artifacts; loop with `/implement` until converged            | Yes            |
| `/review`       | — (verdict)                             | `spec-reviewer` against `REVIEW.md` + constitution; the author never self-approves                | Yes            |

Rules:

- No code before the owner approves `plan.md` **and** `/analyze` has no CRITICAL/HIGH findings.
- When `/analyze` finds a problem, fix it in the step that owns it (`/spec`, `/clarify`,
  `/impl-plan`, `/tasks`), then re-run `/analyze`.
- Small chores (deps, typos, config) may skip straight to a commit.
- `000-foundation` predates this process: it has no `tasks.md` and follows its `plan.md` Order.

Subagents in `.claude/agents/`: `artifact-analyzer` (read-only, no shell), `convergence-auditor`
and `spec-reviewer` (read-only; shell limited to git reads and tests by
`.claude/hooks/readonly-bash-guard.mjs`).
