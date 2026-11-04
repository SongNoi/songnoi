---
paths:
  - "apps/web/src/**"
---

# Architecture rules (ADR 0005)

- Feature code lives in `src/modules/<feature>/{domain,application,infrastructure}` plus
  `actions.ts` and `queries.ts`. `src/app/` holds routes and UI only.
- Dependencies point inward; `pnpm lint` (eslint-plugin-boundaries) enforces it. If lint
  blocks an import, fix the design — do not add an exception without updating ADR 0005.
- `domain` imports only its own module's domain, `shared/kernel`, `zod` and `@songnoi/schema`.
  `application` may also use another module's `application` (cross-module use goes through
  use cases). Neither may import Prisma, Next, React, or another module's domain/infrastructure.
- `actions.ts` writes through use cases only (no infrastructure); `queries.ts` may read Prisma.
- Mutations: export Server Actions from `actions.ts` as
  `export const x = defineAction({ auth, input, handler })`. Always choose `auth`
  deliberately; `"public"` only when no user data is touched.
- `"use server"` is allowed only as the first line of `src/modules/*/actions.ts` — nowhere else
  in the repo, and never inline in a function. Lint enforces this.
- Reads: Server Components call `queries.ts`; never use a Server Action to read.
- Route handlers only on the allow-list in `test/unit/route-allowlist.test.ts`.
- Expected failures throw `AppException`; never return raw errors or stack traces.
- Wire new use cases in `src/composition.ts` with plain functions (no DI container).
- Read env with `getEnv()`; add new variables to `src/env.ts` and `.env.example`.
