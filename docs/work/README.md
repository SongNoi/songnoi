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

## Subagent model and effort

Each subagent has a default `model` and `effort` in its frontmatter, sized for a typical
feature. The skill that calls it (`/analyze`, `/converge`, `/review`) picks an override per run
from the table below and states the choice and the reason in its reply.

| Agent                 | Default         | Escalate to  | Light work      |
| --------------------- | --------------- | ------------ | --------------- |
| `artifact-analyzer`   | sonnet · medium | opus · high  | sonnet · low    |
| `convergence-auditor` | sonnet · high   | opus · high  | sonnet · medium |
| `spec-reviewer`       | opus · high     | opus · xhigh | sonnet · medium |

**Escalate** when the work touches any high-risk area:

- auth or permissions (`modules/auth`, `defineAction`, guards, access modes);
- the Form Schema or `defineField` (`packages/schema`);
- Prisma schema/migrations or the `Response` + `Answer` transaction;
- file upload/download or any route handler;
- a large feature: more than 20 requirements or more than 40 tasks.

**Light work** applies to docs-only, config-only or chore changes with no runtime code.

Rules:

- The user's explicit request always wins (e.g. "review with opus at max effort").
- `max` effort is used only when the user asks for it.
- When in doubt, keep the default; never go below it for a high-risk area.

Subagents in `.claude/agents/`: `artifact-analyzer` (read-only, no shell), `convergence-auditor`
and `spec-reviewer` (read-only; shell limited to git reads and tests by
`.claude/hooks/readonly-bash-guard.mjs`).
