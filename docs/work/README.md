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

## Roles (subagents)

Each SDLC step is done by a role subagent in `.claude/agents/`. The main session orchestrates:
it talks to the owner, asks for approvals, runs the gates and commits. Roles never commit, and
the author role never reviews its own work.

| Role         | Agent                  | Steps                                  | Can write                         |
| ------------ | ---------------------- | -------------------------------------- | --------------------------------- |
| Planning     | `planner`              | `/intent` (draft), `/tasks`            | `docs/work/**`                    |
| Requirements | `requirements-analyst` | `/spec`, `/clarify`, `/checklist`      | `docs/work/**`                    |
| Design       | `solution-architect`   | `/impl-plan`, ADR drafts               | `docs/work/**`, `docs/adr/**`     |
| Development  | `developer`            | `/implement` (production code)         | code, `tasks.md`, `plan.md`       |
| Testing      | `test-engineer`        | `/implement` (tests first), proof runs | test files, fixtures, test config |
| Consistency  | `artifact-analyzer`    | `/analyze`                             | nothing                           |
| Convergence  | `convergence-auditor`  | `/converge`                            | nothing (caller appends)          |
| Review       | `spec-reviewer`        | `/review`                              | nothing                           |

Write scopes are enforced by `.claude/hooks/scoped-write-guard.mjs`; read-only agents' shell
use by `.claude/hooks/readonly-bash-guard.mjs`.

## Subagent model and effort

Each agent declares a default `model` and `effort` in its frontmatter, sized for a typical
feature. The skill that calls it picks the column below for each run and states the choice and
the reason in its reply.

| Agent                  | Default         | Escalate to   | Light work      | Why this default                                            |
| ---------------------- | --------------- | ------------- | --------------- | ----------------------------------------------------------- |
| `planner`              | sonnet · medium | sonnet · high | sonnet · low    | Structured slicing and task lists; little ambiguity         |
| `requirements-analyst` | opus · high     | opus · xhigh  | sonnet · medium | Ambiguity, edge cases and two-world thinking need judgement |
| `solution-architect`   | opus · high     | opus · xhigh  | sonnet · medium | Hard-to-reverse decisions: schema, layers, data, auth       |
| `developer`            | sonnet · high   | opus · high   | sonnet · medium | Well-specified tasks with tests to steer                    |
| `test-engineer`        | sonnet · high   | opus · high   | sonnet · medium | Finding the failing case matters more than prose            |
| `artifact-analyzer`    | sonnet · medium | opus · high   | sonnet · low    | Bounded document cross-check                                |
| `convergence-auditor`  | sonnet · high   | opus · high   | sonnet · medium | Traces code against artifacts, runs suites                  |
| `spec-reviewer`        | opus · high     | opus · xhigh  | sonnet · medium | Final independent gate, security judgement                  |

**Escalate** when the work touches any high-risk area:

- auth or permissions (`modules/auth`, `defineAction`, guards, access modes);
- the Form Schema or `defineField` (`packages/schema`);
- Prisma schema/migrations or the `Response` + `Answer` transaction;
- file upload/download or any route handler;
- a large feature: more than 20 requirements or more than 40 tasks;
- a previous run of the same agent missed something or produced CRITICAL/HIGH findings.

**Light work** applies to docs-only, config-only or chore changes with no runtime code.

Rules:

- The owner's explicit request always wins (e.g. "use opus at max effort for the review").
- `max` effort is used only when the owner asks for it.
- When in doubt, keep the default; never go below the default for a high-risk area.
- In `/implement`, each phase may use a different column: e.g. a Foundational phase that
  touches migrations escalates, a Polish phase that only edits docs goes light.
