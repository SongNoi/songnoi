# ADR 0007 — Headless field core and UI binding

Status: Accepted · Date: 2026-11-04 · Work items: `001-field-core`, `002-renderer`

## Context

Brief §5 describes a field as one `defineField` call holding config, answer validation,
export, analytics **and** React components (`Render`, `Settings`, `Chart`). But
`@songnoi/schema` must not depend on React (`000` spec requirement 6, `.claude/rules/schema.md`),
and the server must validate answers, build CSV and fill the `Answer` table without loading UI
code. Brief §2 also requires built-in fields to use the same public API as third-party ones.

## Decision

Split a field into two public, typed halves:

1. **Core — `@songnoi/schema`.** `defineField({ type, config, answer, toCell, analytics })`
   where `analytics` holds data-only parts: `storeAs` (`"text" | "number" | "date" | "none"`),
   `summarize`, `groupable`. No React, no DOM. Returns a `FieldDefinition` whose config and
   answer types are inferred from Zod.
2. **UI binding — `@songnoi/renderer`.** `defineFieldUI(fieldDefinition, { Render, Settings,
Chart })`. Component props are typed from the core's inferred config and answer types, so a
   binding cannot drift from its core.
3. **Registries are public.** `createFieldRegistry([...cores])` in schema and
   `createFieldUIRegistry([...bindings])` in renderer. Built-ins are passed in exactly like a
   plugin; there is no private registration path. A test registers a fixture third-party field
   through the same calls to prove it.
4. **File layout for built-ins:** `packages/schema/src/fields/<type>.ts` and
   `packages/renderer/src/fields/<type>.tsx`, same `<type>` name. A third-party plugin may keep
   both halves in one file in its own package, since it can depend on both.
5. **Multi-value answers** (e.g. `checkbox`) produce one `Answer` row per value; `storeAs`
   describes one value.

## Consequences

- Server code (validation, CSV, `Answer` rows, webhooks) imports only `@songnoi/schema`.
- A field type is two small files instead of one; the type link between them keeps the
  "one complete lifecycle" promise of brief §5.
- Brief §5's example must be updated to show the two calls (brief gap 2 in ADR 0006).
- Renaming or removing a field `type` is a breaking change to stored schemas; `type` strings
  are permanent once released.
