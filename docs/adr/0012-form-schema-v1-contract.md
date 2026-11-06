# ADR 0012 — Form Schema v1 contract: format version, errors, text, time, IDs

Status: Accepted ·
Date: 2026-11-05 · Work item: `001-field-core` (read by `002`–`009`)

## Context

Work item `001` creates the first stored Form Schema. Once a form is published, its format, its
answer shapes and the errors it reports are hard to change: published versions are immutable
(ADR 0009) and the schema contract freezes early (ADR 0006 Consequences). Earlier ADRs do not say
how the format evolves, how errors reach two UI languages, how text length is counted the same
way on server and browser, how dates survive time zones, how IDs are generated, or how Zod is
shared with plugins. The owner settled the behaviour in spec `001` (R4, R7, R10, R15, R16, R18,
R20); this ADR records the technical choices behind it.

## Decision

1. **Format version, migrated on read.** Every stored Form Schema carries the literal
   `schemaVersion: 1`. `parseFormSchema(input, registry)` is the only way to read one: it checks
   the version first (`unsupported_schema_version`), runs ordered migration steps up to the
   current version, then validates. Stored `Form.draftSchema` and `FormVersion.schema` values are
   never rewritten; they are migrated in memory each time they are read. Any change to the stored
   format — a built-in field's config or answer shape, or multi-language text (ADR 0003) — bumps
   the literal and adds one migration step. Parsed schemas have every config default written in,
   so a later change of a default never changes what a stored version means.
2. **Errors are data.** Every failure is `{ code, params, path }` from one closed catalogue
   (spec `001` R4), defined as a Zod discriminated union whose inferred type is the public
   `Issue`. The package has no message text; the renderer (`002`) and the respond flow (`005`)
   map codes to `messages/{en,th}.json`. Zod issues from any definition, built-in or plugin, are
   translated into catalogue codes; plugins raise a specific code with `customIssue`; anything
   else becomes `invalid`. Adding a code is a deliberate change to the catalogue and both message
   files.
3. **Text length is counted in extended grapheme clusters** (Unicode UAX #29) with the platform's
   `Intl.Segmenter` and an explicit locale — no bundled Unicode data and no runtime dependency
   besides Zod. `countGraphemes` is public so the renderer's character counter uses the same rule.
   Parity is proven by running the package's unit tests in Node and in Chromium (Vitest browser
   mode with the Playwright provider); a simulated DOM in Node does not count. If engines ever
   disagree, only `countGraphemes` changes (e.g. to a vendored segmenter).
4. **Dates and time zones.** A calendar date (`YYYY-MM-DD`) is never converted. A date-time must
   carry `Z` or `±HH:MM` and is stored as the UTC instant `YYYY-MM-DDTHH:mm:ss.sssZ`; the
   original offset is dropped. Cells in a zone use an IANA zone passed by the caller and validated
   once (`parseCellOptions`), formatted with `Intl.DateTimeFormat`. The package never reads the
   process time zone, the default locale or environment variables.
5. **IDs.** `generateId()` returns 12 base64url characters from `crypto.getRandomValues` (Web
   Crypto in Node and browsers): 72 random bits. One function serves `fieldId`s and option IDs.
   The ID rule (`^[A-Za-z0-9_-]{1,64}$`) is public as the Zod schema `idSchema`, the only place
   the pattern is defined: the Form Schema checks `fieldId`s with it and the built-in option
   fields check option IDs with it through the public API. Reserved IDs (`__proto__`,
   `constructor`, `prototype`, `other`) have other lengths, so they can never be generated.
6. **Zod is a peer dependency** of `@songnoi/schema` (`^4.6.0`, Zod 4 only), not a bundled
   dependency, so the app, the package and every plugin share one Zod copy and one set of
   inferred types. This extends ADR 0004's dual-package concern. Zod remains the package's only
   runtime dependency.

## Consequences

- Stored property names, answer shapes, `type` strings and the error catalogue are a public
  contract from the first stored form; the npm release in `009` publishes it. The package
  exports a minimal surface, pinned by a test, so internals stay free to change.
- Multi-language forms, new built-in config options and any other format change cost a
  migration step, never a data rewrite.
- `pnpm test:browser` needs a Chromium binary; CI installs it before the unit tests.
  Firefox and Safari use their own Unicode and time-zone data and are not proven (residual risk,
  spec `001` Flag 8).
- The respondent's original UTC offset is not kept; displays use the viewer's zone (`002`,
  `008`) or the zone `007` chooses for CSV.
- Language tags are canonicalised by `Intl.getCanonicalLocales`, which fixes case and also
  replaces deprecated aliases (e.g. `iw` → `he`).

## Change log

- 2026-11-05 — first version (`001-field-core` `/impl-plan`).
- 2026-11-05 — accepted: owner approved `001-field-core/plan.md`.
- 2026-11-05 — `/analyze` revision: the ID rule is public as `idSchema` (decision 5; finding
  F09).
