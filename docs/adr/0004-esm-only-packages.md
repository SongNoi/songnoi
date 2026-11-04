# ADR 0004 — ESM-only published packages

Status: Accepted · Date: 2026-11-04 · Work item: `000-foundation`

## Context

`@songnoi/schema` and `@songnoi/renderer` will be published to npm (brief §4, §8) so others
can write field plugins and embed forms. Dual ESM/CommonJS builds double the surface to test
and cause dual-package hazards (two copies of Zod schemas, failed `instanceof` checks).

## Decision

- Both packages are `"type": "module"`, ESM only, with an `exports` map exposing
  `types` + `import`, built by tsdown with `.d.ts` output.
- `@songnoi/schema` has no React dependency or peer dependency (enforced by a test).
- `@songnoi/renderer` declares React as a peer dependency.
- Releases are managed with Changesets; `apps/web` is private and never published.

## Consequences

- Consumers need an ESM-capable toolchain — every supported Node version and bundler is.
- Tests import each package through its built `exports` map, so a broken publish shape fails
  CI.
