# SongNoi

Self-hosted form builder. Source of truth: `docs/project-brief.md` (Thai). Read it before
planning any feature. Never edit it; propose brief changes in your final summary instead.

## Commands

- `pnpm install` — install workspace deps
- `pnpm typecheck` — TypeScript across the monorepo
- `pnpm test` — all tests; one file: `pnpm vitest run <path>`
- `pnpm build` — production build

## Non-negotiable design rules (brief §2)

1. Schema is the hero: the Zod-validated Form Schema is the core; everything else reads or writes it.
2. Built-in fields use the public `defineField` API — no private shortcuts.
3. Self-host first: one `docker compose up`; data and files never leave the user's machine.
4. Admin (form creator) and respondent auth are separate worlds with separate permissions.
5. No in-house BI: stop at the 3 analytics layers, then hand off to external BI tools.
6. Small scope that actually works: reach usable before adding breadth.

## Workflow (Plan → Design → Build → Test → Review)

Every feature lives in `docs/work/<NNN-slug>/` and goes through these gates before code:

1. `/intent` → `intent.md` (problem, outcome, users, constraints)
2. `/spec` → `spec.md` (must state roadmap phase: MVP / Phase 2 / Phase 3)
3. `/impl-plan` → `plan.md` — wait for my approval before writing code
4. Build + test; if the implementation diverges, update `plan.md` in the same commit
5. Review with the `spec-reviewer` subagent against `REVIEW.md`; the author never self-approves

Small chores (deps, typos, config) may skip intent/spec but still need a clear commit.
Do not build features from a later roadmap phase than the spec states.

## Bugs

Commit a failing test that reproduces the bug first. Then fix it without editing that test.

## Conventions

- TypeScript `strict`; no `any` without a comment explaining why.
- Next.js App Router: Server Components by default; `"use client"` only when needed.
- English for code, comments, docs and commit messages. Conventional Commits.
- Path-scoped rules live in `.claude/rules/` (schema, db, ui).
