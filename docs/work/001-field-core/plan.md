# 001 — Field core: implementation plan

Inputs: [spec.md](./spec.md) (R1–R20, AC1–AC29, Clarifications 2026-11-05), [intent.md](./intent.md),
brief §2, §5, §6, §9, §10. ADRs: 0003, 0004, 0006, 0007, 0009, 0011 (amended in this step) and
0012 (new, drafted in this step). Requirement and AC numbers refer to spec.md.

Scope: `packages/schema` only, plus the repo tooling that runs its tests in Node **and** Chromium.
Nothing in `apps/web` or `packages/renderer` changes.

## Constitution check

| #   | Principle                     | ✅/❌ | Why                                                                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Schema is the hero (MUST)     | ✅    | Form Schema, field configs, answers, cell options and the error catalogue are Zod schemas; every public type is `z.infer` / `z.output` of one of them or of a definition's schemas. No hand-written duplicates.                                                                                                                                       |
| 2   | Dogfood the plugin API (MUST) | ✅    | The 9 built-ins are `defineField` calls that import only the public API (`src/api.ts`) and `zod`; ESLint forbids `src/fields/**` from importing `src/core/**`. No pre-filled registry. A fixture third-party field goes through the same calls (AC1, AC4, AC14, AC29). `checkVersionHistory` reads `type`, `storeAs` and rules from definitions only. |
| 3   | Self-host first (MUST)        | ✅    | No network, no environment reads, no runtime dependency besides Zod; ESLint bans Node built-ins, `process`, `fetch` and locale/time-zone-reading APIs in `src/`; a dist scan test enforces it on the build output.                                                                                                                                    |
| 4   | Two separate worlds (MUST)    | ✅    | No auth surface. The contract keeps the worlds apart: the schema is strict (respondent-visible content only), answers are untrusted input validated by one server-side call, file IDs are references only.                                                                                                                                            |
| 5   | No in-house BI (MUST)         | ✅    | `summarize` / `groupable` are data only, closed set; no charts, pivots or formulas.                                                                                                                                                                                                                                                                   |
| 6   | No condition language (MUST)  | ✅    | Not touched (conditional logic is Phase 2).                                                                                                                                                                                                                                                                                                           |
| 7   | Small scope (MUST)            | ✅    | MVP item 1 only (brief §10, ADR 0006 item 001); no renderer, DB, Builder, upload, CSV or chart code.                                                                                                                                                                                                                                                  |
| 8   | Response integrity (MUST)     | ✅    | Stored versions are migrated in memory on read, never rewritten (R7, ADR 0012); the version-history check keeps one type, stored kind and comparable config per `fieldId` (R19, ADR 0009). No DB writes here.                                                                                                                                         |
| 9   | Clean architecture (MUST)     | ✅    | `apps/web` untouched; `@songnoi/schema` stays the innermost core (ADR 0005). Inside the package, `fields/` depends on the public API only.                                                                                                                                                                                                            |
| 10  | Server Actions (MUST)         | ✅    | N/A: no actions, no route handlers.                                                                                                                                                                                                                                                                                                                   |
| 11  | Test first (MUST)             | ✅    | Every AC maps to a test or runnable check (Proof); each Order step writes its tests first.                                                                                                                                                                                                                                                            |
| 12  | Type safety (MUST)            | ✅    | `strict` + `noUncheckedIndexedAccess`; no `any`. The one widening at the registry boundary uses method-signature variance or a single commented cast, never `any`.                                                                                                                                                                                    |
| 13  | Multilingual (MUST)           | ✅    | No user-facing strings: codes + params only; Thai/emoji length counted in grapheme clusters, proven in Node and Chromium.                                                                                                                                                                                                                             |
| 14  | Server Components (SHOULD)    | ✅    | N/A: no UI.                                                                                                                                                                                                                                                                                                                                           |
| 15  | Accessible UI (SHOULD)        | ✅    | N/A: no UI.                                                                                                                                                                                                                                                                                                                                           |
| 16  | Spec-driven (MUST)            | ✅    | This plan stops for owner approval; `/tasks` and `/analyze` follow.                                                                                                                                                                                                                                                                                   |
| 17  | Independent review (MUST)     | ✅    | `spec-reviewer` reviews; this role does not.                                                                                                                                                                                                                                                                                                          |
| 18  | Artifacts stay true (MUST)    | ✅    | Divergence updates this file in the same commit; English, Conventional Commits.                                                                                                                                                                                                                                                                       |

No ❌. No principle is bent (see Complexity tracking).

## Design

### Overview and data flow

`@songnoi/schema` is a pure, isomorphic library (brief §2 "schema is the hero", §5, ADR 0007). Later
items use it like this — none of it is built here:

- **002 renderer:** receives a parsed `FormSchema`; validates in the browser with `validateResponse`;
  shows a character counter with `countGraphemes`; maps `Issue` codes to `messages/{en,th}.json`.
- **003 publish:** `parseFormSchema(draft)` → `parseFormSchema` of every stored `FormVersion.schema`
  → `checkVersionHistory(earlier, candidate)` → store the parsed candidate (defaults written in).
- **004 Builder:** `generateId()` for new fields and options; `parseFormSchema` for preview/save.
- **005 respond:** `parseFormSchema(version.schema)` → `validateResponse(schema, answers)` → store the
  normalised set in `Response.answers`; one `Answer` row per `definition.storedValues(...)` value,
  of kind `storeAsOf(definition, config)`, in the same transaction (brief §6).
- **007 export:** `parseCellOptions({ timeZone })` once, then `definition.toCell(answer, config, options)`.
- **008 analytics:** `storeAsOf`, `analytics.summarize`, `analytics.groupable`.

### Public API surface (`src/index.ts`)

Everything else is internal and may change without a release note. A test pins the list of runtime
exports (`test/public-api.test.ts`) so the surface cannot grow silently.

```ts
// Field API (R1–R3)
defineField(input): FieldDefinition<Type, Config, Answer>      // throws FieldDefinitionError
createFieldRegistry(definitions: readonly FieldDefinition[]): FieldRegistry   // throws FieldDefinitionError
storeAsOf(definition: FieldDefinition, config): StoreAs
class FieldDefinitionError extends Error { readonly issues: readonly Issue[] }

// Form Schema (R5–R7)
CURRENT_SCHEMA_VERSION = 1
parseFormSchema(input: unknown, registry): { ok: true; schema: FormSchema } | { ok: false; issues: readonly Issue[] }

// Whole response (R8–R9)
validateResponse(schema: FormSchema, answers: unknown, registry):
  | { ok: true; answers: AnswerSet }
  | { ok: false; answerSet: readonly Issue[]; fields: Readonly<Record<string, readonly Issue[]>> }

// Cells (R1, R16)
parseCellOptions(input: { timeZone?: string }): { ok: true; options: CellOptions } | { ok: false; issues: readonly Issue[] }

// Versions and IDs (R18–R19)
generateId(): string
checkVersionHistory(earlier: readonly { version: number; schema: FormSchema }[], candidate: FormSchema, registry):
  { ok: true } | { ok: false; issues: readonly Issue[] }

// Helpers plugin authors (and the built-ins) use
countGraphemes(text: string): number
customIssue(code, params)            // Zod custom-issue params carrying a catalogue code
issueSchema                          // Zod discriminated union of the catalogue (R4)

// Built-ins (R10–R17): plain definitions, passed to createFieldRegistry like any plugin
textField, textareaField, numberField, choiceField, dropdownField, checkboxField, dateField, ratingField, fileField
builtInFields                        // readonly array of the nine, brief §5 order (an array, not a registry)

// Types: FormSchema, FormMeta, FieldEntry, AnswerSet, FieldDefinition, FieldRegistry, FieldConfig<D>,
// FieldAnswer<D>, CellOptions, StoreAs, Summarize, Issue, IssueCode
```

All results use an `ok` discriminant, like `ActionResult` in `apps/web`. Data comes first and the
registry last in every call.

### Module layout (`packages/schema/src`)

```text
index.ts              public barrel: export * from api.ts and fields/index.ts — nothing else
api.ts                the public API without built-ins; the only module fields/** may import
core/                 internal, never imported by fields/**
  issues.ts           issueSchema, Issue, customIssue, Zod-issue mapping, result helpers
  json.ts             isPlainObject, own-key reads
  define-field.ts     defineField, FieldDefinition, storeAsOf, StoreAs/Summarize, fit table, checks
  registry.ts         createFieldRegistry
  ids.ts              ID pattern, reserved IDs, generateId
  text.ts             countGraphemes
  cell-options.ts     CellOptions, parseCellOptions
  form-schema.ts      v1 shapes, FormSchema types, migration steps, parseFormSchema
  response.ts         validateResponse, AnswerSet
  version-history.ts  checkVersionHistory
fields/               one file per built-in type (ADR 0007): text, textarea, number, rating,
  <type>.ts           choice, dropdown, checkbox, date, file — each a single defineField call
  shared/             builders shared by built-ins, not field types: text.ts (text pair),
                      options.ts (option fields), calendar.ts (date parsing, zoned cells)
  index.ts            builtInFields
```

The dependency direction is `index → api → core` and `fields → api`; ESLint enforces the second
(constitution 2), and nothing in `core/` imports `fields/`.

### `defineField` (R1, R2; ADR 0007 as amended)

```ts
defineField({
  type,                                  // "rating" | "acme/signature" (const generic, literal kept)
  config,                                // Zod schema; output must be an object; defaults allowed
  answer: (config) => zodSchema,         // output = the normalised answer
  isUnanswered?: (value: unknown, config) => boolean,   // extra "no answer" values (R9)
  toCell: (answer, config, options?: CellOptions) => string,
  storedValues: (answer, config) => readonly StoredValueOf<K>[],
  incompatibleChanges?: (previous: config, next: config) => readonly (keyof Config & string)[],
  analytics: {
    storeAs: K | { kinds: readonly K[]; pick: (config) => K },   // fixed, or chosen by config (date)
    summarize: Summarize,
    groupable: boolean,
  },
})
```

- **Type inference.** Generics: `Type` (from `type`), `CS` (config schema), `AS` (answer schema,
  inferred from `answer`'s return type), `K` (stored kinds). `Config = z.output<CS>`,
  `Answer = z.output<AS>`. Every other member takes `NoInfer<Config>` / `NoInfer<Answer>`, so
  inference comes only from `config` and `answer`, and a `toCell`, `storedValues` or
  `incompatibleChanges` written for the wrong type fails to compile (AC3).
  `FieldConfig<D>` / `FieldAnswer<D>` extract them for consumers (002 binds props to them).
- **Returned `FieldDefinition`** is a frozen object with the same members. Its function members are
  declared as **method signatures**, so a typed definition widens to `FieldDefinition` (defaults
  `<string, Record<string, unknown>, unknown>`) and consumers can call `toCell(answer: unknown, …)`
  through the registry without casts. If TypeScript still refuses the widening, one cast lives in
  `registry.ts` with a comment; never `any`.
- **`storedValues`.** `StoredValueOf`: `text` → string, `number` → number, `date` → `YYYY-MM-DD`
  string, `datetime` → ISO UTC string, `none` → `never` (so only `[]` type-checks). For
  `storeAs: none` the package never calls it. 005 gets the kind from `storeAsOf`.
- **Unanswered.** The package rule is fixed: absent key or `null`. `isUnanswered` adds field-specific
  values and is checked on the raw value before the answer schema. Built-ins use exactly this hook:
  text/textarea — string blank after `trim()`; option fields — a plain object whose only own key is
  `optionIds` and that is an empty array; file — an empty array.
- **Definition checks** (run by `defineField` and again by `createFieldRegistry`, because a JS caller
  can hand-build an object; structural, no `instanceof`, so two Zod copies cannot break it):
  - `type` matches `^(?:[a-z0-9-]+\/)?[a-z0-9-]+$` → else `invalid_field_type {type}` at `["type"]`;
  - `summarize` / `storeAs` are in their closed sets, `kinds` non-empty, `groupable` boolean,
    `config` has `safeParse`, functions are functions → else `invalid` at that member's path;
  - every kind `storeAs` may produce fits `summarize` → else one `incompatible_analytics`
    {storeAs, summarize} per misfit at `["analytics"]`. Fit table (data in `define-field.ts`):
    `responses`, `counts` → `text`; `histogram+stats`, `distribution+avg` → `number`; `timeline` →
    `date`, `datetime`; `count` → any but `none`; `none` → `none`.
  - A config-dependent `storeAs` must declare its possible `kinds` up front; that is what makes the
    check possible when the definition is created (R2) rather than when a form is read.
- **Errors at definition time are thrown** as `FieldDefinitionError` (programming errors at
  start-up); `issues` is the contract, `message` is only the codes joined (no display text).

### Registry (R3)

`createFieldRegistry(definitions)` re-runs the definition checks with the list index prefixed to
each path, refuses a repeated `type` (`duplicate_field_type {type}` at `[index, "type"]`), throws
once with all issues, and returns `{ get(type): FieldDefinition | undefined; types: readonly string[] }`.
No global, implicit or pre-filled registry; `builtInFields` is an array the consumer passes in
exactly like a plugin array. A third-party `text` may replace the built-in (AC4).

### Form Schema v1 and the read entry point (R5–R7; ADR 0012)

Static Zod shapes in `core/form-schema.ts` (all `z.strictObject`):

- form `{ schemaVersion: z.literal(1), meta, fields: z.array(fieldEntry) }`;
- meta `{ title: nonBlank, description?: string, language }`;
- field entry `{ fieldId, type: string, label: nonBlank, help?: string, required: boolean = false, config?: unknown }`.

`FormSchema` is the `z.output` of the same shape with `config: z.record(z.string(), z.unknown())`.

`parseFormSchema(input, registry)` is plain TypeScript orchestration over these pieces, so it can
report **every** problem (a single Zod parse would stop at a failed object):

1. Not a plain object → `invalid` at `[]`.
2. **Version gate (R7):** `schemaVersion` missing, not an integer, or not in `1…CURRENT` →
   `unsupported_schema_version {found}` (`found` = the number or string, else `null`) and nothing
   else. Then run migration steps from the found version to `CURRENT_SCHEMA_VERSION`. In this item
   the step list is empty; the loop exists because R7 requires the entry point to migrate first.
   An internal test drives it with a fake step.
3. Meta and form keys through the strict shapes (`unknown_property {key}` per extra key).
4. Each field entry: entry shape; `type` looked up in the registry (`unknown_field_type {type}` at
   `["fields", i, "type"]`, config then skipped); otherwise `config ?? {}` parsed with the type's
   config schema, issues prefixed with `["fields", i, "config"]`; repeated `fieldId` →
   `duplicate_field_id {fieldId}` at the repeat's `["fields", j, "fieldId"]`.
5. No issues → a fresh object with every config default written in. Parsing it again gives an equal
   value (AC9).

Rules on values:

- **IDs:** `fieldId` and option ID match `^[A-Za-z0-9_-]{1,64}$` (else `invalid` — covers a space,
  `.` and 65 characters); `__proto__`, `constructor`, `prototype` as `fieldId` and `other` as option
  ID → `reserved_id {id}`.
- **Not blank:** `title`, `label`, option `label`, `otherLabel`: missing or blank after `trim()` →
  `required`. Text is stored verbatim (no trimming, no Unicode normalisation).
- **Language:** `Intl.getCanonicalLocales(tag)` — a `RangeError` (`en_US`, empty) → `invalid`;
  otherwise the canonical form is returned (`TH` → `th`, `th-th` → `th-TH`). Note: this also
  replaces deprecated aliases (`iw` → `he`); see Risks.
- **Built-in configs are strict objects** too, so nothing admin-only can hide inside `config`
  (unknown keys → `unknown_property` at the config path).

### Whole-response validation (R8, R9)

`validateResponse(schema, answers, registry)`:

1. `answers` not a plain object (`null`, array, string, number…) → `answerSet: [invalid]`, return.
2. For each field in schema order: read the value only with `Object.hasOwn` (a `fieldId` such as
   `toString` must not see `Object.prototype`); absent, `null` or `isUnanswered` → `required` if
   required, else omit; otherwise `definition.answer(config).safeParse(value, { reportInput: true })`
   → output into the normalised set, or issues into `fields[fieldId]`.
3. Every own key of `answers` that is not a schema `fieldId` (including `__proto__`, `constructor`)
   → `unknown_field {fieldId: key}` in the **answer-set group**, path `[]`. Result objects are built
   only from schema `fieldId`s, which can never be `__proto__` (reserved), so no key in the input
   can change another field's result.
4. All fields are always checked. The package and built-ins never throw for any JSON input;
   exceptions thrown by a plugin's own code propagate (they are bugs, not answers).

The normalised set holds Zod outputs: trimmed text, UTC date-times, trimmed "Other" text. Validating
it again returns it unchanged (tested). `AnswerSet` is inferred from
`z.record(z.string(), z.json())`.

### Error-code catalogue (R4; ADR 0012)

`core/issues.ts` defines `issueSchema` as a `z.discriminatedUnion("code", …)` of strict objects
`{ code, params, path }` — no `message`. `Issue` and `IssueCode` are inferred from it. Exactly R4's
29 codes:

| Group               | Code → params                                                                                                                                                                                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Values and config   | `required` {}, `invalid` {}, `too_short` {min}, `too_long` {max}, `too_small` {min}, `too_big` {max}, `not_integer` {}, `too_few` {min}, `too_many` {max}, `invalid_range` {min, max}, `duplicate` {value: string \| number}, `unknown_option` {optionId}, `other_text_required` {}, `invalid_date` {}, `offset_required` {} |
| Answer set          | `unknown_field` {fieldId}                                                                                                                                                                                                                                                                                                    |
| Form Schema         | `unsupported_schema_version` {found: number \| string \| null}, `unknown_property` {key}, `unknown_field_type` {type}, `duplicate_field_id` {fieldId}, `duplicate_option_id` {optionId}, `reserved_id` {id}                                                                                                                  |
| Version history     | `field_type_changed` {fieldId, previousType, type, version}, `field_kind_changed` {fieldId, type, previousStoreAs, storeAs, version}, `field_config_incompatible` {fieldId, type, properties: string[], version}                                                                                                             |
| Definitions, export | `invalid_field_type` {type}, `duplicate_field_type` {type}, `incompatible_analytics` {storeAs, summarize}, `invalid_time_zone` {timeZone}                                                                                                                                                                                    |

`path` is `(string | number)[]`: inside the schema for schema/definition issues, inside the answer
for field groups, `[]` for the answer-set group.

**Zod → catalogue mapping** (`toIssues(zodIssues, context)`), so built-ins and plugins report the same
way. The context matters because R6 and R14 treat extra keys differently:

| Zod issue                                                             | `schema` context (form, config, cell options) | `answer` context |
| --------------------------------------------------------------------- | --------------------------------------------- | ---------------- |
| `invalid_type`, input `undefined` (missing)                           | `required`                                    | `invalid`        |
| `invalid_type`, `expected: "int"`                                     | `not_integer`                                 | `not_integer`    |
| other `invalid_type`                                                  | `invalid`                                     | `invalid`        |
| `too_small` / `too_big`, origin `string`                              | `too_short` {min} / `too_long` {max}          | same             |
| `too_small` / `too_big`, origin `number`                              | `too_small` {min} / `too_big` {max}           | same             |
| `too_small` / `too_big`, origin `array`/`set`                         | `too_few` {min} / `too_many` {max}            | same             |
| `unrecognized_keys`                                                   | one `unknown_property` {key} per key          | `invalid`        |
| `custom` with a catalogue code in `params`                            | that code and params                          | same             |
| anything else (`invalid_value`, `invalid_format`, `invalid_union`, …) | `invalid`                                     | `invalid`        |

Missing-vs-wrong-type uses Zod 4's `reportInput: true`; the input is dropped after mapping.
`customIssue(code, params)` is the public way to raise a specific code from a `.refine` /
`.superRefine` / `.check`; an unknown or malformed code in `params` becomes `invalid`, so every code
leaving the package is in the catalogue (AC8). Built-ins raise their own codes with `customIssue`
wherever Zod's encoding is version-sensitive (e.g. `not_integer`, grapheme lengths).

### Built-in fields (R10–R17)

One file per type in `src/fields/<type>.ts` (ADR 0007). Shared code that is not a field type lives
in `src/fields/shared/` (`text.ts`, `options.ts`, `calendar.ts`). All of them import only
`src/api.ts` (the public API) and `zod`; ESLint enforces it.

| Type                             | Key points                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`, `textarea`               | Config `{ minLength?: int ≥ 0, maxLength?: int ≥ 1 }`, min ≤ max else `invalid_range` at `["minLength"]`. Answer: string → `trim()` → length with `countGraphemes` only when a limit is set (`too_short` / `too_long` via `customIssue`). `text` refuses ECMAScript line terminators (`\n`, `\r`, U+2028, U+2029) → `invalid`; `textarea` keeps them (no CRLF rewriting). `toCell`: the normalised text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `number`                         | Config `{ min?, max?, integer = false }` (Zod numbers are finite), min ≤ max else `invalid_range`. Answer: `z.number()` (`"5"` → `invalid`); `not_integer`, inclusive `too_small` / `too_big`. `toCell`: `String(n)` (ECMAScript shortest round-trip; ASCII, `.`, no grouping).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `rating`                         | Config `{ max: int 2–10 = 5, icon: "star" \| "heart" = "star" }`. Answer: int 1…max. `toCell`: `String(n)`. `groupable: true`. `incompatibleChanges: (p, n) => p.max === n.max ? [] : ["max"]` — the only built-in rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `choice`, `dropdown`, `checkbox` | `fields/shared/options.ts` builds config and answer schemas; the three files differ only in `type`, `maxIds` (1 for choice/dropdown) and checkbox `minSelections` / `maxSelections`. Config: `options` (≥ 1 strict `{id, label}`, `duplicate_option_id`, `reserved_id` for `other`), `allowOther = false`, `otherLabel` required when `allowOther`; checkbox `invalid_range` for min > max or min > options + (allowOther ? 1 : 0). Answer: strict `{ optionIds: string[], other?: string }` with the R14 rules; `other` selected with `other` missing, `null` or blank → `other_text_required`; `other` key present while not selected → `invalid` at `["other"]`; output trims `other`. Cells: labels in config order, unknown IDs next (answer order, written as the ID), "Other" last as `<otherLabel ?? "other">: <text>`, joined by `; `. Stored values: `optionIds` in answer order. |
| `date`                           | Config `{ includeTime = false }`. `storeAs: { kinds: ["date", "datetime"], pick: c => c.includeTime ? "datetime" : "date" }`. Calendar logic in `fields/shared/calendar.ts` (see below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `file`                           | Config `{ maxFiles: int ≥ 1 = 1, maxSize?: int ≥ 1, allowedTypes?: mime[] (≥ 1 entry) }`, MIME = RFC 6838 restricted names, subtype may be `*` (`image/*`), `*/*` refused. Answer: array of strings; empty string → `invalid` at `[i]`, repeat → `duplicate {value}`, over `maxFiles` → `too_many {max}`. `toCell`: IDs joined by `; `. Stored values: the IDs (`text`). `summarize: "count"`. (ADR 0011 as amended.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### Text length: grapheme clusters without a dependency (R10, R20; ADR 0012)

`countGraphemes(text)` iterates `new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)`.

- **No runtime dependency beyond Zod.** `Intl.Segmenter` ships in Node ≥ 16 (full ICU by default)
  and in Chromium, Firefox ≥ 125 and Safari ≥ 14.1. A vendored UAX #29 implementation (or a package
  such as `graphemer`) would give bit-identical data everywhere, but adds a dependency or ~20 KB of
  Unicode tables to keep current, against R20. Rejected for MVP.
- **Locale is explicit** (`"en"`), never the environment's (R20). ICU's grapheme rules are root rules
  with no Thai tailoring, so the locale does not change counts.
- **Created lazily** on first use and reused, so importing the package never fails on an engine
  without `Intl.Segmenter`. Counting runs only when a field sets a length limit. There is no silent
  fallback: a fallback counter would make browser and server disagree, which is exactly what R10
  forbids.
- **Parity proof:** AC15's Thai, emoji, ZWJ, flag and CRLF cases run in Node and in Chromium (below).
  Unicode-version drift between engines is a residual risk (Risks). If it ever bites, only
  `countGraphemes` changes.

### Dates and UTC (R15, R16; ADR 0012)

All arithmetic is UTC-only (`Date.UTC`, `setUTCFullYear`, `toISOString`); no local getters, no
`Date.parse`, no `new Date(string)`.

- **Date-only:** `^(\d{4})-(\d{2})-(\d{2})$`, year 0001–9999, month 01–12, real day (Gregorian leap
  rule) → else `invalid_date`. Returned unchanged; never converted.
- **Date-time:**
  `^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$`.
  No offset → `offset_required`. Hour 00–23, minute/second 00–59 (so `T24:00` and `:60` fail),
  offset hours 00–23 and minutes 00–59, real date → else `invalid_date`. Fractions beyond
  milliseconds are truncated. The instant is computed with `setUTCFullYear` (because `Date.UTC`
  maps years 0–99 to 1900–1999) minus the offset and returned as `toISOString()`. A UTC result
  outside years 0001–9999 → `invalid_date`. Date-only input while `includeTime` (and the reverse)
  → `invalid_date`.
- **Cells:** date-only → unchanged for any zone. Date-time → `…Z` when no zone; otherwise the
  offset comes from `Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })`
  (`GMT+07:00`, `GMT-04:00`, `GMT`), the wall time is `instant + offset` formatted from UTC, and the
  suffix is `±HH:MM` (`+00:00` for a zero offset when a zone was given). Historical sub-minute
  offsets (local mean time before ~1900) are rounded to the minute and the wall time is shifted to
  match, so the string still denotes the exact instant. Formatters are cached per zone.
- **`parseCellOptions`:** a Zod schema (branded `CellOptions`) whose refinement creates an
  `Intl.DateTimeFormat` with the zone; a `RangeError`, an empty string, or an offset-style zone
  (`+07:00`, accepted by some engines but not IANA) → `invalid_time_zone {timeZone}`. Because
  `CellOptions` is branded, `toCell` can only receive a validated zone.

### IDs (R18; ADR 0012)

`generateId()`: 9 bytes from `globalThis.crypto.getRandomValues` (Web Crypto in Node 24 and every
browser, no `node:crypto` import, works outside secure contexts) encoded as 12 base64url characters
(`A–Z a–z 0–9 - _`), i.e. 72 random bits, no padding, no modulo bias. Always matches R5's ID rule.
It can never equal a reserved value (`__proto__` 9, `constructor` 11, `prototype` 9, `other` 5
characters), so no retry loop. Same function for fields and options; never derived from labels.

### Version history (R19; ADR 0009 as amended)

`checkVersionHistory(earlier, candidate, registry)`. Callers pass schemas read with
`parseFormSchema` (so a removed plugin already fails there with `unknown_field_type`) and the stored
version numbers, which the schema itself does not contain. For each candidate field, walk `earlier`
from the latest version down and stop at the first version where the same `fieldId` conflicts:

1. different `type` → `field_type_changed {fieldId, previousType, type, version}`;
2. else `storeAsOf` differs → `field_kind_changed {fieldId, type, previousStoreAs, storeAs, version}`;
3. else the definition's `incompatibleChanges(previousConfig, config)` is non-empty →
   `field_config_incompatible {fieldId, type, properties, version}`.

One issue per conflicting `fieldId`, path `["fields", i]`. Everything comes from the registry's
definitions; there is no built-in special case, so a third-party `rating` without a rule accepts a
`max` change (AC29). Removed fields and re-added fields are handled naturally because every earlier
version is compared. A lookup miss (schemas read with another registry) → `unknown_field_type`.

### Zod version and package shape (ADR 0004, ADR 0012)

- **Zod 4.6.7** (the version `apps/web` already pins), classic API (`import * as z from "zod"`).
  Declared as a **peer dependency** `"zod": "^4.6.0"` plus the pinned devDependency, so the app, the
  package and every plugin share one Zod copy and one set of inferred types (two copies of Zod 4 can
  make `ZodType` types from different versions incompatible). Zod 3 is not supported. The manifest
  test checks that `zod` is the only name across `dependencies`, `peerDependencies` and
  `optionalDependencies` (AC2). **Owner decision** (see summary).
- tsdown stays `platform: "neutral"`, ESM + `.d.ts`; peers are external, so `dist` imports only
  `zod` and relative files.
- **R20 guard rails** in the root `eslint.config.mjs`, for `packages/schema/src/**`:
  `no-restricted-imports` (every `node:*` and bare built-in name from `module.builtinModules`,
  `react*`); `no-restricted-globals` (`process`, `Buffer`, `require`, `global`, `__dirname`,
  `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator`, `window`, `document`, `localStorage`);
  `no-restricted-properties` for local-time and locale APIs (`getTimezoneOffset`, `getHours`,
  `getDate`, `getMonth`, `getFullYear`, `getDay`, `getMinutes`, `getSeconds`, the matching local
  setters, `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString`, `Date.parse`). A second
  block for `src/fields/**` repeats those patterns (flat config replaces rule options) and adds
  `**/core/**` (constitution 2). Every public export gets a TSDoc comment (plugin authors' docs).

### Running the same tests in Node and in Chromium (AC15, AC25, AC28)

- **Tooling:** Vitest browser mode with the Playwright provider — `@vitest/browser-playwright`
  5.1.0 (matches Vitest 5.1.0) and `playwright` 1.64.1 (already in the lockfile through `apps/web`)
  as devDependencies of `@songnoi/schema`. A real Chromium runs the tests; jsdom/happy-dom are not
  used anywhere.
- **Configs:**
  - `packages/schema/vitest.config.ts` — project `node`: `test/**/*.test.ts` minus `test/browser/**`,
    `env.TZ = "Pacific/Pago_Pago"` (UTC−11). The root `projects: ["packages/*"]` keeps loading only
    this file, so `pnpm vitest run <path>` stays browser-free.
  - `packages/schema/vitest.browser.config.ts` — project `chromium`: `test/**/*.test.ts` minus
    `test/node/**`, with:

    ```ts
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
      provider: playwright({
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
        contextOptions: { locale: "th-TH", timezoneId: "Pacific/Kiritimati" },
      }),
    }
    ```

    The Thai locale is a tripwire: any accidental use of the default locale formats Buddhist-era
    years and fails the date tests; the UTC+14 zone does the same for local-time leaks.
- **Test layout:** `test/**/*.test.ts` are shared and must not skip by environment;
  `test/node/**` holds Node-only checks (manifest, dist scan, process-TZ flip);
  `test/browser/**` holds Chromium-only checks (`engine.test.ts` asserts a real Chromium user agent
  and no Node `process`; `dist-smoke.test.ts` imports the **built** `dist/index.js` and runs the AC1
  flow, so the published artifact itself is proven in a browser).
- **Commands:** package scripts `test` = `vitest run` (Node) and
  `test:browser` = `vitest run --config vitest.browser.config.ts`; root `pnpm test:browser` →
  `turbo run test:browser`. Turbo task `test:browser` depends on `^build` and, in the package's
  `turbo.json`, on its own `build` (for the dist smoke). Turbo runs in strict env mode, so
  `PLAYWRIGHT_CHROMIUM_PATH` and `PLAYWRIGHT_BROWSERS_PATH` are added to `globalPassThroughEnv`.
- **Browser binary:** no `playwright install` in this sandbox. Run with
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` (the house
  convention from `apps/web/playwright.config.ts`); it is needed because Playwright 1.64.1 expects
  revision 1248 and only 1243 is preinstalled. CI moves the existing "Install Playwright browser"
  step before "Unit tests" and adds a "Browser parity tests" step running `pnpm test:browser`.
- **Fallback** (only if step 1 below cannot make Vitest browser mode run): a Playwright test in
  `packages/schema/e2e/` that serves `dist/` plus a bundle of the shared case tables on a local
  static server and evaluates them in the page. The plan would be updated in the same commit.

### Modules, data, auth, UI, i18n — none in this item

- **No `apps/web` modules** (`domain` / `application` / `infrastructure` / `actions.ts` /
  `queries.ts` / `composition.ts`): nothing in the app uses the schema yet; 003 and 005 add the first
  use cases and depend on this package from their `domain` / `application` layers (ADR 0005).
- **No Prisma changes, no migrations.** Downstream needs are recorded for 003/005: an `Answer` UTC
  instant column next to the calendar-date column (ADR 0007 as amended, brief §6 proposal), and the
  long-`textarea` index risk (spec Flag 8).
- **No Server Actions and no route handlers** (ADR 0005 allow-list untouched); no auth world is
  involved (ADR 0002).
- **No i18n keys.** The package has no user-facing strings (constitution 13, ADR 0003); codes and
  params are mapped to `messages/{en,th}.json` by the renderer (002) and the respond flow (005),
  which own the UI. Adding keys now would create untested, unused messages.
- **No UI**, so no Server/Client Components, Thai typography or Nielsen pass apply. The parts that
  affect Thai users later are covered here: grapheme-based lengths (R10) and verbatim Thai text.

## Files to touch

### `packages/schema`

| Path                                                                                   | Reason                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                                                         | `peerDependencies.zod` `^4.6.0`; devDeps `zod` 4.6.7, `@vitest/browser-playwright` 5.1.0, `playwright` 1.64.1; `test:browser` script                       |
| `turbo.json`                                                                           | `test:browser` depends on `^build` and its own `build` (dist smoke)                                                                                        |
| `vitest.config.ts`                                                                     | Node project: shared + `test/node`, `env.TZ`                                                                                                               |
| `vitest.browser.config.ts` (new)                                                       | Chromium project via Playwright provider, `executablePath` from env, `th-TH` / `Pacific/Kiritimati` context                                                |
| `src/index.ts`                                                                         | Public barrel: `api.ts` + built-ins; replaces the `VERSION` placeholder                                                                                    |
| `src/api.ts` (new)                                                                     | Public API without built-ins; the only module `src/fields/**` may import                                                                                   |
| `src/core/issues.ts`                                                                   | `issueSchema`, `Issue`, `IssueCode`, `customIssue`, Zod-issue mapping, result helpers (R4)                                                                 |
| `src/core/json.ts`                                                                     | `isPlainObject`, own-key reads (`Object.hasOwn`)                                                                                                           |
| `src/core/define-field.ts`                                                             | `defineField`, `FieldDefinition`, `storeAsOf`, `StoreAs` / `Summarize` enums, fit table, definition checks, `FieldDefinitionError` (R1, R2)                |
| `src/core/registry.ts`                                                                 | `createFieldRegistry` (R3)                                                                                                                                 |
| `src/core/ids.ts`                                                                      | ID pattern, reserved sets, `generateId` (R5, R18)                                                                                                          |
| `src/core/text.ts`                                                                     | `countGraphemes` (R10)                                                                                                                                     |
| `src/core/cell-options.ts`                                                             | `CellOptions` schema, `parseCellOptions` (R16)                                                                                                             |
| `src/core/form-schema.ts`                                                              | Form Schema v1 shapes, `FormSchema` types, migration loop, `parseFormSchema` (R5–R7)                                                                       |
| `src/core/response.ts`                                                                 | `validateResponse`, `AnswerSet` (R8, R9)                                                                                                                   |
| `src/core/version-history.ts`                                                          | `checkVersionHistory` (R19)                                                                                                                                |
| `src/fields/{text,textarea,number,rating,choice,dropdown,checkbox,date,file}.ts`       | The nine built-ins, public API only (R10–R17, ADR 0007 layout)                                                                                             |
| `src/fields/shared/{text,options,calendar}.ts`                                         | Shared builders for text pair, option fields, date parsing and zoned cells                                                                                 |
| `src/fields/index.ts`                                                                  | `builtInFields` array                                                                                                                                      |
| `test/node/dist.test.ts` (moved from `test/`)                                          | Built entry importable; checks `defineField` instead of `VERSION` (ADR 0004)                                                                               |
| `test/node/manifest.test.ts` (from `test/no-react.test.ts`)                            | No UI library in deps/peer/optional; `zod` is the only name (AC2)                                                                                          |
| `test/node/build-output.test.ts` (new)                                                 | Scans `dist/**/*.js`: only `zod` and relative imports, no built-ins, no `process`/`Buffer`/`require` (AC2)                                                 |
| `test/node/time-zone-independence.test.ts` (new)                                       | Flips `process.env.TZ` between two zones, re-runs date/cell cases, outputs identical (AC23)                                                                |
| `test/browser/engine.test.ts`, `test/browser/dist-smoke.test.ts` (new)                 | Real Chromium guard; built artifact runs the AC1 flow in Chromium (AC1, AC28)                                                                              |
| `test/helpers/issues.ts` (new)                                                         | `expectIssues(...)`: every failure assertion also parses the issues with strict `issueSchema` (AC8)                                                        |
| `test/fixtures/third-party.ts` (new)                                                   | Fixture plugins: `acme/signature` (own unanswered rule and compatibility rule), `acme/measure` (config-dependent `storeAs`), `acme/note` (`storeAs: none`) |
| `test/fixtures/date-cases.ts` (new)                                                    | Shared date/cell case table for Node, Chromium and the TZ flip                                                                                             |
| `test/issues.test.ts`                                                                  | Catalogue equals R4's 29 codes; Zod mapping per context; `customIssue`; `FieldDefinitionError` (AC8)                                                       |
| `test/define-field.test.ts`, `test/registry.test.ts`, `test/public-api.test.ts`        | AC4–AC7 (fixture parts); pinned list of runtime exports, no registry among them                                                                            |
| `test/types/define-field.test-d.ts`                                                    | Inferred types and `@ts-expect-error` cases, checked by `pnpm typecheck` (AC3)                                                                             |
| `test/form-schema.test.ts`                                                             | AC9–AC11, migration loop                                                                                                                                   |
| `test/response.test.ts`                                                                | AC12–AC14, idempotent re-validation                                                                                                                        |
| `test/graphemes.test.ts`, `test/fields/{text,number,rating,options,date,file}.test.ts` | AC15–AC24                                                                                                                                                  |
| `test/cell-options.test.ts`                                                            | `invalid_time_zone` cases (AC23)                                                                                                                           |
| `test/builtins.test.ts`                                                                | Table checks over all nine: analytics (AC6), stored values (AC7), defaults and re-parse (AC9), AC13 built-in rows                                          |
| `test/exit-check.test.ts`                                                              | ADR 0006 exit check (AC1)                                                                                                                                  |
| `test/ids.test.ts`                                                                     | AC25                                                                                                                                                       |
| `test/version-history.test.ts`                                                         | AC26, AC27, AC29                                                                                                                                           |

### Repo

| Path                                 | Reason                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                       | Root `test:browser` → `turbo run test:browser`                                                                                  |
| `turbo.json`                         | `test:browser` task (`dependsOn: ["^build"]`); `PLAYWRIGHT_CHROMIUM_PATH`, `PLAYWRIGHT_BROWSERS_PATH` in `globalPassThroughEnv` |
| `eslint.config.mjs`                  | R20 guard rails for `packages/schema/src/**`; public-API-only imports for `src/fields/**`                                       |
| `.github/workflows/ci.yml`           | Install Chromium before unit tests; add `pnpm test:browser` step                                                                |
| `pnpm-lock.yaml`                     | Regenerated                                                                                                                     |
| `.changeset/<name>.md` (new)         | `@songnoi/schema`: minor — Form Schema v1, field API, nine built-ins (standards: schema changes need a changeset)               |
| `docs/standards.md`                  | Commands table and Testing: `pnpm test:browser`, browser parity rule                                                            |
| `CLAUDE.md`, `.claude/settings.json` | Main session: add `pnpm test:browser` to Commands and to the allow-list                                                         |

### Docs (this step)

| Path                                                    | Reason                                                                                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/work/001-field-core/plan.md`                      | This plan                                                                                                                                             |
| `docs/adr/0003-i18n.md`                                 | Amended: single-language form content, no `LocalizedText` (spec Flag 6)                                                                               |
| `docs/adr/0007-headless-field-core-and-ui-binding.md`   | Amended: `datetime`, `summarize` set incl. `none`, stored values, unanswered hook, compatibility rule, `toCell(answer, config, options)` (Flags 3, 7) |
| `docs/adr/0009-form-versioning-and-stable-field-ids.md` | Amended: same `fieldId` keeps type, stored kind and declared-compatible config; three codes (Flag 7)                                                  |
| `docs/adr/0011-file-field-and-object-storage.md`        | Updated, still Proposed: answer = file IDs, `storeAs: "text"`, `toCell` writes IDs (Flag 4)                                                           |
| `docs/adr/0012-form-schema-v1-contract.md` (new)        | `schemaVersion` + migrate-on-read, error catalogue, grapheme counting, UTC rule, IDs, Zod as peer                                                     |

## Order

Each step is one Conventional Commit (or a few) that leaves `pnpm format:check`, `lint`,
`typecheck`, `test` and `test:browser` green, tests written first. Story steps are independent
increments; steps 7 and 8 are exactly what moves to `001b` if `/tasks` exceeds 40 (Risks).

1. **Setup — two engines** (`chore(schema)`): Zod peer + dev dependency; browser devDeps;
   `vitest.config.ts` / `vitest.browser.config.ts`; move the two existing tests to `test/node/`;
   `test/browser/engine.test.ts`; root and package `test:browser`, turbo task and env pass-through;
   CI step order; ESLint R20 and fields-import rules. Exit: a trivial shared test passes in Node and
   in Chromium with `PLAYWRIGHT_CHROMIUM_PATH` set. This is the spike for Risk 2 — decide on the
   fallback here, before any feature code.
2. **Foundational — error catalogue** (`feat(schema)`): `issueSchema`, mapping, `customIssue`,
   `test/helpers/issues.ts`, `test/issues.test.ts`, `core/json.ts`.
3. **US1 — define and register** (`feat(schema)`): fixtures; `define-field.test.ts`,
   `registry.test.ts`, `types/define-field.test-d.ts`; then `defineField`, `storeAsOf`,
   `FieldDefinitionError`, `createFieldRegistry`, `api.ts`, `index.ts`, `public-api.test.ts`.
   Proves AC3, AC5, AC6 (pairs), AC7 (`none` fixture), AC4 (registry part).
4. **US2 — Form Schema** (`feat(schema)`): `form-schema.test.ts` with a fixture-only registry; then
   ID rules, v1 shapes, language, migration loop, `parseFormSchema`. Proves AC9 (fixture part),
   AC10 (non-config rows), AC11, AC4 (`text` unknown without built-ins).
5. **US3 — whole response** (`feat(schema)`): `response.test.ts` with fixture fields; then
   `validateResponse`. Proves AC12, AC13 (absent, `null`, unknown keys), AC14.
6. **US4 — scalar built-ins** (`feat(schema)`): `graphemes.test.ts`, `fields/text|number|rating`
   tests; then `countGraphemes`, `fields/shared/text.ts`, `text`, `textarea`, `number`, `rating`;
   `exit-check.test.ts`; config rows of AC10 (rating `max` 11, text min > max); blank-text rows of
   AC13. Proves AC1, AC15–AC17. **First usable increment for 002's text/number/rating work.**
7. **US5 — option built-ins** (`feat(schema)`): `fields/options.test.ts`; then
   `fields/shared/options.ts`, `choice`, `dropdown`, `checkbox`; empty-selection rows of AC13.
   Proves AC18–AC20.
8. **US6 — date and file** (`feat(schema)`): `cell-options.test.ts`, `fixtures/date-cases.ts`,
   `fields/date.test.ts`, `node/time-zone-independence.test.ts`, `fields/file.test.ts`; then
   `parseCellOptions`, `fields/shared/calendar.ts`, `date`, `file`; empty-file-list rows of AC13.
   Proves AC21–AC24.
9. **US7 — identity across versions** (`feat(schema)`): `ids.test.ts`, `version-history.test.ts`;
   then `generateId`, `checkVersionHistory`. Proves AC25–AC27, AC29.
10. **Polish and exit check** (`feat(schema)`, `test(schema)`, `docs:`): `fields/index.ts`
    (`builtInFields`) and `builtins.test.ts` (AC6, AC7, AC9 tables); `node/manifest.test.ts`,
    `node/build-output.test.ts`, `node/dist.test.ts`, `browser/dist-smoke.test.ts` (AC2, AC1 on the
    artifact); changeset; `docs/standards.md`; main session updates `CLAUDE.md` and
    `.claude/settings.json`; full proof run (AC28): `pnpm format:check`, `pnpm lint`,
    `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:browser`.

## Risks

| Risk                                                                                                                                                                                          | Detection / mitigation                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Unicode parity.** Node and browsers ship their own ICU/Unicode data; grapheme rules change between Unicode versions; Firefox/Safari are not tested (spec Flag 8).                        | AC15 cases (stable Thai and emoji rules) run in Node and Chromium on every CI run, plus a small canary corpus in `graphemes.test.ts`. One function (`countGraphemes`) to swap for a vendored segmenter if a mismatch appears (ADR 0012). Residual risk for other engines is accepted until the owner adds them.                 |
| **2. Browser tooling.** Vitest 5 browser-mode API details, nested projects, or the preinstalled Chromium 1243 vs Playwright 1.64.1's expected 1248; Turbo strict env drops the path variable. | Step 1 is a spike that must pass before feature code; `engine.test.ts` fails loudly if the run is not real Chromium. `PLAYWRIGHT_CHROMIUM_PATH` passed through Turbo. CI installs the matching revision. Fallback: Playwright test evaluating the built bundle (Design).                                                        |
| **3. Type inference.** Deep generics over Zod 4 could slow `tsc`, give poor inference, or emit TS2742 ("inferred type cannot be named") in `.d.ts` for the built-in constants.                | Three generics plus `K`, `NoInfer` on dependent members; AC3 type tests and `pnpm build` run from step 3 on. If TS2742 appears, annotate the exported built-ins with `FieldDefinition<"rating", z.output<typeof ratingConfig>, z.output<…>>` (still inferred, not hand-written).                                                |
| **4. Zod internals in the mapping.** `expected: "int"`, `origin`, `reportInput` are Zod 4 details that could shift between minors.                                                            | `issues.test.ts` pins every mapping row; built-ins raise version-sensitive codes through `customIssue`; peer range starts at the tested `4.6`. Dependabot bumps run the suite.                                                                                                                                                  |
| **5. Public API frozen early.** Property names, answer shapes, `type` strings and codes become permanent with the first stored form, and the npm release in 009 publishes them.               | Minimal surface, pinned by `public-api.test.ts`; internals not exported (`exports` has only `.`); ADR 0012 lists what is frozen; pre-1.0 changeset is `minor`. Format changes after release go through `schemaVersion` + migration.                                                                                             |
| **6. Size at the limit.** 20/20 requirements; estimated 36–42 tasks against the 40-task limit.                                                                                                | `/tasks` groups tests per field family and pairs small test+impl tasks. If the count exceeds 40, apply spec Flag 9: steps 7–8 move to `001b` together with every AC row that needs option/date/file fields (AC6, AC7, AC9, AC13 rows; AC27 `date` case; AC29 option-field and `file` rows), and step 9 runs right after step 6. |
| **7. Prototype keys and inherited properties** (`__proto__`, `constructor`, a `fieldId` named `toString`).                                                                                    | Reads use `Object.hasOwn`; results are built from schema `fieldId`s only; reserved IDs; tests cover all three keys.                                                                                                                                                                                                             |
| **8. Time-zone data drift** (tzdata differs between Node and Chromium for future rule changes).                                                                                               | Tests use long-stable zones and 2026 dates (Bangkok, New York, Kiritimati, Pago Pago). CSV zone choice stays with 007.                                                                                                                                                                                                          |
| **9. Language canonicalisation** — `Intl.getCanonicalLocales` also replaces deprecated aliases (`iw` → `he`) with engine-dependent CLDR data.                                                 | Tests use stable tags (`th`, `TH`, `th-TH`, `en`); the server's parse is the stored one (003/005 re-parse). Reported to the owner as a nuance of R5 "canonical case".                                                                                                                                                           |
| **10. Engines without `Intl.Segmenter`.**                                                                                                                                                     | Lazy creation: import never fails, counting throws only where a length limit is set. Baseline documented in ADR 0012; all supported targets have it.                                                                                                                                                                            |
| **11. Plugin misbehaviour** (throwing inside rules, wrong stored-value kinds, `storeAs` or rule changes between plugin releases).                                                             | Not swallowed; R8's never-throw promise covers the package and built-ins. Types catch wrong kinds for TypeScript plugins. History conflicts block the next publish, never change stored data (ADR 0009 as amended).                                                                                                             |
| **12. Performance** — answer schemas are built per `validateResponse` call; one `Intl.DateTimeFormat` per zone.                                                                               | Fine for MVP form sizes; formatters cached per zone; memoising answer schemas per field entry is a later, internal change.                                                                                                                                                                                                      |

## Proof

N = Node project (`pnpm test`), C = Chromium project (`pnpm test:browser`), T = `pnpm typecheck`.
Every failure assertion goes through `test/helpers/issues.ts`, which also validates the issues
against the strict `issueSchema` (that is how AC8 covers every failure case).

| AC   | Proof                                                                                                                                                                                                                                              | Runs in           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| AC1  | `test/exit-check.test.ts` — one `createFieldRegistry([ratingField, acmeSignature])`, a schema using both parses, a response validates; `test/browser/dist-smoke.test.ts` repeats it against the built `dist/index.js`                              | N, C              |
| AC2  | `pnpm build`; `test/node/manifest.test.ts` (no UI library in deps/peer/optional; only `zod`); `test/node/build-output.test.ts` (dist imports only `zod` and relative files, no Node built-in); `test/node/dist.test.ts` (ESM + types)              | N (after build)   |
| AC3  | `test/types/define-field.test-d.ts` — `expectTypeOf` for rating and fixture config/answer types; `@ts-expect-error` on wrong-typed `toCell`, `storedValues`, `incompatibleChanges`                                                                 | T                 |
| AC4  | `test/registry.test.ts` (third-party `text` accepted), `test/form-schema.test.ts` (`text` without built-ins → `unknown_field_type`), `test/public-api.test.ts` (no registry among exports)                                                         | N, C              |
| AC5  | `test/registry.test.ts` — `duplicate_field_type`; `Text`, `my type`, `a/b/c` → `invalid_field_type`; `acme/signature` accepted                                                                                                                     | N, C              |
| AC6  | `test/define-field.test.ts` (all 35 `summarize` × `storeAs` pairs); `test/builtins.test.ts` (each built-in's analytics vs the spec table, `date` both ways, `groupable` exactly the four)                                                          | N, C              |
| AC7  | `test/builtins.test.ts` (stored values per built-in incl. checkbox "Other", choice "Other", two files, date-time); `test/define-field.test.ts` (`acme/note` → `[]`)                                                                                | N, C              |
| AC8  | `test/helpers/issues.ts` (strict `issueSchema` parse on every asserted failure in AC4–AC27, AC29); `test/issues.test.ts` (catalogue equals R4's list; `FieldDefinitionError.issues`; no `message` key)                                             | N, C              |
| AC9  | `test/form-schema.test.ts` (fixture defaults, `required` false, re-parse equal, `TH` → `th`); `test/builtins.test.ts` (rating, number, option, date, file defaults)                                                                                | N, C              |
| AC10 | `test/form-schema.test.ts` — every listed invalid case with code and path                                                                                                                                                                          | N, C              |
| AC11 | `test/form-schema.test.ts` — `1` accepted; missing, `0`, `2`, `"1"` → only `unsupported_schema_version`                                                                                                                                            | N, C              |
| AC12 | `test/response.test.ts` — normalised set; three bad fields → three groups; `null`, `[]`, `"x"`, `1`, nested garbage → whole-set `invalid`, no throw                                                                                                | N, C              |
| AC13 | `test/response.test.ts` (absent, `null`, `__proto__`, `constructor` keys) and `test/builtins.test.ts` (blank text, empty selection, empty file list; required vs optional)                                                                         | N, C              |
| AC14 | `test/response.test.ts` — `acme/signature`'s `isUnanswered` honoured                                                                                                                                                                               | N, C              |
| AC15 | `test/graphemes.test.ts` + `test/fields/text.test.ts` — every listed Thai/emoji/CRLF case, trimming, line breaks, `toCell`; identical expectations in both engines                                                                                 | N, **C**          |
| AC16 | `test/fields/number.test.ts`                                                                                                                                                                                                                       | N, C              |
| AC17 | `test/fields/rating.test.ts`                                                                                                                                                                                                                       | N, C              |
| AC18 | `test/fields/options.test.ts` (config cases)                                                                                                                                                                                                       | N, C              |
| AC19 | `test/fields/options.test.ts` (answer cases)                                                                                                                                                                                                       | N, C              |
| AC20 | `test/fields/options.test.ts` (cell cases, example form config)                                                                                                                                                                                    | N, C              |
| AC21 | `test/fields/date.test.ts` (date-only cases and cells in no zone, Kiritimati, Pago Pago)                                                                                                                                                           | N, C              |
| AC22 | `test/fields/date.test.ts` (date-time normalisation, `offset_required`, `invalid_date`, `storeAsOf`)                                                                                                                                               | N, C              |
| AC23 | `test/fields/date.test.ts` (Z, Bangkok, New York Jan/Jul), `test/cell-options.test.ts` (`Mars/Base`), `test/node/time-zone-independence.test.ts` (process TZ flipped between two zones, outputs identical); Chromium runs under UTC+14 and `th-TH` | N, C              |
| AC24 | `test/fields/file.test.ts`                                                                                                                                                                                                                         | N, C              |
| AC25 | `test/ids.test.ts` — 100,000 IDs: pattern, equal length 12, no duplicates                                                                                                                                                                          | N, **C**          |
| AC26 | `test/version-history.test.ts` (type change only `field_type_changed`; accepted changes incl. removed and re-added field)                                                                                                                          | N, C              |
| AC27 | `test/version-history.test.ts` (`date` both directions, label-only change, `acme/measure` kind flip)                                                                                                                                               | N, C              |
| AC28 | CI: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:browser` (all shared files pass in both engines; `test/browser/engine.test.ts` proves real Chromium)                                                                                    | N, **C**, T, lint |
| AC29 | `test/version-history.test.ts` (rating `max` both ways and after removal; `icon` only; other built-ins' compatible changes; `acme/signature` rule; third-party `rating` without a rule)                                                            | N, C              |

## Complexity tracking

None — no principle is bent.
