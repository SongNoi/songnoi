# Engineering standards

Day-to-day rules for SongNoi. Principles live in [`constitution.md`](constitution.md);
decisions and their reasons in [`adr/`](adr/). Versions are pinned only in `package.json`
files and `pnpm-lock.yaml`.

## Setup

- Node 24 (`.nvmrc`), `corepack enable`, then `pnpm install` (also installs git hooks and
  generates the Prisma client).
- Local services: `docker compose up -d postgres`. Copy `.env.example` to `.env` at the repo
  root; docker compose, `pnpm dev` and the Prisma CLI all read it.
- The telemetry switches in `.env` only reach tools started through Next/Prisma. Turborepo
  reads the shell, so also `export TURBO_TELEMETRY_DISABLED=1` (or use direnv).

## Commands

| Command                                 | Use                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`                              | Run the app                                                               |
| `pnpm format` / `pnpm format:check`     | Prettier (100 columns, no semicolons, Tailwind class order)               |
| `pnpm lint`                             | ESLint: type-aware TypeScript, React Hooks, Next, architecture boundaries |
| `pnpm typecheck`                        | TypeScript in every package (also checks `*.test-d.ts` type tests)        |
| `pnpm test`                             | Unit tests, no database                                                   |
| `pnpm test:browser`                     | Shared unit tests of browser-safe packages in real Chromium (Playwright)  |
| `pnpm test:integration`                 | Integration tests against Postgres (`TEST_DATABASE_URL`)                  |
| `pnpm --filter @songnoi/web e2e`        | Playwright smoke tests against the standalone build                       |
| `pnpm --filter @songnoi/web db:migrate` | Create a migration in development                                         |
| `pnpm --filter @songnoi/web db:check`   | Fail if migrations and `schema.prisma` drift                              |
| `pnpm changeset`                        | Describe a change to a published package                                  |

## TypeScript

- `strict` and `noUncheckedIndexedAccess`. No `any`; when unavoidable, disable the rule on that
  line with a comment saying why.
- Zod first: define the schema, derive types with `z.infer`.
- `import type` for type-only imports (`verbatimModuleSyntax`).

## Architecture (ADR 0005)

- New feature code goes in `src/modules/<feature>/` with `domain`, `application`,
  `infrastructure`, `actions.ts`, `queries.ts`. Pages stay thin.
- Writes: Server Action via `defineAction` → use case → domain → repository port → Prisma
  adapter. Register the wiring in `composition.ts`.
- Reads: Server Component → `queries.ts` → Prisma.
- Expected failures: throw `AppException(code, message)`. Never return raw errors to clients.
- Route handlers only on the allow-list in `test/unit/route-allowlist.test.ts`.

## Errors and logging

- Error codes: `VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
  `INTERNAL` (HTTP 400/401/403/404/409/500 via `httpStatus`).
- Log with `getLogger()` (pino JSON to stdout). Never log secrets, passwords or response
  content.

## Environment

- Every variable is declared in `src/env.ts` (Zod) and listed in `.env.example`.
- Read env with `getEnv()`, never `process.env` in app code. The server validates it at start.

## Database (`.claude/rules/db.md`)

- `Response` references `FormVersion`; published versions are immutable; write `Response` and
  its `Answer` rows in one transaction. Never edit an applied migration.

## UI and i18n (ADR 0003, `.claude/rules/ui.md`)

- Server Components by default; `"use client"` as low as possible.
- No hard-coded user-facing text: add the key to both `messages/en.json` and
  `messages/th.json`.
- Check Thai rendering (line breaks, vowels/tone marks, line height) and Nielsen's heuristics.

## Testing

- Every acceptance criterion maps to a test or check (see each work item's `plan.md`).
- Unit tests in `test/unit`, integration in `test/integration` (real Postgres), E2E in `e2e/`.
- Bugs: commit a failing test first, then fix without editing it.
- Browser parity (packages that run in the browser, e.g. `@songnoi/schema`): shared tests run in
  both Node (`pnpm test`) and Chromium (`pnpm test:browser`). Node-only tests live in `test/node`,
  Chromium-only tests in `test/browser`. Set `PLAYWRIGHT_CHROMIUM_PATH` to a Chromium binary if
  Playwright's own Chromium is not installed. Browser tests that load `dist` need `pnpm build`
  first.

## Commits and releases

- Conventional Commits (`feat`, `fix`, `docs`, `chore`, `test`, `ci`, …), enforced by
  commitlint via lefthook and in CI. English only.
- Changes to `@songnoi/schema` or `@songnoi/renderer` need a changeset.

## Self-host and privacy (constitution §3)

- No third-party runtime requests; a Playwright test fails on any.
- Telemetry off: `NEXT_TELEMETRY_DISABLED=1`, `CHECKPOINT_DISABLE=1`,
  `TURBO_TELEMETRY_DISABLED=1`; Better Auth `telemetry.enabled: false`.
- Fonts and assets are bundled; the build needs no CDN.
