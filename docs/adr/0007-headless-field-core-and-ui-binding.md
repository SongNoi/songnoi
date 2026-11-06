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

1. **Core — `@songnoi/schema`.** `defineField({ ... })` with the members `type`, `config`,
   `answer`, `isUnanswered?`, `toCell`, `storedValues`, `analytics` and `incompatibleChanges?`.
   No React, no DOM. Returns a `FieldDefinition` whose config and answer types are inferred from
   Zod; every other member receives those inferred types (amended 2026-11-05):
   - `answer(config)` builds the answer schema from the parsed config; its output is the
     normalised answer that is stored.
   - `isUnanswered?(value, config)` adds field-specific "no answer" values to the package rule
     (absent key or `null`). The built-ins use it for blank text, an empty selection and an
     empty file list.
   - `toCell(answer, config, options?)` returns a string, is pure and never reads the
     environment. `options` is validated by the package and holds only an IANA `timeZone` in
     MVP.
   - `storedValues(answer, config)` returns zero or more values of the field's stored kind,
     one per future `Answer` row.
   - `analytics` holds data only: `storeAs` — one of `text`, `number`, `date` (calendar date),
     `datetime` (UTC instant) or `none`, either fixed or picked by the parsed config from kinds
     declared up front (`date` stores `date` or `datetime` depending on `includeTime`);
     `summarize` — a closed set `responses`, `counts`, `histogram+stats`, `distribution+avg`,
     `timeline`, `count`, `none`, shared by built-ins and plugins; `groupable` — a boolean.
     A definition is refused (`incompatible_analytics`) when `summarize` does not fit every kind
     it may store: `responses` and `counts` need `text`; `histogram+stats` and
     `distribution+avg` need `number`; `timeline` needs `date` or `datetime`; `count` needs any
     kind but `none`; `none` pairs only with `none`.
   - `incompatibleChanges?(previous, next)` receives an earlier and a new parsed config and
     names the config properties whose change makes answers under one `fieldId` incomparable
     (ADR 0009). Among the built-ins only `rating` declares one (`max`).
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
5. **Multi-value answers** (e.g. `checkbox`, `file`) produce one `Answer` row per stored value;
   `storeAs` describes one value. Stored values are what `storedValues` returns, so the
   "Other" free text of option fields stays only in `Response.answers` (`003` decides whether
   `Answer` needs a column for it).

## Consequences

- Server code (validation, CSV, `Answer` rows, webhooks) imports only `@songnoi/schema`.
- A field type is two small files instead of one; the type link between them keeps the
  "one complete lifecycle" promise of brief §5.
- Brief §5's example must be updated to show the two calls (brief gap 2 in ADR 0006), `toCell`
  receiving the config and options, and `rating` with `groupable: true` (spec `001` Flags 2, 5).
- The `datetime` kind means the `Answer` table needs a calendar-date column and a UTC-instant
  column. Proposed brief §6 change (owner to make; `003`/`005` build it): `valueDate` as a
  Postgres `date` plus a new `valueDateTime` as `timestamptz` (spec `001` Flag 3).
- Renaming or removing a field `type` is a breaking change to stored schemas; `type` strings
  are permanent once released. The same holds for config property names and answer shapes
  (ADR 0012).
- A plugin must keep the `storeAs` it gives for a config and its `incompatibleChanges` stable
  across releases; changing them can make an existing version history conflict (ADR 0009).

## Change log

- 2026-11-04 — first version (owner interview, ADR 0006).
- 2026-11-05 — `storeAs` gains `datetime` and may depend on config; `summarize` is a closed set
  that includes `none`, with a fit rule against `storeAs`; definitions gain `storedValues`, the
  `isUnanswered` hook and the optional `incompatibleChanges` rule; `toCell` receives the parsed
  config and validated options (owner decisions, spec `001` Flags 3, 7).
