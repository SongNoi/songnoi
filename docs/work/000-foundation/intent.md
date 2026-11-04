# 000 — Foundation: stack, standards and repo scaffold

## Problem

- The brief (§3, §4) says _which_ tools SongNoi uses but not _how_: no pinned runtime, no
  quality gates, no release process, no CI. Every feature built before this is settled would
  invent its own conventions.
- The repo has no `package.json`, no workspace, and no `LICENSE` file even though the brief
  chose MIT (without the file, the code is legally "all rights reserved").
- Default tool telemetry (Next.js, Prisma CLI) and runtime-loaded web fonts would send data off
  the user's machine, breaking "Self-host first" (brief §2).
- The admin/respondent auth split (brief §2, §7) has no concrete mechanism yet, so the first
  auth code could easily mix the two worlds.
- The project is open source and Thai-first in spirit, but nothing supports more than one
  language.

## Outcome

- An empty-but-green monorepo: `pnpm install && pnpm lint && pnpm typecheck && pnpm test &&
pnpm build` pass locally and in CI, and `docker compose up` boots web + Postgres + MinIO.
- Decisions recorded as ADRs in `docs/adr/`, day-to-day rules in `docs/standards.md`, versions
  pinned only in `package.json` / lockfile (never in the brief).
- Decided baseline:
  - Runtime: Node 24 LTS (`.nvmrc`, `engines`), pnpm pinned via `packageManager` + Corepack.
  - Monorepo: pnpm workspace + Turborepo; shared `tsconfig.base.json` (`strict`,
    `noUncheckedIndexedAccess`); ESM-only packages built with tsdown.
  - Quality: Prettier (+ Tailwind plugin), ESLint flat config, Vitest (unit + Postgres
    integration), Playwright (one golden-path E2E), commitlint + lefthook, GitHub Actions,
    Renovate, Changesets for `@songnoi/*` npm packages.
  - Code standards: Zod-validated env, one error contract for Server Actions and REST, pino
    JSON logs to stdout, `app/(admin)` and `app/(respond)` route groups.
  - Auth: two separate Better Auth instances (admin and respondent) with separate cookies,
    session tables and routes.
  - i18n: UI ships in `en` and `th`, default `en`, with `next-intl`. The respondent page uses
    the language chosen by the form owner, not the browser.
  - OSS hygiene: `LICENSE` (MIT), `README.md`, `CONTRIBUTING.md`, `SECURITY.md`,
    `CODE_OF_CONDUCT.md`, issue/PR templates, `.env.example`.
  - Privacy: `NEXT_TELEMETRY_DISABLED=1`, `CHECKPOINT_DISABLE=1`; Kanit via `next/font`
    (self-hosted at build time), no runtime CDN.

## Users

- **Contributors (incl. Claude)** — primary users of this work: one way to install, check,
  commit and release.
- **Self-hosters** — get a single `docker compose up` with no outbound telemetry.
- **Admins (form creators)** — see the UI in English or Thai.
- **Respondents** — see the form page's UI in the language the form owner chose; their session
  can never reach admin routes.

## Constraints

- Brief §2 rules apply: Schema is the hero, Self-host first, separate admin/respondent worlds,
  small scope. `docs/project-brief.md` is not edited.
- Scaffold only: no form features, no `defineField`, no Prisma models beyond what auth needs.
- No paid or hosted services in the default setup; CI must run with GitHub Actions alone.
- Every tool choice must work offline after install (self-host).

## Open questions

- **Translatable form content** (questions/options in several languages) was requested. It
  changes the Form Schema, so it does not belong in this scaffold. Proposal: keep it as its
  own work item, but `001` (`defineField` + schema) must design text fields as a
  `LocalizedText` type from day one so adding translations later is not a breaking schema
  change. The brief's roadmap does not list it yet — needs a brief update (owner's call) and a
  roadmap phase.
- When a form has several content languages, may the respondent switch between them, or is it
  locked to the owner's default? (Decide in the content-i18n spec.)
- Should Better Auth's two instances share one Postgres schema with prefixed tables, or use
  separate Postgres schemas? (Decide in the auth ADR.)
- Does Renovate (GitHub App) fit "no external services", or is Dependabot preferred since it is
  built into GitHub?
