# 000 — Foundation: implementation plan

Inputs: [spec.md](./spec.md), [intent.md](./intent.md), brief §2–§4, §7, §10.
Requirement numbers (R1–R35) refer to spec.md.

## Files to touch

### Root

| Path | Reason |
|---|---|
| `package.json` | Workspace root: `packageManager`, `engines` (Node 24), turbo-delegating scripts, `format:check` (R1–R3, R7) |
| `pnpm-workspace.yaml` | Declares `apps/*`, `packages/*` (R1) |
| `pnpm-lock.yaml` | Generated; the only place versions are pinned |
| `.nvmrc` | Node 24 (R2) |
| `turbo.json` | `lint`, `typecheck`, `test`, `test:integration`, `build` pipelines with cache (R3) |
| `tsconfig.base.json` | `strict`, `noUncheckedIndexedAccess`, ESM resolution (R4) |
| `.prettierrc` | Keep `printWidth: 100`, add Tailwind plugin (R7) |
| `.prettierignore` | Skip lockfile, build output, migrations |
| `eslint.config.mjs` | Root flat config composing `packages/config` presets (R8, R19) |
| `vitest.workspace.ts` | Unit + integration projects across packages (R9, R10) |
| `lefthook.yml` | `commit-msg` → commitlint, `pre-commit` → Prettier on staged files (R12) |
| `commitlint.config.mjs` | Conventional Commits preset (R12) |
| `docker-compose.yml` | `web`, `postgres`, `minio`, named volumes, healthchecks (R29) |
| `.env.example` | Every env var incl. both auth secrets and telemetry flags (R16, R30) |
| `.gitignore` | Add `coverage/`, `playwright-report/`, `test-results/` |
| `LICENSE`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` | OSS hygiene (R32) |
| `CLAUDE.md` | Add `pnpm lint`, `pnpm format:check`, `pnpm test:integration` to Commands (R35) |
| `.claude/settings.json` | Allow `pnpm format:check`, `pnpm test:integration` (keeps hooks/permissions in sync with new scripts) |

### `.github/`

| Path | Reason |
|---|---|
| `.github/workflows/ci.yml` | Every step of R13 with a Postgres service container; telemetry env (R30) |
| `.github/dependabot.yml` | npm, github-actions, docker; weekly, grouped (R14) |
| `.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, `config.yml` | R32 |
| `.github/pull_request_template.md` | Mirrors REVIEW.md passes (R32) |
| `.changeset/config.json`, `.changeset/README.md` | Changesets; ignore `@songnoi/web` (R15) |

### `packages/config`

| Path | Reason |
|---|---|
| `packages/config/package.json` | Private shared presets package |
| `packages/config/tsconfig/{library,nextjs}.json` | Extend base for libs and the Next app (R4) |
| `packages/config/eslint/{base,react,next}.mjs` | Type-aware TS, React Hooks, Next rules (R8) |

### `packages/schema` and `packages/renderer`

| Path | Reason |
|---|---|
| `packages/*/package.json` | `"type": "module"`, `exports`, `files`, tsdown build, no React in schema deps (R5, R6) |
| `packages/*/tsconfig.json` | Extends library preset |
| `packages/*/tsdown.config.ts` | ESM + `.d.ts` (R5) |
| `packages/*/src/index.ts` | Placeholder export (`VERSION`) so the build has an entry |
| `packages/*/test/dist.test.ts` | Imports the built `dist` entry (R5 proof) |
| `packages/schema/test/no-react.test.ts` | Asserts no `react` in deps/peerDeps (R6 proof) |

### `apps/web`

| Path | Reason |
|---|---|
| `apps/web/package.json` | `private: true`, scripts incl. `test:integration`, `e2e` (R15) |
| `apps/web/next.config.ts` | `output: "standalone"`, next-intl plugin (R24, R29) |
| `apps/web/tsconfig.json` | Next preset, `@/*` path alias to `src/*` |
| `apps/web/eslint.config.mjs` | `eslint-plugin-boundaries` element types + dependency rules for R19/R37; bare `"use server"` ban in `actions.ts` (R39) |
| `apps/web/postcss.config.mjs`, `src/app/globals.css` | Tailwind v4; Thai-friendly line-height (UI rules) |
| `apps/web/components.json` | shadcn/ui config (brief §3); no components added yet |
| `apps/web/src/env.ts` | Zod env schema, fails fast naming the variable (R16) |
| `apps/web/src/shared/kernel/app-error.ts` | `AppError`, error codes, `toAppError` (Zod → `VALIDATION_FAILED`, unknown → `INTERNAL`) (R17) |
| `apps/web/src/shared/kernel/result.ts` | `ActionResult<T>`, `ok()`, `fail()` (R17) |
| `apps/web/src/shared/action/define-action.ts` | `defineAction({ auth, input, handler })` (R39) |
| `apps/web/src/shared/infrastructure/logger.ts` | pino → stdout, level from env (R18) |
| `apps/web/src/shared/infrastructure/db.ts` | Prisma client singleton |
| `apps/web/src/shared/ui/.gitkeep` | shadcn target directory (R36) |
| `apps/web/src/composition.ts` | Wiring point for use cases; exports guards for now (R36, R40) |
| `apps/web/src/modules/auth/admin/instance.ts` | `adminAuth` instance (R21, R23) |
| `apps/web/src/modules/auth/admin/guard.ts` | `requireAdmin()` (R22) |
| `apps/web/src/modules/auth/respondent/instance.ts` | `respondentAuth` instance (R21, R23) |
| `apps/web/src/modules/auth/respondent/guard.ts` | `requireRespondent()` (R22) |
| `apps/web/src/app/api/auth/admin/[...all]/route.ts` | Mount admin handler (R21) |
| `apps/web/src/app/api/auth/respondent/[...all]/route.ts` | Mount respondent handler (R21) |
| `apps/web/src/app/api/health/route.ts` | DB ping → 200 / 503 (R20) |
| `apps/web/src/app/layout.tsx` | `<html lang>` from locale, Kanit via `next/font/google` (R28) |
| `apps/web/src/app/(admin)/layout.tsx`, `page.tsx` | Admin shell + language switcher (R25) |
| `apps/web/src/app/(admin)/locale-switcher.tsx` | Client component setting `songnoi_locale` cookie (R25) |
| `apps/web/src/app/(respond)/layout.tsx` | Respondent shell, no admin imports (R19) |
| `apps/web/src/i18n/config.ts` | `locales`, `defaultLocale` (R24) |
| `apps/web/src/i18n/request.ts` | next-intl `getRequestConfig`, cookie-based admin locale (R24, R25) |
| `apps/web/src/i18n/resolve-locale.ts` | `resolveRespondentLocale` (R26) |
| `apps/web/messages/en.json`, `th.json` | `common.*`, `admin.*`, `respond.*` namespaces (R24) |
| `apps/web/prisma/schema.prisma` | `Admin*` and `Respondent*` auth models only (R21) |
| `apps/web/prisma/migrations/0001_auth/` | First migration, generated (R13 migrate diff) |
| `apps/web/Dockerfile`, `docker-entrypoint.sh`, `.dockerignore` | Multi-stage standalone image, migrate then serve, telemetry off (R29, R30) |
| `apps/web/vitest.config.ts` | `unit` and `integration` projects |
| `apps/web/test/unit/{env,errors,resolve-locale,messages-parity}.test.ts` | R16, R17, R26, R27 |
| `apps/web/test/unit/architecture-lint.test.ts` | Runs ESLint Node API on fixtures to prove R19, R37 and the `"use server"` ban (R39) |
| `apps/web/test/fixtures/architecture/**` | One fixture per allowed/forbidden edge, mirroring `src/` paths (excluded from normal lint) |
| `apps/web/test/unit/route-allowlist.test.ts` | Globs `src/app/**/route.ts`, compares with the R38 allow-list |
| `apps/web/test/unit/define-action.test.ts` | Guard, validation, success and `INTERNAL` paths with mocked guards (R39) |
| `apps/web/test/unit/define-action.types.test-d.ts` | `@ts-expect-error` when `auth` is omitted (R39), run by Vitest typecheck |
| `apps/web/test/integration/{setup,health,auth-isolation}.test.ts` | R20, R21, R22 against real Postgres |
| `apps/web/playwright.config.ts`, `e2e/smoke.spec.ts` | R11, R25, R28, R31 |

### Docs

| Path | Reason |
|---|---|
| `docs/standards.md` | Day-to-day rules (R33) |
| `docs/adr/0001-monorepo-and-toolchain.md` | R34 |
| `docs/adr/0002-separate-auth-instances.md` | R34 |
| `docs/adr/0003-i18n.md` | R34 |
| `docs/adr/0004-esm-only-packages.md` | R34 |
| `docs/adr/0005-clean-architecture-and-server-actions.md` | R34, R36–R40 |
| `.claude/rules/architecture.md` | Path-scoped rule for `apps/web/src/**` summarising R36–R40 (R35) |

## Order

Each step is one Conventional Commit that leaves `pnpm` checks green.

1. **OSS files** — `LICENSE`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`,
   `CODE_OF_CONDUCT.md`. Ships the MIT licence immediately. (`docs:`)
2. **Workspace skeleton** — root `package.json`, `pnpm-workspace.yaml`, `.nvmrc`,
   `tsconfig.base.json`, `turbo.json`, `packages/config` (tsconfig presets only). `pnpm install`
   and `pnpm typecheck` pass on an empty workspace. (`chore:`)
3. **Library packages** — `packages/schema`, `packages/renderer` with tsdown, placeholder
   exports, Vitest workspace, `dist` and `no-react` tests. (`feat(schema)`, `feat(renderer)`)
4. **Lint + format** — ESLint presets, root config, Prettier plugin, `.prettierignore`,
   `format:check`. Fix anything they flag. (`chore:`)
5. **Commit hooks** — lefthook + commitlint; verify a bad message is rejected. (`chore:`)
6. **Next.js app shell** — `apps/web` with App Router, Tailwind v4, shadcn config, Kanit,
   `(admin)` / `(respond)` route groups, the `src/` layout from R36. (`feat(web)`)
7. **Architecture guardrails** — `eslint-plugin-boundaries` rules, fixtures and
   `architecture-lint.test.ts`; `route-allowlist.test.ts`. Written before any module code so
   every later step is checked. (`chore(web)`)
8. **Server foundations** — `env.ts`, `shared/kernel` (`AppError`, `ActionResult`),
   `shared/infrastructure/logger.ts`, with unit tests. (`feat(web)`)
9. **i18n** — next-intl config, messages, cookie locale, switcher, `resolveRespondentLocale`,
   parity test. (`feat(web)`)
10. **Database + health** — Prisma schema (auth models), first migration,
    `shared/infrastructure/db.ts`, `/api/health`, integration test project + health test.
    (`feat(web)`)
11. **Auth** — two Better Auth instances and guards in `modules/auth/*`, route handlers,
    auth-isolation integration test. (`feat(auth)`)
12. **`defineAction`** — wrapper using the guards from step 11, `composition.ts`, unit + type
    tests. The locale switcher (step 9) is migrated to a `public` action as the first real
    user of the wrapper. (`feat(web)`)
13. **Docker** — Dockerfile, entrypoint, `.dockerignore`, `docker-compose.yml`, `.env.example`;
    verify `docker compose up` + `curl /api/health`. (`feat(docker)`)
14. **E2E** — Playwright config + smoke test (locale switch, `<html lang>`, no third-party
    requests). (`test(web)`)
15. **CI + Dependabot + Changesets** — `ci.yml`, `dependabot.yml`, `.changeset/`, issue/PR
    templates. (`ci:`)
16. **Docs** — `docs/standards.md`, five ADRs, `.claude/rules/architecture.md`, `CLAUDE.md`
    commands, `.claude/settings.json` allow-list. (`docs:`)
17. **Review** — run `spec-reviewer` against spec.md + REVIEW.md; tick acceptance criteria.

## Risks

| Risk | Detection / mitigation |
|---|---|
| This container runs Node 22, the spec pins Node 24 | `engines` will warn locally; set `engine-strict=false` is **not** used. Install Node 24 via Corepack-compatible tarball or nvm in the container; CI uses `actions/setup-node` with `.nvmrc`. If Node 24 can't be installed here, run checks on 22 locally and rely on CI for 24, and say so in the summary. |
| Better Auth version doesn't support per-model `modelName` for all four tables, or two instances clash on shared Prisma adapter | Step 10 starts with the isolation test (written first). Fallback: separate Prisma clients per instance; record in ADR 0002 and update this plan. |
| next-intl "without i18n routing" + mixed admin/respondent locale sources gets awkward in `getRequestConfig` | Respondent pages wrap content in `NextIntlClientProvider` with an explicit locale; covered by the `resolve-locale` unit test and the Playwright smoke. |
| `next/font/google` needs network during `next build` (spec Flag 5) | Builds run with network in CI and Docker; documented in ADR 0003 / standards. |
| Type-aware ESLint is slow across the monorepo | Turborepo cache; `projectService` instead of listing tsconfigs. |
| Integration tests flaky because Postgres isn't ready | `setup.ts` waits on `pg_isready`-style retry; CI service uses `--health-cmd`. |
| Docker image too large or Prisma engine missing in standalone output | Multi-stage build copies `node_modules/.prisma` explicitly; step 11 verifies with a real `docker compose up`. |
| `prisma migrate diff` step fails because migration and schema drift | It is exactly what the check is for; migrations are generated, never hand-edited (protect-files hook). |
| `eslint-plugin-boundaries` mis-classifies Next route-group folders like `(admin)` or catch-all `[...all]` | Fixtures in step 7 cover those exact path shapes; if the plugin can't express a rule, fall back to `no-restricted-imports` for that edge and note it in ADR 0005. |
| Clean architecture grows boilerplate (repositories/use cases for trivial reads) | R40 CQRS-lite: reads go straight to Prisma in `queries.ts`; `spec-reviewer` flags pass-through use cases. |
| Server Actions are public POST endpoints; a missing guard leaks admin data | `defineAction` makes `auth` mandatory at the type level and lint bans bare `"use server"` exports (R39). |
| Scope creep into form features | Spec forbids `defineField` / form models; `spec-reviewer` checks R-list only. |
| Stop hook typecheck blocks mid-step | Each step ends green before moving on. |

## Proof

| Acceptance criterion | Proof |
|---|---|
| Clean clone: install, format:check, lint, typecheck, test, build exit 0 (R1–R9) | CI job `ci.yml` steps 1–6, and a local run recorded in the review summary |
| schema/renderer build to ESM + `.d.ts`, built entry importable (R5) | `packages/schema/test/dist.test.ts`, `packages/renderer/test/dist.test.ts` (run after `build` in turbo `test` dependsOn) |
| No `react` in schema deps/peerDeps (R6) | `packages/schema/test/no-react.test.ts` |
| `bad message` commit rejected (R12) | Manual check in step 5: `echo "bad message" \| pnpm commitlint` exits non-zero; also `commitlint` job in `ci.yml` on PR commits |
| CI runs every R13 step and passes (R13) | `.github/workflows/ci.yml` green on the PR |
| Dependabot covers npm, github-actions, docker (R14) | `.github/dependabot.yml` reviewed by `spec-reviewer` |
| `pnpm changeset status` works; `apps/web` private (R15) | Step 13 manual run + `ci.yml` runs `changeset status` |
| `env.ts` throws naming `DATABASE_URL` (R16) | `apps/web/test/unit/env.test.ts` |
| `ZodError` → `VALIDATION_FAILED`, unknown → `INTERNAL` without leak (R17) | `apps/web/test/unit/errors.test.ts` |
| `(respond)` importing `(admin)` is an ESLint error (R19) | `apps/web/test/unit/architecture-lint.test.ts` |
| Forbidden R37 edges are ESLint errors, allowed edge passes (R37) | `apps/web/test/unit/architecture-lint.test.ts` + `test/fixtures/architecture/**` |
| `route.ts` outside the allow-list fails (R38) | `apps/web/test/unit/route-allowlist.test.ts` |
| `defineAction` without `auth` does not compile (R39) | `apps/web/test/unit/define-action.types.test-d.ts` |
| `defineAction` guard / validation / success paths (R39) | `apps/web/test/unit/define-action.test.ts` |
| Bare `"use server"` in `actions.ts` is an ESLint error (R39) | `apps/web/test/unit/architecture-lint.test.ts` |
| `/api/health` 200 / 503 (R20) | `apps/web/test/integration/health.test.ts` |
| Cross-world sessions get 401, own guard 200 (R21–R22) | `apps/web/test/integration/auth-isolation.test.ts` |
| `resolveRespondentLocale` behaviour, `Accept-Language` ignored (R26) | `apps/web/test/unit/resolve-locale.test.ts` |
| `en.json` / `th.json` identical keys (R27) | `apps/web/test/unit/messages-parity.test.ts` |
| Smoke: `lang="en"`, cookie `th` → Thai + `lang="th"` (R11, R24, R25, R28) | `apps/web/e2e/smoke.spec.ts` |
| `docker compose up` → healthy, `/api/health` 200 (R29) | Step 11 manual run (output in review summary); `ci.yml` builds the image |
| Telemetry vars in Dockerfile, `.env.example`, CI (R30) | `ci.yml` step: `grep -q NEXT_TELEMETRY_DISABLED=1` and `CHECKPOINT_DISABLE=1` on all three files |
| No third-party origin requests at runtime (R31) | `apps/web/e2e/smoke.spec.ts` records `page.on("request")` and asserts same origin |
| R32–R35 files exist; LICENSE is MIT | `spec-reviewer` file check + `ci.yml` step `test -f` for each file and `grep -q "MIT License" LICENSE` |
