# ADR 0001 — Monorepo and toolchain

Status: Accepted · Date: 2026-11-04 · Work item: `000-foundation`

## Context

Brief §3–§4 fix the stack (Next.js, Prisma, Zod, Better Auth, shadcn/ui) and the repo layout
(`packages/schema`, `packages/renderer`, `apps/web`) but not the tooling around them. Without
one toolchain every feature would invent its own conventions, and contributors (human or AI)
would get different results on different machines.

## Decision

- **Runtime:** Node 24 LTS, pinned in `.nvmrc` and `engines`, enforced by `engine-strict`.
- **Package manager:** pnpm, pinned through `packageManager` and Corepack; workspace in
  `pnpm-workspace.yaml`. Install scripts are opt-in (`onlyBuiltDependencies`).
- **Task runner:** Turborepo for `build`, `lint`, `typecheck`, `test`, `test:integration`.
- **TypeScript:** one base config in `@songnoi/config/tsconfig/base.json` (`strict`,
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), with `library` and `nextjs` presets.
- **Quality gates:** Prettier (+ Tailwind plugin), ESLint flat config with type-aware
  `typescript-eslint`, Vitest (unit + integration projects), Playwright smoke tests,
  commitlint + lefthook, GitHub Actions, Dependabot, Changesets.
- **Versions** are pinned only in `package.json` files and the lockfile, never in the brief.

## Consequences

- One command set works everywhere: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm test:integration`, `pnpm build`.
- Turborepo phones home by default; `TURBO_TELEMETRY_DISABLED=1` is set in `.env.example`
  and CI alongside Next.js and Prisma's switches (constitution §3).
- The shared tsconfig lives in `@songnoi/config` rather than the repo root, because presets
  resolved through `node_modules` symlinks cannot reach a root file by relative path.
