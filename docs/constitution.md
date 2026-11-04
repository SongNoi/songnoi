# SongNoi Constitution

Version: 1.0.0 · Ratified: 2026-11-04 · Last amended: 2026-11-04

The constitution is the checklist every SDLC gate is evaluated against (`/spec`, `/impl-plan`,
`/analyze`, `/converge`, `spec-reviewer`). It **derives from** `docs/project-brief.md`, which
stays the source of truth: if they ever disagree, the brief wins and this file is amended with
`/constitution`. Engineering principles cite the ADR that decided them.

Each principle is **MUST** (a violation blocks the gate) or **SHOULD** (a violation needs a
written justification in the plan's Constitution check).

## I. Product principles (brief §2)

1. **Schema is the hero — MUST.** The Zod-validated Form Schema in `@songnoi/schema` is the
   core. Every other part reads or writes it. Types derive from Zod (`z.infer`), never by hand.
2. **Dogfood the plugin API — MUST.** Built-in fields use the public `defineField`, exactly as
   a third-party plugin would. No private registry hooks or special-cased field types.
3. **Self-host first — MUST.** One `docker compose up` gives a complete system. Data, files
   and telemetry never leave the user's machine (no third-party runtime requests, no tool
   telemetry, no font/asset CDN at runtime).
4. **Two separate worlds — MUST.** Admin (form creator) and respondent auth are separate:
   separate Better Auth instances, cookies, sessions, routes and guards (ADR 0002).
5. **No in-house BI — MUST.** Stop at the three analytics layers (brief §9); no pivot tables,
   custom formulas or drag-drop dashboards. Hand off to external BI tools.
6. **No custom condition language — MUST.** Conditional logic uses JSON Logic.
7. **Small scope that actually works — MUST.** Reach usable before adding breadth. Never build
   from a later roadmap phase than the spec states (brief §10).
8. **Response integrity — MUST.** `Response` references `FormVersion`; published versions are
   immutable; `Response` + `Answer` are written in one transaction; applied migrations are
   never edited (brief §6).

## II. Engineering principles

9. **Clean architecture — MUST** (ADR 0005). `apps/web/src/modules/<feature>/` has `domain`,
   `application`, `infrastructure`, `actions.ts`, `queries.ts`; dependencies point inward only
   and are enforced by `eslint-plugin-boundaries`. Keep it light: no DI container, no
   pass-through use cases for plain reads (CQRS-lite).
10. **Server Actions for mutations — MUST** (ADR 0005). Every action is built with
    `defineAction` and declares `auth`. Route handlers exist only on the allow-listed paths
    (auth, health, file upload/download, CSV export, external REST API / embed).
11. **Test first where it proves something — MUST.** Every acceptance criterion maps to a test
    or a runnable check. Bugs start with a failing test that the fix does not edit. Domain and
    schema code is unit-tested; DB behaviour is integration-tested against real Postgres.
12. **Type safety — MUST.** TypeScript `strict` + `noUncheckedIndexedAccess`; no `any` without
    a comment explaining why.
13. **Multilingual by default — MUST** (ADR 0003). No hard-coded user-facing strings: UI text
    lives in `messages/{en,th}.json` with identical keys. Thai renders correctly (line
    breaking, vowel/tone marks, line height).
14. **Server Components by default — SHOULD.** `"use client"` only for state, effects, browser
    APIs or handlers, as low in the tree as possible.
15. **Accessible and usable UI — SHOULD.** Check UI changes against Nielsen's 10 heuristics
    and WCAG 2.1 AA; list violations with a fix.

## III. Process principles

16. **Spec-driven — MUST.** Features go through the SDLC in `docs/work/README.md`; code starts
    only after the owner approves the plan and `/analyze` is clean.
17. **Independent review — MUST.** The author never self-approves: `spec-reviewer` reviews,
    reviewer-owned checklists are ticked only by a reviewer.
18. **Artifacts stay true — MUST.** If the build diverges, update `plan.md` / `tasks.md` in the
    same commit. English for code, docs and commits; Conventional Commits.

## Governance

- Amend only through `/constitution`, which bumps the version (MAJOR: a principle removed or
  redefined; MINOR: a principle added; PATCH: wording) and lists every skill, agent, template
  or doc that must change to stay in sync.
- A change to a product principle (section I) needs a matching change in the brief first; the
  owner makes it, Claude never edits the brief.
