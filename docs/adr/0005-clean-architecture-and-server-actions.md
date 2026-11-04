# ADR 0005 — Clean architecture and Server Actions

Status: Accepted · Date: 2026-11-04 · Work item: `000-foundation`

## Context

The owner chose clean architecture with Server Actions for mutations, except for file upload
and download. Brief §2 also asks for a small scope that actually works, so the architecture
must stay light enough not to drown features in boilerplate.

## Decision

**Layout** of `apps/web/src`:

```
app/                presentation only: routes and UI
modules/<feature>/  domain/ · application/ · infrastructure/ · actions.ts · queries.ts
shared/             kernel/ (AppError, ActionResult) · action/ (defineAction) ·
                    infrastructure/ (db, logger, health) · ui/ (shadcn)
composition.ts      wires use cases to adapters (plain functions, no DI container)
env.ts · i18n/ · instrumentation.ts
```

`@songnoi/schema` is the innermost domain core, shared by every module.

**Dependency rule** — arrows point inward, enforced by `eslint-plugin-boundaries`
(`apps/web/eslint/architecture.mjs`, proven by fixture tests):

- `domain` → own domain, `shared/kernel`, `zod`, `@songnoi/schema` only.
- `application` → own application/domain, any module's `application` (cross-module use goes
  through use cases, never another module's domain or infrastructure), `shared/kernel`, `zod`,
  `@songnoi/schema`.
- `infrastructure` → own module layers, `shared/infrastructure`, `shared/kernel`, npm.
- `actions.ts` → own application/domain, any module's `application`, `shared/action`,
  `shared/kernel`, `composition.ts`, `i18n`. **No infrastructure**: writes go through use cases.
- `queries.ts` → the same plus `shared/infrastructure`, because reads may use Prisma directly.
- `app/(admin)` and `app/(respond)` → `actions.ts`, `queries.ts`, their own auth world,
  `shared/ui`, `i18n`, `shared/kernel` — never a module's internals, never each other.
- No module imports another module's `domain` or `infrastructure`.

**Mutations** use Server Actions created with `defineAction({ auth, input, handler })`:
`auth` (`"admin" | "respondent" | "public"`) is required at the type level; the wrapper runs
the guard, validates input with Zod and always returns `ActionResult`, while letting Next.js
`redirect()` / `notFound()` propagate. Lint rejects every other way to create an endpoint:
`"use server"` at file level outside `actions.ts`, inline `"use server"` anywhere, and in
`actions.ts` any export that is not `export const x = defineAction(...)` — including
`export { x }`, `export { x } from` and `export *`.

**Reads** happen in Server Components through `queries.ts` (CQRS-lite): no use case or
repository just to pass a read through.

**Route handlers** exist only on an allow-list checked by a test: `api/auth/admin/[...all]`,
`api/auth/respondent/[...all]`, `api/health`, `api/files/**` (streamed through the app, no
presigned URLs, so object storage is never exposed), `api/forms/[formId]/export` (CSV),
`api/v1/**` (external REST API / embed, brief §8).

## Consequences

- Adding a route handler or a new layer edge is a deliberate change to this ADR, the
  allow-list test or the boundaries config.
- Layers live in `apps/web`, not a `packages/core`, so brief §4 is unchanged; extracting them
  later is cheap because outward imports are already impossible.
- Single-file units (`actions.ts`, `queries.ts`, `composition.ts`, `env.ts`) are classified
  with `boundaries/files` descriptors because element `mode: "file"` is deprecated.
