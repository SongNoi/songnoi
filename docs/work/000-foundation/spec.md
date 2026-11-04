# 000 — Foundation: spec

Source: [intent.md](./intent.md). Brief references: §2 (design rules), §3 (stack), §4 (repo
layout), §7 (auth), §10 (roadmap).

## How does the form schema change?

**No change.** This work creates `packages/schema` as an empty, buildable package only. No form
types, no `defineField`. Translatable form content is out of scope (see Flags); `001` owns the
schema design.

## Requirements

### Repo and toolchain

1. The repo is a pnpm workspace with `apps/web`, `packages/schema`, `packages/renderer` and a
   shared `packages/config` (tsconfig, ESLint, Prettier presets), matching brief §4.
   `registry/` is not created (Phase 3).
2. Node is pinned to 24 LTS via `.nvmrc` and root `engines`; pnpm is pinned via the
   `packageManager` field so Corepack enforces it.
3. Turborepo runs `lint`, `typecheck`, `test`, `build` across the workspace with caching; root
   scripts `pnpm lint|typecheck|test|build` delegate to it.
4. All packages extend one `tsconfig.base.json` with `strict` and `noUncheckedIndexedAccess`.
5. `packages/schema` and `packages/renderer` are ESM-only, built with tsdown, emit `.d.ts`, and
   declare `"type": "module"` plus an `exports` map.
6. `packages/schema` has no runtime dependency on React (brief §2, `.claude/rules/schema.md`).

### Quality gates

7. Formatting: Prettier with `printWidth: 100` and `prettier-plugin-tailwindcss`;
   `pnpm format:check` fails on unformatted files.
8. Linting: ESLint flat config with `typescript-eslint` (type-aware), React Hooks and Next.js
   rules; `pnpm lint` fails on any error.
9. Unit tests: Vitest workspace runs every package's tests from `pnpm test`.
10. Integration tests: a Vitest project tagged `integration` runs against a real Postgres
    (Docker locally, a service container in CI).
11. E2E: Playwright with one smoke test (home page renders in `en` and in `th`). The golden
    path test (build → publish → answer → CSV) is added by the MVP features, not here.
12. Commits: lefthook runs commitlint (Conventional Commits) on `commit-msg` and Prettier on
    staged files on `pre-commit`.
13. CI (GitHub Actions, on PR and push to `main`): install with frozen lockfile → format check
    → lint → typecheck → unit test → integration test → build → `prisma migrate diff`
    (schema vs migrations must match) → Docker image build → Playwright smoke.
14. Dependency updates: Dependabot (built into GitHub, no third-party app), weekly, grouped by
    ecosystem (npm, GitHub Actions, Docker).
15. Releases: Changesets manages versions and changelogs for `@songnoi/schema` and
    `@songnoi/renderer`; `apps/web` is private and never published.

### Code standards

16. Env: `apps/web/src/env.ts` validates `process.env` with Zod at startup; a missing or
    invalid variable stops the server with a message naming the variable. `.env.example`
    lists every variable.
17. Errors: one `AppError` shape `{ code, message, details? }` used by Server Actions and REST
    route handlers; a helper converts thrown `ZodError` into `code: "VALIDATION_FAILED"`.
18. Logging: pino writing JSON to stdout; no remote transport; log level from env.
19. Routes: `app/(admin)/…` and `app/(respond)/…` route groups; nothing under `(respond)`
    imports from `(admin)` (enforced by an ESLint `no-restricted-imports` rule).
20. Health: `GET /api/health` returns `200 {"status":"ok"}` when Postgres is reachable and
    `503` otherwise; Docker Compose uses it as the web healthcheck.

### Auth (brief §2, §7)

21. Two Better Auth instances, `adminAuth` and `respondentAuth`, each with its own `basePath`
    (`/api/auth/admin`, `/api/auth/respondent`), its own cookie prefix (`songnoi_admin`,
    `songnoi_respondent`), its own secret env var, and its own Prisma tables
    (`AdminUser/AdminSession/AdminAccount/AdminVerification` and the `Respondent*`
    equivalents) in the same Postgres database.
22. Guards `requireAdmin()` and `requireRespondent()` read only their own instance's session.
    A request carrying only a respondent session gets `401` from any admin guard, and the
    reverse.
23. Only email + password is enabled for admins in this scaffold; no sign-in UI beyond what the
    smoke test needs. Respondent auth is configured but has no UI (access modes come in MVP
    feature work).

### i18n

24. `next-intl` (without locale URL prefixes) with message files `messages/en.json` and
    `messages/th.json`; supported locales `["en", "th"]`, default `en`.
25. Admin locale: from the `songnoi_locale` cookie, falling back to `en`. A language switcher
    in the admin layout sets the cookie.
26. Respondent locale: resolved by `resolveRespondentLocale(formLocale)` which returns the
    form owner's locale if supported, else `en`. The browser's `Accept-Language` is ignored.
    Until forms exist, the function is unit-tested only.
27. A test fails if `en.json` and `th.json` do not have exactly the same keys.
28. `<html lang>` matches the active locale; Kanit is loaded with `next/font/google` (fetched
    at build time, served from the app) with the `thai` and `latin` subsets.

### Self-host and privacy (brief §2)

29. `docker compose up` starts `web`, `postgres` and `minio`; web waits for a healthy Postgres,
    applies migrations, then serves on port 3000. Data lives in named volumes.
30. `NEXT_TELEMETRY_DISABLED=1` and `CHECKPOINT_DISABLE=1` are set in the Dockerfile,
    `.env.example` and CI.
31. The built app makes no request to a third-party origin at runtime (no font CDN, analytics
    or error-reporting SaaS).

### Docs and OSS hygiene

32. Root files: `LICENSE` (MIT, holder "SongNoi contributors"), `README.md` (first line per
    brief §0), `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant
    2.1), `.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`.
33. `docs/standards.md` describes the day-to-day rules in requirements 7–20 and 24–28.
34. ADRs in `docs/adr/` (format: Context / Decision / Consequences): `0001` monorepo and
    toolchain, `0002` separate auth instances, `0003` i18n approach, `0004` ESM-only packages.
35. `CLAUDE.md` commands list gains `pnpm lint` and `pnpm format:check`.

## Design

```
songnoi/
├─ apps/web/                      Next.js App Router (brief §3)
│  ├─ src/app/(admin)/            admin pages, guarded by requireAdmin()
│  ├─ src/app/(respond)/          respondent pages, guarded per access mode
│  ├─ src/app/api/auth/admin/[...all]/route.ts       → adminAuth.handler
│  ├─ src/app/api/auth/respondent/[...all]/route.ts  → respondentAuth.handler
│  ├─ src/app/api/health/route.ts
│  ├─ src/server/{auth,db,env,errors,logger}.ts
│  ├─ src/i18n/{config,request,resolve-locale}.ts
│  ├─ messages/{en,th}.json
│  └─ prisma/schema.prisma        auth tables only
├─ packages/schema/               empty ESM package (brief §4)
├─ packages/renderer/             empty ESM package, React peer dep
├─ packages/config/               tsconfig / eslint / prettier presets
├─ docs/adr/, docs/standards.md
├─ docker-compose.yml, apps/web/Dockerfile
└─ .github/workflows/ci.yml, .github/dependabot.yml, .changeset/
```

**Auth flow.** Each instance is a separate `betterAuth({...})` call sharing one Prisma client
but mapping to its own tables via `modelName`. Separate cookie prefixes mean the browser
sends both cookies, but each instance only parses its own; separate secrets mean a cookie
forged for one cannot be verified by the other. Guards live in `src/server/auth.ts`; pages
never call `auth.api.getSession` directly.

**i18n flow.** `src/i18n/request.ts` (next-intl `getRequestConfig`) picks the locale: for
admin requests from the cookie; for respondent pages the page passes the form's locale through
`resolveRespondentLocale`. Messages are namespaced by area (`admin.*`, `respond.*`,
`common.*`).

**Docker.** Multi-stage Dockerfile using Next's `output: "standalone"`; entrypoint runs
`prisma migrate deploy` then `node server.js`. MinIO is started but unused until file-upload
work.

**API surface added:** `GET /api/health`, `/api/auth/admin/*`, `/api/auth/respondent/*`.

## Roadmap phase

**MVP** — it delivers MVP item 4 (one-command Docker Compose) and is the base every other MVP
item builds on.

## Acceptance criteria

- [ ] `pnpm install --frozen-lockfile` then `pnpm format:check`, `pnpm lint`,
      `pnpm typecheck`, `pnpm test`, `pnpm build` all exit 0 on a clean clone. (R1–R9)
- [ ] `packages/schema` and `packages/renderer` build to ESM with `.d.ts`; a test imports each
      built entry point. (R5)
- [ ] `packages/schema/package.json` has no `react` in `dependencies` or `peerDependencies`.
      (R6)
- [ ] A commit with message `bad message` is rejected by lefthook/commitlint. (R12)
- [ ] CI workflow runs every step in R13 and passes on the PR. (R13)
- [ ] `.github/dependabot.yml` covers npm, github-actions and docker. (R14)
- [ ] `pnpm changeset status` works and `apps/web` is `private: true`. (R15)
- [ ] Unit test: `env.ts` throws naming the variable when `DATABASE_URL` is missing. (R16)
- [ ] Unit test: a `ZodError` becomes `AppError` with `code: "VALIDATION_FAILED"`. (R17)
- [ ] Lint test: importing `(admin)` code from a `(respond)` file is an ESLint error. (R19)
- [ ] Integration test: `/api/health` is 200 with Postgres up and 503 with a bad
      `DATABASE_URL`. (R20)
- [ ] Integration test: an admin session cookie gets 401 from `requireRespondent()`, a
      respondent session cookie gets 401 from `requireAdmin()`, and each gets 200 from its
      own guard. (R21–R22)
- [ ] Unit test: `resolveRespondentLocale("th") === "th"`, unsupported/undefined → `"en"`, and
      `Accept-Language` has no effect. (R26)
- [ ] Unit test: `en.json` and `th.json` have identical key sets. (R27)
- [ ] Playwright smoke: home page renders with `<html lang="en">`; after setting the locale
      cookie to `th` it renders Thai text with `<html lang="th">`. (R11, R24, R25, R28)
- [ ] `docker compose up` on a clean machine reaches a healthy `web` service and
      `curl localhost:3000/api/health` returns 200. (R29)
- [ ] `grep` shows both telemetry variables in Dockerfile, `.env.example` and CI. (R30)
- [ ] Playwright smoke records all network requests and asserts none go to an origin other
      than the app's. (R31)
- [ ] All files in R32–R35 exist; `LICENSE` is MIT. (R32–R35)

## Flags

1. **Translatable form content is not in the brief's roadmap.** The owner wants form content
   (questions, options) in several languages. That changes the Form Schema, so it is out of
   scope here. Proposed brief change (owner to make): add "Multilingual form content" to §10,
   suggested **Phase 2**, and add "UI available in English and Thai" to MVP. Constraint
   carried into `001`: user-facing text in the schema is modelled as a `LocalizedText` type
   from the start so translations can be added without a breaking change.
2. **Respondent language switching** (when a form has several content languages) is deferred
   to the multilingual-content spec. This spec only handles the single owner-chosen locale.
3. **Resolved — auth table layout:** one Postgres database, prefixed Prisma models
   (`Admin*`, `Respondent*`). Separate Postgres schemas were rejected: extra Prisma
   `multiSchema` complexity for no added isolation, since separate cookies + secrets + guards
   already enforce the split.
4. **Resolved — Dependabot instead of Renovate** (intent listed Renovate): Dependabot is built
   into GitHub and needs no third-party app, which fits "Self-host first" better.
5. **`next/font/google` downloads Kanit at build time.** Runtime is fully offline, but an
   offline *build* will fail. Acceptable for MVP; if offline builds become a need, switch to
   bundling the font files (`next/font/local`).
6. No BI creep and no custom condition language. Nothing else conflicts with brief §2 or §11.
