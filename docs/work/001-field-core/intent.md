# 001 — Field core: Form Schema, `defineField` and the 9 built-in fields

Roadmap: brief §10 MVP item 1, ADR 0006 milestone M1 (`v0.1.0-alpha.1`), first item after
`000-foundation`. Nothing from 002+ is in scope.

## Problem

- `@songnoi/schema` is an empty placeholder (`VERSION = "0.0.0"`). There is no Form Schema, no
  `defineField`, no field registry, so every later layer (renderer, Builder, respond, export,
  analytics) has nothing stable to read or write. The brief calls the schema "the hero" (§2).
- The server must validate answers, build CSV cells and fill `Answer` rows without loading any
  UI code (ADR 0007). That contract does not exist yet, and a mistake in it surfaces late in a
  layer-by-layer plan (ADR 0006 Consequences).
- Edits after publish need field identity to survive across versions (ADR 0009), and the
  "schema refuses a type change under the same `fieldId`" rule has no code behind it.
- Several shape decisions are still open in the artifacts and would otherwise be improvised
  during `/spec` or `/implement`: language of form text, validation depth, "Other" options,
  date/time-zone handling, what a `file` answer holds, and how the stored format evolves.

## Outcome

- A tested, React-free `@songnoi/schema` that exposes:
  - the Zod-first **Form Schema**: form meta (including the form's single language), ordered
    fields with stable `fieldId`, label, help text and `required`, and a literal
    `schemaVersion: 1` with an explicit migrate step for future format changes;
  - headless **`defineField`** (`type`, `config`, `answer`, `toCell`, `analytics`) with config
    and answer types inferred by `z.infer`, and a public **`createFieldRegistry`**;
  - the **9 built-in fields** (text, textarea, number, choice, checkbox, dropdown, date, rating,
    file), each created through the public API;
  - **whole-response validation**: one call checks an answer set against a form schema and
    returns per-`fieldId` machine-readable errors, which the server later uses on its own;
  - **`toCell`** per field and **`storeAs` / `summarize` / `groupable`** per field, as data only;
  - the **versioning rules** of ADR 0009: stable random URL-safe `fieldId` and choice option IDs,
    and a check that rejects the same `fieldId` with a different `type` across versions.
- Decisions from the owner interview (2026-11-04), recorded here so `/spec` does not re-open them:
  1. **One language per form.** Labels, help and option text are plain strings. Form meta records
     the language (e.g. `"th"` / `"en"`). Multi-language forms are out of scope and would be a
     later schema migration. This replaces the `LocalizedText` proposal in
     `000-foundation/intent.md` Open questions.
  2. **Essential validation only, per field:**
     - all fields: `required`;
     - text / textarea: min and max length;
     - number: min, max, integer;
     - checkbox: min and max selections;
     - file: max size, allowed types, max files;
     - rating: max.
       No regex, email/URL formats or custom rules in MVP.
  3. **"Other: \_\_\_" option** in choice, checkbox and dropdown, as a config flag, off by default.
     The answer becomes option ID(s) plus optional other text, so `toCell`, `storeAs` and
     `summarize` must handle it (e.g. counted as one "other" bucket in summaries, the text kept
     for export). One `Answer` row per value (ADR 0007 point 5).
  4. **`schemaVersion: 1`** is a literal in every stored Form Schema.
  5. **`date`** is a date with optional time (config flag, e.g. `includeTime`). The answer is ISO
     `YYYY-MM-DD`, or a date-time when `includeTime` is on.
     - **Date-time is stored in UTC and shown in the viewer's time zone** (owner, 2026-11-04).
       The client converts the respondent's local input to an instant; the answer schema
       accepts only ISO 8601 with an explicit offset or `Z` and normalises it to UTC (`...Z`).
       The respondent's original offset is not kept.
     - **Date-only answers are never converted**: `2026-11-04` stays that date in every zone.
     - `storeAs` therefore distinguishes `"date"` (calendar date) from `"datetime"` (UTC
       instant). Proposed for 003/005: `Answer.valueDate` as Postgres `date` and a new
       `Answer.valueDateTime` as `timestamptz` (brief §6 change for the owner to make).
     - Display rules belong to later items: renderer/admin UI use the viewer's browser zone
       (002, 008); CSV has no viewer, so 007 must choose a zone (open question 1).
  6. **`file`** has `maxFiles` (default 1). The answer is a list of file IDs (references only;
     upload and storage are item 006), one `Answer` row per file, like checkbox.
- Exit check (ADR 0006): unit and type tests pass; a built-in and a fixture third-party field
  register through the same public calls; the package builds with no React in its dependencies.

## Users

- **Developers (primary)**: the owner now, plugin authors later. They consume the package and
  need a small, typed, documented API where built-ins have no privileges.
- **Admins (indirect)**: the Builder (004) and `Settings` panels (002) are generated from this
  contract, so what an admin can configure is what the config schemas allow.
- **Respondents (indirect)**: the renderer (002) and respond flow (005) depend on this package
  for what a valid answer is. The server validates answers with this package alone, so it
  must not trust client-side checks.
- No UI, route or auth surface in this item, so the two-world rule (brief §2) is not exercised.

## Constraints

- Brief §2 rules apply; `docs/project-brief.md` is not edited. Brief §5 (8 fields, single
  `defineField` with React) is stale against ADR 0007 and 0011; the owner's amendment is still
  pending, and ADR 0011 stays "Proposed" until then.
- Already decided by ADRs, restated and not re-opened:
  - headless `defineField`, no React dependency, `import type` only (ADR 0007,
    `.claude/rules/schema.md`);
  - public `createFieldRegistry`; built-ins registered exactly like plugins, proven by a fixture
    third-party field; no private hooks or special-cased types;
  - Zod first, types via `z.infer`, never hand-written duplicates (constitution 1);
  - `fieldId` is random, URL-safe, generated once, never reused; choice options have stable IDs;
  - a type change means a new `fieldId`; same `fieldId` with a different `type` across versions
    is refused by this package, not only by the Builder (ADR 0009);
  - `type` strings are permanent once released (ADR 0007);
  - 9 built-in fields; `storeAs` is `"text" | "number" | "date" | "none"` and describes one
    value; multi-value fields give one `Answer` row per value (ADR 0007);
  - file layout `packages/schema/src/fields/<type>.ts` (ADR 0007).
- Consequences of the interview decisions the spec must carry:
  - ADR 0011 says the file answer holds storage key, name, size and type; the owner now wants a
    list of file IDs. ADR 0011 needs a matching update (file metadata lives with the upload
    record in 006).
  - Single-language text and `schemaVersion` are not in any ADR yet; `/impl-plan` should record
    them (one short ADR or an amendment to ADR 0009).
- The package has no user-facing strings (constitution 13): validation errors are codes plus
  params, and the renderer maps them to `messages/{en,th}.json`.
- Must run in Node and in the browser (renderer and Builder reuse it): no Node-only APIs, `fieldId`
  generation uses Web Crypto. ESM-only, built with tsdown; Zod is the only runtime dependency.
- Strict TypeScript with `noUncheckedIndexedAccess`; no `any` without a comment.
- Scope fence: no React or UI binding (002), no DB or `Answer` writing (003, 005), no Builder
  (004), no upload or storage (006), no CSV or chart rendering (007, 008), no conditional logic
  or theme (Phase 2). `analytics` is data only.
- Size: expected to land near the ADR 0006 limit (≤ 20 requirements, ≤ 40 tasks), because of 9
  fields with config, answer, `toCell` and analytics each, plus form schema, registry,
  whole-response validation and versioning rules. This area is high-risk
  (`packages/schema`), so use the escalated agent settings from `docs/work/README.md`.

## Open questions

Each has a recommended answer; the caller should confirm with the owner or let `/clarify` settle it.

1. **Time zone for date-time cells in CSV export** (storage rule decided: UTC, decision 5).
   Not blocking 001; to settle in 007. Recommended: an instance-level time-zone setting
   (default from the server's `TZ`, e.g. `Asia/Bangkok`), cells written as ISO 8601 with that
   offset so BI tools parse them unambiguously. `toCell` therefore takes an optional time-zone
   option rather than reading the environment.
2. **Shape and storage of "Other".** Recommended: answer is `{ optionIds: string[], other?: string }`
   (single-value fields use at most one entry); an "other" selection is the reserved value
   `"other"` in the option list, not a normal option ID; `other` text is required and non-empty
   when "other" is chosen; "other" counts as one selection toward checkbox min/max. `Answer` row for
   "other" holds the reserved value in `valueText` and the free text is kept with the original
   `Response` (item 003 decides if a second column is needed). `toCell` writes the option label,
   or the text prefixed by the other label.
3. **`toCell` for `file`.** ADR 0011 expects file names and a download path, but an answer now holds
   only IDs. Recommended: `toCell` stays pure and returns the file IDs joined by a separator; item
   007 resolves names and download paths from the upload records when it builds the CSV.
4. **`number`: integers or decimals.** Recommended: decimals allowed by default, `integer` flag
   restricts to whole numbers, `storeAs: "number"` (Float, brief §6); no precision or step config.
5. **`rating` range and icon.** Recommended: min fixed at 1; `max` configurable 2 to 10, default
   5; `icon` (`star` | `heart`, brief §5 example) is config data in the core, default `star`;
   `groupable: false` as in the brief.
6. **`summarize` kinds.** Recommended: a small fixed set that item 008 maps to charts: text,
   textarea `"responses"`; number `"histogram+stats"`; choice, dropdown, checkbox `"counts"`
   (incl. the "other" bucket); date `"timeline"`; rating `"distribution+avg"`; file `"count"`.
   `groupable: true` for choice, dropdown, checkbox, rating; false for the rest. Third-party fields
   may use the same set only (no custom summary renderers in MVP).
7. **Size fallback.** If `/spec` goes over 20 requirements, do not trim silently. Proposed split,
   smallest usable first: `001-field-core` = Form Schema, `defineField`, registry, whole-response
   validation, versioning rules, `schemaVersion`, plus text, textarea, number, rating and the
   fixture field; `001b` (own `NNN-slug` folder) = choice, checkbox, dropdown (with "Other"), date
   and file. Recommended: keep one item unless the spec proves it is too big.
