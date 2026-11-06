# 001 — Field core: implementation plan

Inputs: [spec.md](./spec.md) (R1–R20, AC1–AC29, Clarifications 2026-11-05), [intent.md](./intent.md),
brief §2, §5, §6, §9, §10. ADRs: 0003, 0004, 0006, 0007, 0009, 0011 (amended in this step) and
0012 (new, drafted in this step). Requirement and AC numbers refer to spec.md.

Approval: owner approved this plan on 2026-11-05, including Zod as a peer dependency, ADR 0012
and the `pnpm test:browser` command with the CI reorder. Revised the same day after `/analyze`
(corrections and additions only, design unchanged; owner decisions F04, F06, F08, F27 taken
2026-11-05), again after the second `/analyze` pass the same day (Proof and wording
corrections only), and after the third pass the same day (wording sync with tasks.md and
spec.md, design unchanged) — see Revisions.

Scope: `packages/schema` only, plus the repo tooling that runs its tests in Node **and** Chromium.
Nothing in `apps/web` or `packages/renderer` changes.

Glossary (spec term → API; the same set as spec.md's Terms): "export options" → `CellOptions` /
`parseCellOptions`; "answer-compatibility rule" → `incompatibleChanges`; "unanswered rule" →
`isUnanswered`; "stored values" → `storedValues`; "read entry point" → `parseFormSchema`;
"whole-response validation" → `validateResponse`; "version check" → `checkVersionHistory`; "ID
rules" → `idSchema` (the reserved IDs are separate checks, see Rules on values).

## Constitution check

| #   | Principle                     | ✅/❌ | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Schema is the hero (MUST)     | ✅    | Form Schema, field configs, answers, IDs, cell options, `StoreAs` / `Summarize` and the error catalogue are Zod schemas; every data type (`FormSchema`, `AnswerSet`, `CellOptions`, `Issue`, `IssueCode`, `StoreAs`, `Summarize`, `FieldConfig<D>`, `FieldAnswer<D>`) is `z.infer` / `z.output` of one of them or of a definition's schemas. Hand-written types exist only for structures that are not data and have no schema — `FieldDefinition`, `FieldRegistry`, `StoredValueOf`, the `ok` result unions, `FieldDefinitionError` — and none of them duplicates a schema. |
| 2   | Dogfood the plugin API (MUST) | ✅    | The 9 built-ins are `defineField` calls that import only the public API (`src/api.ts`) and `zod`; ESLint forbids `src/fields/**` from importing `src/core/**`. No pre-filled registry. A fixture third-party field goes through the same calls (AC1, AC4, AC14, AC29). `checkVersionHistory` reads `type`, `storeAs` and rules from definitions only.                                                                                                                                                                                                                        |
| 3   | Self-host first (MUST)        | ✅    | No network, no environment reads, no runtime dependency besides Zod; ESLint bans Node built-ins, `process`, `fetch` and locale/time-zone-reading APIs in `src/`; a dist scan test enforces it on the build output.                                                                                                                                                                                                                                                                                                                                                           |
| 4   | Two separate worlds (MUST)    | ✅    | No auth surface. The contract keeps the worlds apart: the schema is strict (respondent-visible content only), answers are untrusted input validated by one server-side call, file IDs are references only.                                                                                                                                                                                                                                                                                                                                                                   |
| 5   | No in-house BI (MUST)         | ✅    | `summarize` / `groupable` are data only, closed set; no charts, pivots or formulas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 6   | No condition language (MUST)  | ✅    | Not touched (conditional logic is Phase 2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 7   | Small scope (MUST)            | ✅    | MVP item 1 only (brief §10, ADR 0006 item 001); no renderer, DB, Builder, upload, CSV or chart code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 8   | Response integrity (MUST)     | ✅    | Stored versions are migrated in memory on read, never rewritten (R7, ADR 0012); the version-history check keeps one type, stored kind and comparable config per `fieldId` (R19, ADR 0009). No DB writes here.                                                                                                                                                                                                                                                                                                                                                                |
| 9   | Clean architecture (MUST)     | ✅    | `apps/web` untouched; `@songnoi/schema` stays the innermost core (ADR 0005). Inside the package, `fields/` depends on the public API only.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 10  | Server Actions (MUST)         | ✅    | N/A: no actions, no route handlers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 11  | Test first (MUST)             | ✅    | Every AC maps to a test or runnable check (Proof); each Order step writes its tests first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 12  | Type safety (MUST)            | ✅    | `strict` + `noUncheckedIndexedAccess`; no `any`. The one widening at the registry boundary uses method-signature variance or a single commented cast, never `any`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| 13  | Multilingual (MUST)           | ✅    | No user-facing strings: codes + params only; Thai/emoji length counted in grapheme clusters, proven in Node and Chromium.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 14  | Server Components (SHOULD)    | ✅    | N/A: no UI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 15  | Accessible UI (SHOULD)        | ✅    | N/A: no UI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 16  | Spec-driven (MUST)            | ✅    | This plan stops for owner approval; `/tasks` and `/analyze` follow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 17  | Independent review (MUST)     | ✅    | `spec-reviewer` reviews; this role does not.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 18  | Artifacts stay true (MUST)    | ✅    | Divergence updates this file in the same commit; English, Conventional Commits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

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

// Versions and IDs (R5, R18–R19)
idSchema                             // Zod schema of the one ID rule ^[A-Za-z0-9_-]{1,64}$ (fieldIds and option IDs); mismatch → invalid
generateId(): string                 // always passes idSchema, never a reserved ID
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
  issues.ts           issueSchema, Issue, customIssue, Zod-issue mapping, result helpers,
                      FieldDefinitionError
  json.ts             isPlainObject, own-key reads
  define-field.ts     defineField, FieldDefinition, storeAsOf, StoreAs/Summarize, fit table, checks
                      (throws FieldDefinitionError from issues.ts)
  registry.ts         createFieldRegistry
  ids.ts              idSchema (the only copy of the ID pattern), reserved fieldIds, generateId
  text.ts             countGraphemes
  cell-options.ts     CellOptions schema + branded type (US1 step), parseCellOptions (US6 step)
  form-schema.ts      v1 shapes, FormSchema types, migration steps, parseFormSchema
  response.ts         validateResponse, AnswerSet
  version-history.ts  checkVersionHistory
fields/               one file per built-in type (ADR 0007): text, textarea, number, rating,
  <type>.ts           choice, dropdown, checkbox, date, file — each a single defineField call
  shared/             builders shared by built-ins, not field types: text.ts (text pair),
                      options.ts (option fields), calendar.ts (date parsing, zoned cells),
                      decimal.ts (plain-decimal number cells)
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
- **`CellOptions` exists from the `defineField` step.** `toCell`'s third parameter needs the type, so the
  cell-options Zod schema and its branded `z.output` type `CellOptions` are created in
  `core/cell-options.ts` in the US1 step (Order step 3, T010) and the type is exported from
  `api.ts` there (type only, so the pinned runtime list does not change). `parseCellOptions` and
  its runtime export stay in the US6 step (Order step 8, T025); see "Dates and UTC".
- **Returned `FieldDefinition`** is a frozen object with the same members. Its function members are
  declared as **method signatures**, so a typed definition widens to `FieldDefinition` (defaults
  `<string, Record<string, unknown>, unknown, StoreAs>`; the fourth parameter is the stored kind
  `K`, so `storedValues` returns `readonly StoredValueOf<K>[]`) and consumers can call `toCell(answer: unknown, …)`
  through the registry without casts. If TypeScript still refuses the widening, one cast lives in
  `registry.ts` with a comment; never `any`.
- **Provided optional members are required in the returned type.** `defineField` infers, from the
  input, which optional members (`isUnanswered`, `incompatibleChanges`) the caller provided, and its
  return type makes exactly those non-optional: each is marked by a generic inferred from the
  member's return type with a private sentinel default (`R … = Absent`, `B … = Absent`), and the
  return type is `Omit<FieldDefinition<…>, "isUnanswered" | "incompatibleChanges">` intersected
  with each provided member as a required method (`[R] extends [Absent] ? unknown : { … }`),
  written inline so a plugin's emitted declarations name only `FieldDefinition`. So
  `ratingField.incompatibleChanges(previous, next)` typechecks without `?.` (the rating test calls it
  directly, Proof AC29), and a definition without the member has no such property in its type. The
  widened `FieldDefinition` keeps both members optional, so generic code (`checkVersionHistory`,
  `validateResponse`) uses `definition.incompatibleChanges?.(…)` / `definition.isUnanswered?.(…)`,
  with absence meaning "no rule". A required member is assignable to an optional one, so the
  widening above is unaffected.
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

1. Not a plain object (`null`, `[]`, `"x"`, …) → `invalid` at `[]` and nothing else.
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

- **IDs:** one rule, the public `idSchema` (`^[A-Za-z0-9_-]{1,64}$`), defined once in
  `core/ids.ts`; a mismatch → `invalid` (covers a space, `.` and 65 characters). `parseFormSchema`
  applies it to `fieldId`s; `fields/shared/options.ts` applies it to option IDs through the public
  API (constitution 2), so the pattern is never duplicated. Reserved values are checked where they
  mean something: `__proto__`, `constructor`, `prototype` as `fieldId` in `core/form-schema.ts`;
  `other` as option ID in `fields/shared/options.ts` → `reserved_id {id}`.
- **Not blank:** `title`, `label`, option `label`, `otherLabel`: missing or blank after `trim()` →
  `required`. Text is stored verbatim (no trimming, no Unicode normalisation).
- **Language:** two stages in `core/form-schema.ts`; every refusal is `invalid` at
  `["meta", "language"]`.
  1. **Structural pre-check** (plain string tests, case-insensitive, before any `Intl` call). A tag
     is refused when it (a) equals one of the 26 grandfathered tags of the IANA language subtag
     registry (`i-klingon`, `art-lojban`, `zh-min-nan`, `en-GB-oed`, …; kept as a data list),
     (b) has an extended language subtag, i.e. a 2–3-letter language followed by a 3-letter
     alphabetic subtag, `^[a-z]{2,3}-[a-z]{3}(?:-|$)` (`zh-cmn-Hans`, `zh-yue`), or (c) starts with a
     one-character subtag (`x-private`, `i-…`: private-use-only and irregular grandfathered tags).
     Rules (b) and (c) refuse only shapes that are never valid in a Unicode locale identifier
     (UTS #35: the language subtag has 2–3 or 5–8 letters; a 3-letter second subtag is neither a
     script, a region nor a variant), so no valid tag is lost.
  2. **Canonicalise** with `Intl.getCanonicalLocales(tag)`: a `RangeError` (`en_US`, empty) →
     `invalid`; otherwise the canonical form is returned (`TH` → `th`, `th-th` → `th-TH`). This also
     replaces deprecated aliases (`iw` → `he`); see Risks.

  Why the pre-check: ECMA-402 checks tags against UTS #35 syntax, under which `zh-cmn-Hans` and
  `i-klingon` are already malformed, so a conforming engine throws a `RangeError` for both. The plan
  does not rely on that. Engines have not always conformed (older V8/ICU releases mapped some
  extlang and grandfathered tags, e.g. `zh-cmn-Hans` → `cmn-Hans`, `i-klingon` → `tlh`), and the
  regular grandfathered tags (`art-lojban`, `cel-gaulish`, `zh-guoyu`, …) are well-formed UTS #35
  identifiers that V8 maps through CLDR aliases (`art-lojban` → `jbo`) instead of throwing. With the
  pre-check, every tag in classes (a)–(c) gives `invalid` in Node and Chromium whatever their
  ICU/CLDR versions.

- **Built-in configs and option entries are strict objects** too (owner confirmed 2026-11-05), so
  nothing admin-only can hide inside `config`: each unknown key → `unknown_property {key}` with the
  object's path plus the key, e.g. `["fields", 0, "config", "color"]` or
  `["fields", 0, "config", "options", 1, "color"]`.

### Whole-response validation (R8, R9)

`validateResponse(schema, answers, registry)`:

`schema` is a `parseFormSchema` output (the type says so); configs are not re-parsed, so the
registry must hold the definitions the schema was parsed with.

1. `answers` not a plain object (`null`, array, string, number…) → `answerSet: [invalid]`, return.
2. For each field in schema order: look up `type` in `registry`. **Missing type** (schema read with
   another registry) → `fields[fieldId] = [unknown_field_type {type}]`, path `[]` — the same code
   `parseFormSchema` uses — whether the field is answered or not, the value is not read, nothing
   throws, and the result is `ok: false`, so a registry that does not match the schema can never
   accept a response. Otherwise read the value only with `Object.hasOwn` (a `fieldId` such as
   `toString` must not see `Object.prototype`); absent, `null` or `isUnanswered` → `required` if
   required, else omit; otherwise `definition.answer(config).safeParse(value, { reportInput: true })`
   → output into the normalised set, or issues into `fields[fieldId]`.
3. Every own key of `answers` that is not a schema `fieldId` (including `__proto__`, `constructor`)
   → `unknown_field {fieldId: key}` in the **answer-set group**, path `[]`. Result objects are built
   only from schema `fieldId`s, which can never be `__proto__` (reserved), so no key in the input
   can change another field's result.
4. All fields are always checked. For any JSON input (any value `JSON.parse` can return) the
   package and the built-ins never throw, on every engine with `Intl.Segmenter` (the R20 baseline,
   Risk 10); proven with a hostile-JSON corpus per built-in family (Proof AC12). Exceptions thrown
   by a plugin's own code (its schemas, `isUnanswered`) propagate unchanged — they are bugs, not
   answers (owner confirmed 2026-11-05); a test with a throwing test-local plugin proves it.

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

| Zod issue                                                             | `schema` context (form, config, cell options)                  | `answer` context             |
| --------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------- |
| `invalid_type`, input `undefined` (missing)                           | `required`                                                     | `invalid`                    |
| `invalid_type`, `expected: "int"`                                     | `not_integer`                                                  | `not_integer`                |
| other `invalid_type`                                                  | `invalid`                                                      | `invalid`                    |
| `too_small` / `too_big`, origin `string`                              | `too_short` {min} / `too_long` {max}                           | same                         |
| `too_small` / `too_big`, origin `number`                              | `too_small` {min} / `too_big` {max}                            | same                         |
| `too_small` / `too_big`, origin `array`/`set`                         | `too_few` {min} / `too_many` {max}                             | same                         |
| `unrecognized_keys`                                                   | one `unknown_property` {key} per key, path = object path + key | `invalid` at the object path |
| `custom` with a catalogue code in `params`                            | that code and params                                           | same                         |
| anything else (`invalid_value`, `invalid_format`, `invalid_union`, …) | `invalid`                                                      | `invalid`                    |

Example, `rating` config `max` (`int`, 2–10) in `schema` context, path
`["fields", i, "config", "max"]`: `1` → `too_small {min: 2}`, `11` → `too_big {max: 10}`, `4.5` →
`not_integer` (raised with `customIssue` or mapped from `expected: "int"`; the code is the same).

Missing-vs-wrong-type uses Zod 4's `reportInput: true`; the input is dropped after mapping.
`customIssue(code, params)` is the public way to raise a specific code from a `.refine` /
`.superRefine` / `.check`; an unknown or malformed code in `params` becomes `invalid`, so every code
leaving the package is in the catalogue (AC8). Built-ins raise their own codes with `customIssue`
wherever Zod's encoding is version-sensitive (e.g. `not_integer`, grapheme lengths).

Implementation rules (decided in T006, pinned by `test/issues-rules.test.ts`):

- **"Missing"** means the Zod issue has an own `input` key whose value is `undefined` (Zod 4.6.7
  sets it only under `reportInput: true`). The missing rule is checked first, so it wins over
  `expected: "int"`: a missing value for an int schema is `required` (schema) / `invalid` (answer).
- **Precondition: parse with `{ reportInput: true }`.** Without it Zod deletes `input`, nothing
  counts as missing, and a missing value maps to `invalid` (never `required`), so the fallback can
  only be less specific, never wrong.
- **Exclusive bounds** (`inclusive: false`: `.gt`, `.lt`, `.positive`, `.negative`) and limit issues
  of any other origin (`bigint`, `date`, `file`, …) map to `invalid`: catalogue `{min}` / `{max}`
  are inclusive limits, and turning `gt(0)` into `too_small {min: 0}` would misstate the rule.
  Plugins needing a limit code there raise it with `customIssue`. Zod's origin `int` counts as
  `number`.
- **Every mapped issue is re-parsed with the strict `issueSchema`**; one that does not parse
  becomes `invalid` at the same path. Path keys that are neither strings nor finite numbers (only
  possible from a plugin's own `path`) are converted with `toString()`.
- **`customIssue(code, params)`** returns `{ params: { code, params } }`, i.e. Zod's custom-issue
  `params` carry the catalogue code and its params; `toIssues` reads them with own-key reads.
- **`FieldDefinitionError.message`** is the issue codes in order, joined by `", "`, repeats kept.

### Built-in fields (R10–R17)

One file per type in `src/fields/<type>.ts` (ADR 0007). Shared code that is not a field type lives
in `src/fields/shared/` (`text.ts`, `options.ts`, `calendar.ts`, `decimal.ts`). All of them import
only `src/api.ts` (the public API) and `zod`; ESLint enforces it. Every built-in config is a strict
object (`unknown_property`, see Rules on values).

| Type                             | Key points                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`, `textarea`               | Config `{ minLength?: int ≥ 0, maxLength?: int ≥ 1 }`, min ≤ max else `invalid_range` at `["minLength"]`. Answer: string → `trim()` → length with `countGraphemes` only when a limit is set (`too_short` / `too_long` via `customIssue`). `text` refuses the four ECMAScript line terminators left after trimming (LF, CR, LS, PS) → `invalid`; NEL, VT and FF are accepted; `textarea` keeps everything (no CRLF rewriting). Exact set: "Line breaks in `text`" below. `toCell`: the normalised text.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `number`                         | Config `{ min?, max?, integer = false }` (Zod numbers are finite), min ≤ max else `invalid_range`. Answer: `z.number()` (`"5"` → `invalid`); `not_integer`, inclusive `too_small` / `too_big`. `toCell`: plain decimal, never an exponent (`1e21` → `1000000000000000000000`, `1e-7` → `0.0000001`); see "Number cells" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `rating`                         | Config `{ max: int 2–10 = 5, icon: "star" \| "heart" = "star" }`. Answer: int 1…max. `toCell`: the same plain-decimal helper as `number`. `groupable: true`. `incompatibleChanges: (p, n) => p.max === n.max ? [] : ["max"]` — the only built-in rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `choice`, `dropdown`, `checkbox` | `fields/shared/options.ts` builds config and answer schemas; the three files differ only in `type`, `maxIds` (1 for choice/dropdown) and checkbox `minSelections` / `maxSelections`. Config: `options` (≥ 1 strict `{id, label}`, `id` through `idSchema`, `duplicate_option_id`, `reserved_id` for `other`), `allowOther = false`, `otherLabel` required when `allowOther`; checkbox `minSelections` ≥ 0 and `maxSelections` ≥ 1 with the `invalid_range` rules of "Option fields" below. Answer: strict `{ optionIds: string[], other?: string }` with the R14 rules; `other` selected with `other` missing, `null` or blank → `other_text_required`; `other` key present while not selected → `invalid` at `["other"]`; output trims `other`. Cells: known options in config order, then unknown IDs in answer order, then "Other" (exact rule below), joined by `; `. Stored values: `optionIds` in answer order. |
| `date`                           | Config `{ includeTime = false }`. `storeAs: { kinds: ["date", "datetime"], pick: c => c.includeTime ? "datetime" : "date" }`. Calendar logic in `fields/shared/calendar.ts` (see below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `file`                           | Config `{ maxFiles: int ≥ 1 = 1, maxSize?: int ≥ 1, allowedTypes?: mime[] (≥ 1 entry) }`, MIME = RFC 6838 restricted names, subtype may be `*` (`image/*`), `*/*` refused. Answer: array of strings; empty string → `invalid` at `[i]`, repeat → `duplicate {value}`, over `maxFiles` → `too_many {max}`. `toCell`: IDs joined by `; `. Stored values: the IDs (`text`). `summarize: "count"`. (ADR 0011 as amended.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Line breaks in `text` (R10)

- **Order:** `trim()` first (it removes ECMAScript WhiteSpace and LineTerminator characters at both
  ends, including VT and FF but not NEL), then the check. So `"hi\n"` is accepted as `"hi"`, and
  text that is blank after trimming is unanswered (R9).
- **Refused inside a trimmed `text` answer** → `invalid`: exactly the four ECMAScript
  LineTerminators — LF U+000A, CR U+000D (so CRLF too), LS U+2028, PS U+2029.
- **Accepted and kept verbatim:** NEL U+0085, VT U+000B, FF U+000C. They are not line terminators
  in ECMAScript, and NEL is not whitespace for `trim()` either.
- **`textarea`** refuses none of them and keeps them verbatim; `\r\n` stays `\r\n` and counts as
  one grapheme (AC15).

### Number cells: plain decimal, never an exponent (R11; owner decision 2026-11-05)

`number` and `rating` cells use one internal helper, `toPlainDecimal(n)` in
`fields/shared/decimal.ts` (not public: the surface stays minimal; plugins format their own cells).

- **Output:** optional leading `-`, ASCII digits, at most one `.`, no grouping, never an exponent;
  every cell matches `^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$`. `1e21` → `1000000000000000000000`,
  `1e-7` → `0.0000001`, `-0` → `0`.
- **Digits:** exactly those of `String(n)` (ECMAScript `Number::toString`: locale-free, the
  shortest digit string that converts back to `n`); only the decimal point moves. String work
  only: no float arithmetic, no `toFixed` (switches to an exponent from 1e21 and prints the binary
  expansion), no `toPrecision`, no `Intl` or `toLocaleString`.
- **Steps:** `s = String(n)`. No `e` in `s` → return `s` (already plain for 1e-6 ≤ |n| < 1e21 and
  for 0). Otherwise split `s` into the sign, the digit string `d` (mantissa without its `.`) and
  the integer exponent `e`; the point goes after `p = e + 1` digits:
  `p ≥ d.length` → `sign + d + "0".repeat(p − d.length)`;
  `p ≤ 0` → `sign + "0." + "0".repeat(−p) + d`;
  otherwise `sign + d.slice(0, p) + "." + d.slice(p)`.
- **Exact for every finite double:** the cell has the same ≤ 17 significant digits as `String(n)`,
  and ECMAScript's string-to-number conversion is correctly rounded at that length, so
  `Number(cell) === n` for every finite `n` (`-0` gives `"0"`, equal by `===`). Longest outputs:
  `Number.MAX_VALUE` (309 digits) and `Number.MIN_VALUE` (`0.`, 323 zeros, `5`). Node and Chromium
  both run V8, so their digits are identical; ECMAScript lets another engine pick a different last
  digit of the same length in rare ties, which still converts back to the same number.
- Answers are finite (Zod numbers), so `NaN` and `±Infinity` never reach `toCell`.

### Option fields: checkbox limits, option IDs and cells (R13, R14)

- **Checkbox limits** (paths inside the field's config): `minSelections` int ≥ 0; `maxSelections`
  int ≥ 1, so `0` → `too_small {min: 1}` (owner decision 2026-11-05). Then each failing rule gives
  its own issue at `["minSelections"]`: `minSelections` > `maxSelections` →
  `invalid_range {min: minSelections, max: maxSelections}`; `minSelections` > the selectable count
  (options, plus 1 when `allowOther`) → `invalid_range {min: minSelections, max: selectable count}`.
  A `maxSelections` above the selectable count is accepted (it never binds). The limits apply only
  when the field is answered (R14).
- **Option entries** (paths inside `["options", j]`): `id` through the public `idSchema`
  (`invalid`); a repeat within the same field → `duplicate_option_id {optionId}` at the repeat's
  `["id"]`; `other` → `reserved_id {id: "other"}` at `["id"]`; an extra key →
  `unknown_property {key}` at `[key]`. The same ID in two fields is allowed (IDs are per field).
- **`otherLabel`:** required and non-blank when `allowOther` is true; allowed and kept when it is
  false, so "Other" can be switched off and on again without retyping the label.
- **Cells** — `toCell(answer, config)` with the config it is given (007 may pass another version's),
  items joined by `; `:
  1. each selected ID that is an option of the given config, written as its label, in **config
     order**;
  2. each selected ID the given config does not have (other than `other`), written as the ID
     itself, in **answer order**;
  3. `other` last, written as `<otherLabel>: <text>` when the given config has an `otherLabel`
     (even if `allowOther` is now false), else `other: <text>`; `<text>` is the normalised
     (trimmed) "Other" text.

  `choice` and `dropdown` answers hold at most one ID, so their cell is that single item. Labels
  and text are written raw (007 quotes them and neutralises formula injection).

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
- **`CellOptions` and `parseCellOptions`:** `core/cell-options.ts` holds one internal Zod schema,
  `{ timeZone?: string }` branded, and `CellOptions` is its `z.output`. It is split over two steps:
  - **US1 step (Order step 3, T010):** the schema shape and the branded `CellOptions` type, because
    `defineField`'s `toCell(answer, config, options?: CellOptions)` needs the type. No behaviour is
    added here, so nothing is untested.
  - **US6 step (Order step 8, T025):** test-first with `cell-options.test.ts`, the refinement that
    creates an `Intl.DateTimeFormat` with the zone (a `RangeError`, an empty string, or an
    offset-style zone such as `+07:00`, accepted by some engines but not IANA →
    `invalid_time_zone {timeZone}`), plus `parseCellOptions` and its runtime export.

  The schema itself is never exported, so the only way to get a `CellOptions` without a cast is
  `parseCellOptions`: `toCell` can only receive a validated zone.

### IDs (R18; ADR 0012)

`generateId()`: 9 bytes from `globalThis.crypto.getRandomValues` (Web Crypto in Node 24 and every
browser, no `node:crypto` import, works outside secure contexts) encoded as 12 base64url characters
(`A–Z a–z 0–9 - _`), i.e. 72 random bits, no padding, no modulo bias. Always passes `idSchema`
(R5's ID rule).
It can never equal a reserved value (`__proto__` 9, `constructor` 11, `prototype` 9, `other` 5
characters), so no retry loop. Same function for fields and options; never derived from labels.

### Version history (R19; ADR 0009 as amended)

`checkVersionHistory(earlier, candidate, registry)`. Callers pass schemas read with
`parseFormSchema` (so a removed plugin already fails there with `unknown_field_type`) and the stored
version numbers, which the schema itself does not contain.

- **History input first.** `earlier` may come in any order. Each `version` must be a positive safe
  integer (`Number.isSafeInteger(v) && v >= 1`), else `invalid` at `["earlier", k, "version"]`
  (`k` = index in `earlier` as passed); a `version` already seen → `duplicate {value: version}` at
  the repeat's `["earlier", k, "version"]`. If any such issue exists, only those are returned and
  nothing is compared (like the schema-version gate). An empty `earlier` (never published) → `ok`.
- **"Latest" means the highest `version` number**, whatever the array order. For each candidate
  field, walk the earlier versions from the highest `version` down and stop at the first version
  where the same `fieldId` conflicts:

1. different `type` → `field_type_changed {fieldId, previousType, type, version}`;
2. else `storeAsOf` differs → `field_kind_changed {fieldId, type, previousStoreAs, storeAs, version}`;
3. else the definition's `incompatibleChanges(previousConfig, config)` is non-empty →
   `field_config_incompatible {fieldId, type, properties, version}`.

One issue per conflicting `fieldId`, path `["fields", i]` (inside the candidate); `version` is the
earlier version's number. Everything comes from the registry's definitions; there is no built-in
special case, so a third-party `rating` without a rule accepts a `max` change (AC29). Removed fields
and re-added fields are handled naturally because every earlier version is compared. Check 1
compares `type` strings and needs no lookup; checks 2–3 use the definition of that (shared) `type`.
If the registry has none (schemas read with another registry) → `unknown_field_type {type}` at
`["fields", i, "type"]`, that field is skipped, nothing throws.

### Zod version and package shape (ADR 0004, ADR 0012)

- **Zod 4.6.7** (the version `apps/web` already pins), classic API (`import * as z from "zod"`).
  Declared as a **peer dependency** `"zod": "^4.6.0"` plus the pinned devDependency, so the app, the
  package and every plugin share one Zod copy and one set of inferred types (two copies of Zod 4 can
  make `ZodType` types from different versions incompatible). Zod 3 is not supported. The manifest
  test checks that `zod` is the only name across `dependencies`, `peerDependencies` and
  `optionalDependencies` (AC2). **Owner decision** (see summary).
- tsdown stays `platform: "neutral"`, ESM + `.d.ts`; peers are external, so `dist` imports only
  `zod` and relative files.
- **`exports` keeps exactly two keys:** `.` (`types` + `import`, ADR 0004) and `./package.json`.
  The second stays because tooling (bundlers, `publint`, type resolvers) reads the manifest
  through it; it exposes no code. No subpath exposes internals.
- **R20 guard rails** in the root `eslint.config.mjs`, for `packages/schema/src/**`:
  `no-restricted-imports` (every `node:*` and bare built-in name from `module.builtinModules`,
  `react*`); `no-restricted-globals` (`process`, `Buffer`, `require`, `global`, `__dirname`,
  `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator`, `window`, `document`, `localStorage`);
  `no-restricted-properties` for local-time and locale APIs (`getTimezoneOffset`, `getHours`,
  `getDate`, `getMonth`, `getFullYear`, `getDay`, `getMinutes`, `getSeconds`, the matching local
  setters, `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString`, `Date.parse`). A second
  block for `src/fields/**` repeats those patterns (flat config replaces rule options) and adds
  `**/core/**` (constitution 2).
- **TSDoc** (plugin authors' docs): every public export gets a TSDoc comment. This is a deliverable
  of task T033, checked in review; there is no ESLint TSDoc rule or plugin.

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
        // only when set, so CI (which installs its own Chromium) uses Playwright's default
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
        contextOptions: { locale: "th-TH", timezoneId: "Pacific/Kiritimati" },
      }),
    }
    ```

    Both configs set `test.name` (`node`, `chromium`) so the reporter labels the engine. T002 built
    exactly this; the option names were checked against `@vitest/browser-playwright` 5.1.0 types.

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

| Path                                                                                   | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                                                         | `peerDependencies.zod` `^4.6.0`; devDeps `zod` 4.6.7, `@vitest/browser-playwright` 5.1.0, `playwright` 1.64.1; `test:browser` script                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `turbo.json`                                                                           | `test:browser` depends on `^build` and its own `build` (dist smoke)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `vitest.config.ts`                                                                     | Node project: shared + `test/node`, `env.TZ`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `vitest.browser.config.ts` (new)                                                       | Chromium project via Playwright provider, `executablePath` from env, `th-TH` / `Pacific/Kiritimati` context                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `tsconfig.json`                                                                        | Verify only (step 3): `include` already covers `test/**` (so `test/types/*.test-d.ts`) and `*.config.ts` (so `vitest.browser.config.ts`); edit only if `pnpm typecheck` misses them.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `tsdown.config.ts`                                                                     | Verify only (step 10): one entry, `platform: "neutral"`, ESM + `.d.ts`; edit only if `build-output.test.ts` finds Zod bundled or a non-relative import other than `zod`                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/index.ts`                                                                         | Public barrel: `api.ts` + built-ins; replaces the `VERSION` placeholder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/api.ts` (new)                                                                     | Public API without built-ins; the only module `src/fields/**` may import                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/core/issues.ts`                                                                   | `issueSchema`, `Issue`, `IssueCode`, `customIssue`, Zod-issue mapping, result helpers, `FieldDefinitionError` (R4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/core/json.ts`                                                                     | `isPlainObject`, own-key reads (`Object.hasOwn`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/core/define-field.ts`                                                             | `defineField`, `FieldDefinition`, `storeAsOf`, `StoreAs` / `Summarize` (Zod enums, types inferred), fit table, definition checks; throws `FieldDefinitionError` from `issues.ts` (R1, R2)                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/core/registry.ts`                                                                 | `createFieldRegistry` (R3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/core/ids.ts`                                                                      | `idSchema` (the only copy of the ID pattern, public), reserved `fieldId`s, `generateId` (R5, R18)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/core/text.ts`                                                                     | `countGraphemes` (R10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/core/cell-options.ts`                                                             | Created in step 3 (T010): the cell-options Zod schema and the branded `CellOptions` type that `toCell` needs (R1). Step 8 (T025): the time-zone refinement and `parseCellOptions` (R16)                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/core/form-schema.ts`                                                              | Form Schema v1 shapes, `FormSchema` types, migration loop, `parseFormSchema`, language rule (structural pre-check for grandfathered, extlang and one-character-first-subtag tags, then `Intl.getCanonicalLocales`) (R5–R7)                                                                                                                                                                                                                                                                                                                                                              |
| `src/core/response.ts`                                                                 | `validateResponse`, `AnswerSet` (R8, R9)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/core/version-history.ts`                                                          | `checkVersionHistory` (R19)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/fields/{text,textarea,number,rating,choice,dropdown,checkbox,date,file}.ts`       | The nine built-ins, public API only (R10–R17, ADR 0007 layout)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/fields/shared/{text,options,calendar,decimal}.ts`                                 | Shared builders: text pair, option fields (option IDs through `idSchema`, reserved `other`), date parsing and zoned cells, plain-decimal number cells (`decimal.ts`, new for F04)                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/fields/index.ts`                                                                  | `builtInFields` array                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `test/node/dist.test.ts` (moved from `test/`)                                          | Built entry importable; checks `defineField` instead of `VERSION` (ADR 0004)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `test/node/manifest.test.ts` (from `test/no-react.test.ts`)                            | No UI library in deps/peer/optional; `zod` is the only name (AC2); `exports` keys are exactly `.` (`types` + `import`) and `./package.json`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `test/node/build-output.test.ts` (new)                                                 | Scans `dist/**/*.js`: only `zod` and relative imports, no built-ins, no `process`/`Buffer`/`require` (AC2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `test/node/time-zone-independence.test.ts` (new)                                       | Flips `process.env.TZ` between two zones, re-runs date/cell cases, outputs identical (AC23)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `test/browser/engine.test.ts`, `test/browser/dist-smoke.test.ts` (new)                 | Real Chromium guard; built artifact runs the AC1 flow in Chromium (AC1, AC28)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `test/helpers/issues.ts` (new)                                                         | `expectIssues(...)`: every failure assertion also parses the issues with strict `issueSchema` (AC8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `test/fixtures/third-party.ts` (new)                                                   | Fixture plugins: `acme/signature` (own unanswered rule and compatibility rule), `acme/measure` (config-dependent `storeAs`), `acme/note` (`storeAs: none`)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `test/fixtures/date-cases.ts` (new)                                                    | Shared date/cell case table for Node, Chromium and the TZ flip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `test/fixtures/hostile-json.ts` (new)                                                  | Shared corpus of hostile JSON values (what `JSON.parse` can return: wrong types, empty and blank strings, `-0`, `1e308`, arrays of mixed types, wrong option-answer shapes, own `__proto__` / `constructor` keys, a 10,000-deep nested array); created in step 5, reused by every family test and `builtins.test.ts` (AC12)                                                                                                                                                                                                                                                             |
| `test/smoke.test.ts` (new in step 1, deleted in step 2)                                | Trivial shared test that proves both engines run before any feature code; deleted by the step-2 commit that adds `test/issues.test.ts`, the first real shared test                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `test/issues.test.ts`                                                                  | Catalogue equals R4's 29 codes; Zod mapping per context (incl. the `unknown_property` path); `customIssue`; `FieldDefinitionError` (AC8)                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `test/issues-rules.test.ts` (new)                                                      | Rules decided in T006 (missing for int, exclusive bounds, no `reportInput`, `FieldDefinitionError.message`), `json.ts` and result helpers (AC8)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `test/public-api.test.ts`                                                              | Pinned list of runtime exports, no registry among them (AC4). Created in step 3; edited in the same commit by every step that adds a runtime export: 3 (`defineField`, `createFieldRegistry`, `storeAsOf`, `FieldDefinitionError`, `customIssue`, `issueSchema`), 4 (`CURRENT_SCHEMA_VERSION`, `parseFormSchema`, `idSchema`), 5 (`validateResponse`), 6 (`countGraphemes`), 8 (`parseCellOptions`), 9 (`generateId`, `checkVersionHistory`), 10 (the nine definitions, `builtInFields`)                                                                                                |
| `test/define-field.test.ts`, `test/registry.test.ts`                                   | AC4–AC7 (fixture parts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `test/types/define-field.test-d.ts`                                                    | Inferred types and `@ts-expect-error` cases, checked by `pnpm typecheck` (AC3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `test/form-schema.test.ts`                                                             | Fixture-only registry: AC9 (fixture part), AC10 rows that need no built-in, AC11, migration loop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `test/response.test.ts`                                                                | AC12–AC14, idempotent re-validation, schema type missing from the registry, a throwing test-local plugin propagates                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `test/graphemes.test.ts`, `test/fields/{text,number,rating,options,date,file}.test.ts` | AC15–AC24, and per family before its implementation: analytics (AC6), stored values (AC7), the built-in config defaults written in and re-parsing equal (AC9: `number.test.ts` / `rating.test.ts` for `integer` and `max` / `icon`, `options.test.ts` for `allowOther`, `date.test.ts` for `includeTime`, `file.test.ts` for `maxFiles`; text has none), config rows of AC10 (incl. an unknown config key; option-ID rows in `options.test.ts`), unanswered rows (AC13), hostile-JSON rows (AC12); `rating.test.ts` also holds the direct `ratingField.incompatibleChanges` rows (AC29) |
| `test/cell-options.test.ts`                                                            | `invalid_time_zone` cases (AC23)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `test/builtins.test.ts`                                                                | Final cross-check over `builtInFields`: analytics (AC6), stored values (AC7), one no-`config` parse and re-parse loop cross-checking the family-owned defaults (AC9), unanswered rows (AC13), unknown config key and hostile corpus for all nine                                                                                                                                                                                                                                                                                                                                        |
| `test/exit-check.test.ts`                                                              | ADR 0006 exit check (AC1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `test/ids.test.ts`                                                                     | AC25 (pattern checked with `idSchema`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `test/version-history.test.ts`                                                         | AC26, AC27, AC29; history input (latest = highest `version`, duplicate and non-positive-integer versions), registry lookup miss                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

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

| Path                                                    | Reason                                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/work/001-field-core/plan.md`                      | This plan                                                                                                                                                              |
| `docs/adr/0003-i18n.md`                                 | Amended: single-language form content, no `LocalizedText` (spec Flag 6)                                                                                                |
| `docs/adr/0007-headless-field-core-and-ui-binding.md`   | Amended: `datetime`, `summarize` set incl. `none`, stored values, unanswered hook, compatibility rule, `toCell(answer, config, options)` (Flags 3, 7)                  |
| `docs/adr/0009-form-versioning-and-stable-field-ids.md` | Amended: same `fieldId` keeps type, stored kind and declared-compatible config; three codes (Flag 7)                                                                   |
| `docs/adr/0011-file-field-and-object-storage.md`        | Updated, still Proposed: answer = file IDs, `storeAs: "text"`, `toCell` writes IDs (Flag 4)                                                                            |
| `docs/adr/0012-form-schema-v1-contract.md` (new)        | `schemaVersion` + migrate-on-read, error catalogue, grapheme counting, UTC rule, IDs, Zod as peer; revised after `/analyze`: the ID rule is public as `idSchema` (F09) |

## Order

Each step is one Conventional Commit (or a few) that leaves `pnpm format:check`, `lint`,
`typecheck`, `test` and `test:browser` green, tests written first. Story steps are independent
increments; steps 7 and 8 are exactly what moves to `001b` if `/tasks` exceeds 40 (Risks).

Every step that adds a runtime export edits `test/public-api.test.ts` in the same commit (list in
Files to touch). Each built-in family's test asserts that family's analytics (AC6), stored values
(AC7), its built-in config defaults written in and re-parsing to an equal value (AC9; the text
family has none), an unknown config key (AC10) and the hostile-JSON corpus (AC12) **before** the
family is implemented; the rating test also asserts the rating rule's direct
`incompatibleChanges` rows (AC29) before `rating` exists. Step 10's `builtins.test.ts` only
cross-checks the nine together.

1. **Setup — two engines** (`chore(schema)`): Zod peer + dev dependency; browser devDeps;
   `vitest.config.ts` / `vitest.browser.config.ts`; move the two existing tests to `test/node/`;
   `test/browser/engine.test.ts` and a trivial shared `test/smoke.test.ts`; root and package
   `test:browser`, turbo task and env pass-through; CI step order; ESLint R20 and fields-import
   rules. Exit: `smoke.test.ts` passes in Node and in Chromium with `PLAYWRIGHT_CHROMIUM_PATH` set.
   This is the spike for Risk 2 — decide on the fallback here, before any feature code.
2. **Foundational — error catalogue** (`feat(schema)`): `issueSchema`, mapping, `customIssue`,
   `FieldDefinitionError`,
   `test/helpers/issues.ts`, `test/issues.test.ts`, `core/json.ts`; deletes `test/smoke.test.ts`
   (`issues.test.ts` is now the first real shared test).
3. **US1 — define and register** (`feat(schema)`): fixtures; `define-field.test.ts`,
   `registry.test.ts`, `types/define-field.test-d.ts`; then `defineField`, `storeAsOf`
   (throwing the step-2 `FieldDefinitionError`), `core/cell-options.ts` with the cell-options schema and branded
   `CellOptions` type (needed by `toCell`'s signature; exported as a type only), `createFieldRegistry`,
   `api.ts`, `index.ts`, `public-api.test.ts` (created). Proves AC3, AC5, AC6 (pairs), AC7 (`none`
   fixture), AC4 (registry part).
4. **US2 — Form Schema** (`feat(schema)`): `form-schema.test.ts` with a fixture-only registry; then
   `idSchema` and reserved `fieldId`s, v1 shapes, language (structural pre-check, then
   canonicalisation), migration loop, `parseFormSchema`;
   exports `CURRENT_SCHEMA_VERSION`, `parseFormSchema`, `idSchema`. Proves AC9 (fixture part), the
   AC10 rows that need no built-in (`fieldId` rules incl. `__proto__`, unknown type, unknown
   properties at form, meta and field level, blank title or label, language), AC11, AC4 (`text`
   unknown without built-ins). The option-ID rows of AC10 need option fields: step 7.
5. **US3 — whole response** (`feat(schema)`): `response.test.ts` with fixture fields and
   `fixtures/hostile-json.ts`; then `validateResponse`. Proves AC12 (incl. a schema type missing
   from the registry and a throwing plugin propagating), AC13 (absent, `null`, unknown keys), AC14.
6. **US4 — scalar built-ins** (`feat(schema)`): `graphemes.test.ts`, `fields/text|number|rating`
   tests, each with its family rows (AC6, AC7, unknown config key, hostile corpus), the built-in
   defaults in `number.test.ts` / `rating.test.ts` (`number` `integer` false, `rating` `max` 5 and
   `icon` `star`, written in and re-parsing equal, AC9), the rating rule's direct rows in
   `rating.test.ts` (`ratingField.incompatibleChanges` gives `["max"]` for a `max` change and `[]`
   for an `icon`-only change, AC29), the number cell rows (plain decimal, round-trip sweep), the
   config rows of AC10 (rating `max` 11, text min > max, unknown config key) and the blank-text
   rows of AC13, and `exit-check.test.ts` — all written first, as in T016/T017; then
   `countGraphemes`, `fields/shared/text.ts`, `fields/shared/decimal.ts`, `text`, `textarea`,
   `number`, `rating` (`exit-check.test.ts` goes green with `ratingField`). Proves AC1, AC15–AC17,
   AC9 (number and rating), AC29 (rating rule part) and those rows. **First usable increment for
   002's text/number/rating work.**
7. **US5 — option built-ins** (`feat(schema)`): `fields/options.test.ts` with its family rows (AC6,
   AC7, the `allowOther` false default for AC9, hostile corpus), the checkbox limit rows, the cell-order and `otherLabel` rows, and the
   **option-ID rows of AC10 through `parseFormSchema` with the option built-ins** (repeated option
   ID within a field → `duplicate_option_id`, the same ID in two fields passes, option ID `other` →
   `reserved_id`); then `fields/shared/options.ts` (option IDs through `idSchema`), `choice`,
   `dropdown`, `checkbox`; empty-selection rows of AC13. Proves AC18–AC20 and those rows.
8. **US6 — date and file** (`feat(schema)`): `cell-options.test.ts`, `fixtures/date-cases.ts`,
   `fields/date.test.ts`, `node/time-zone-independence.test.ts`, `fields/file.test.ts`, the last
   two family tests with their family rows (AC6 with `date` both ways, AC7, the `includeTime` and
   `maxFiles` defaults for AC9, unknown config key, hostile corpus); then the time-zone refinement
   and `parseCellOptions` in `core/cell-options.ts` (schema and type exist since step 3),
   `fields/shared/calendar.ts`, `date`, `file`;
   empty-file-list rows of AC13. Proves AC21–AC24 and those rows.
9. **US7 — identity across versions** (`feat(schema)`): `ids.test.ts`, `version-history.test.ts`
   (incl. the history-input rows); then `generateId`, `checkVersionHistory`. Proves AC25–AC27,
   AC29.
10. **Polish and exit check** (`feat(schema)`, `test(schema)`, `docs:`): `fields/index.ts`
    (`builtInFields`), barrel exports of the nine, and `builtins.test.ts` (nine-field cross-check
    of AC6, AC7, AC9, AC13, unknown config key and hostile corpus); `node/manifest.test.ts`,
    `node/build-output.test.ts`, `node/dist.test.ts`, `browser/dist-smoke.test.ts` (AC2, AC1 on the
    artifact); changeset; `docs/standards.md`; main session updates `CLAUDE.md` and
    `.claude/settings.json`; full proof run (AC28): `pnpm format:check`, `pnpm lint`,
    `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:browser`.

## Risks

| Risk                                                                                                                                                                                                       | Detection / mitigation                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Unicode parity.** Node and browsers ship their own ICU/Unicode data; grapheme rules change between Unicode versions; Firefox/Safari are not tested (spec Flag 8).                                     | AC15 cases (stable Thai and emoji rules) run in Node and Chromium on every CI run, plus a small canary corpus in `graphemes.test.ts`. One function (`countGraphemes`) to swap for a vendored segmenter if a mismatch appears (ADR 0012). Residual risk for other engines is accepted until the owner adds them.                                                                                |
| **2. Browser tooling.** Vitest 5 browser-mode API details, nested projects, or the preinstalled Chromium 1243 vs Playwright 1.64.1's expected 1248; Turbo strict env drops the path variable.              | Step 1 is a spike that must pass before feature code; `engine.test.ts` fails loudly if the run is not real Chromium. `PLAYWRIGHT_CHROMIUM_PATH` passed through Turbo. CI installs the matching revision. Fallback: Playwright test evaluating the built bundle (Design).                                                                                                                       |
| **3. Type inference.** Deep generics over Zod 4 could slow `tsc`, give poor inference, or emit TS2742 ("inferred type cannot be named") in `.d.ts` for the built-in constants.                             | Three generics plus `K`, `NoInfer` on dependent members; AC3 type tests and `pnpm build` run from step 3 on. If TS2742 appears, annotate the exported built-ins with `FieldDefinition<"rating", z.output<typeof ratingConfig>, z.output<…>>` (still inferred, not hand-written).                                                                                                               |
| **4. Zod internals in the mapping.** `expected: "int"`, `origin`, `reportInput` are Zod 4 details that could shift between minors.                                                                         | `issues.test.ts` pins every mapping row; built-ins raise version-sensitive codes through `customIssue`; peer range starts at the tested `4.6`. Dependabot bumps run the suite.                                                                                                                                                                                                                 |
| **5. Public API frozen early.** Property names, answer shapes, `type` strings and codes become permanent with the first stored form, and the npm release in 009 publishes them.                            | Minimal surface, pinned by `public-api.test.ts`; internals not exported (`exports` keys are exactly `.` and `./package.json`, asserted by `manifest.test.ts`); ADR 0012 lists what is frozen; pre-1.0 changeset is `minor`. Format changes after release go through `schemaVersion` + migration.                                                                                               |
| **6. Size at the limit.** 20/20 requirements; estimated 36–42 tasks against the 40-task limit.                                                                                                             | `/tasks` groups tests per field family and pairs small test+impl tasks. If the count exceeds 40, apply spec Flag 9: steps 7–8 move to `001b` together with every AC row that needs option/date/file fields (AC6, AC7, AC9, AC12 hostile-corpus and AC13 rows of those families; AC10 option-ID rows; AC27 `date` case; AC29 option-field and `file` rows), and step 9 runs right after step 6. |
| **7. Prototype keys and inherited properties** (`__proto__`, `constructor`, a `fieldId` named `toString`).                                                                                                 | Reads use `Object.hasOwn`; results are built from schema `fieldId`s only; reserved IDs; tests cover all three keys.                                                                                                                                                                                                                                                                            |
| **8. Time-zone data drift** (tzdata differs between Node and Chromium for future rule changes).                                                                                                            | Tests use long-stable zones and 2026 dates (Bangkok, New York, Kiritimati, Pago Pago). CSV zone choice stays with 007.                                                                                                                                                                                                                                                                         |
| **9. Language canonicalisation** — `Intl.getCanonicalLocales` also replaces deprecated aliases (`iw` → `he`) with engine-dependent CLDR data, and engines have differed on extlang and grandfathered tags. | Tests use stable tags (`th`, `TH`, `th-TH`, `en`); the server's parse is the stored one (003/005 re-parse). Extlang, grandfathered and private-use-only tags are refused by a structural pre-check before any `Intl` call (Rules on values), so their result never depends on the engine. Reported to the owner as a nuance of R5 "canonical case".                                            |
| **10. Engines without `Intl.Segmenter`.**                                                                                                                                                                  | Lazy creation: import never fails, counting throws only where a length limit is set. Baseline documented in ADR 0012; all supported targets have it. This is the one stated exception to "built-ins never throw" (Design, whole-response validation).                                                                                                                                          |
| **11. Plugin misbehaviour** (throwing inside rules, wrong stored-value kinds, `storeAs` or rule changes between plugin releases).                                                                          | Not swallowed (owner confirmed 2026-11-05); a test with a throwing test-local plugin proves the exception propagates. R8's never-throw promise covers the package and built-ins, proven with the hostile-JSON corpus per family and across all nine. Types catch wrong kinds for TypeScript plugins. History conflicts block the next publish, never change stored data (ADR 0009 as amended). |
| **12. Performance** — answer schemas are built per `validateResponse` call; one `Intl.DateTimeFormat` per zone.                                                                                            | Fine for MVP form sizes; formatters cached per zone; memoising answer schemas per field entry is a later, internal change.                                                                                                                                                                                                                                                                     |

## Proof

N = Node project (`pnpm test`), C = Chromium project (`pnpm test:browser`), T = `pnpm typecheck`.
Every failure assertion goes through `test/helpers/issues.ts`, which also validates the issues
against the strict `issueSchema` (that is how AC8 covers every failure case).

| AC   | Proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Runs in           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| AC1  | `test/exit-check.test.ts` — one `createFieldRegistry([ratingField, acmeSignature])`, a schema using both parses, a response validates; `test/browser/dist-smoke.test.ts` repeats it against the built `dist/index.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | N, C              |
| AC2  | `pnpm build`; `test/node/manifest.test.ts` (no UI library in deps/peer/optional; only `zod`; `exports` keys exactly `.` and `./package.json`); `test/node/build-output.test.ts` (dist imports only `zod` and relative files, no Node built-in); `test/node/dist.test.ts` (ESM + types)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | N (after build)   |
| AC3  | `test/types/define-field.test-d.ts` — `expectTypeOf` for rating and fixture config/answer types; `@ts-expect-error` on wrong-typed `toCell`, `storedValues`, `incompatibleChanges`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | T                 |
| AC4  | `test/registry.test.ts` (third-party `text` accepted), `test/form-schema.test.ts` (`text` without built-ins → `unknown_field_type`), `test/public-api.test.ts` (no registry among exports)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | N, C              |
| AC5  | `test/registry.test.ts` — `duplicate_field_type`; `Text`, `my type`, `a/b/c` → `invalid_field_type`; `acme/signature` accepted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | N, C              |
| AC6  | `test/define-field.test.ts` (all 35 `summarize` × `storeAs` pairs); each family test before its implementation — `test/fields/{text,number,rating,options,date,file}.test.ts` — asserts its definitions' `storeAsOf`, `summarize` and `groupable` against the spec table (`date` with `includeTime` false and true); `test/builtins.test.ts` cross-checks all nine from `builtInFields`, `groupable` true for exactly the four                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | N, C              |
| AC7  | `test/define-field.test.ts` (`acme/note` → `[]`); each family test before its implementation: text/textarea → the trimmed text; number, rating → the number; checkbox `{ optionIds: ["Qm2xT8aLp0vW", "other"], other: "TikTok" }` → `["Qm2xT8aLp0vW", "other"]` without the text; `choice` "Other" → `["other"]`; date-only → one `date`, date-time → one `datetime`; two file IDs → two `text` values; `test/builtins.test.ts` repeats the list over all nine as cross-check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | N, C              |
| AC8  | `test/helpers/issues.ts` (strict `issueSchema` parse on every asserted failure in AC4–AC27, AC29); `test/issues.test.ts` (catalogue equals R4's list; `FieldDefinitionError.issues`; no `message` key)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | N, C              |
| AC9  | `test/form-schema.test.ts` (fixture defaults, `required` false, re-parse equal, `TH` → `th`, `th-th` → `th-TH`). Built-in defaults are owned by the family tests, each through `parseFormSchema` with no `config`, the default written into the output and the output re-parsing to an equal value: `test/fields/rating.test.ts` (`max` 5, `icon` `star`) and `test/fields/number.test.ts` (`integer` false), both T017; `test/fields/options.test.ts` (`allowOther` false for `choice`, `dropdown`, `checkbox`, T020); `test/fields/date.test.ts` (`includeTime` false, T022); `test/fields/file.test.ts` (`maxFiles` 1, T024); the text family has none. `test/builtins.test.ts` (T032) is the cross-check loop over all nine, not a second copy of those rows                                                                                                                                                                                                                                                                                                                                                                 | N, C              |
| AC10 | Each with code and path. `test/form-schema.test.ts` (fixture-only registry): repeated `fieldId`; `fieldId` `__proto__` → `reserved_id`; `fieldId` with a space, `.` or 65 characters → `invalid`; unknown type; unknown property at form, meta and field level; blank title or label; language `en_US`, `x-private` (private-use-only), `zh-cmn-Hans` (extended language subtag), `i-klingon` (grandfathered) or empty → `invalid` at `["meta", "language"]`, the last three classes refused by the structural pre-check in both engines. Through `parseFormSchema` with built-ins: `test/fields/text.test.ts` (text `minLength` > `maxLength` → `invalid_range`); `test/fields/rating.test.ts` (rating `max` 11 → `too_big {max: 10}` at `["fields", 0, "config", "max"]`; `{ "max": 5, "color": "red" }` → `unknown_property {key: "color"}` at `["fields", 0, "config", "color"]`); `test/fields/options.test.ts`, US5 step (repeated option ID in one field → `duplicate_option_id`, the same option ID in two fields passes, option ID `other` → `reserved_id`); every other family test has its own unknown-config-key row | N, C              |
| AC11 | `test/form-schema.test.ts` — `1` accepted; missing, `0`, `2`, `"1"` → only `unsupported_schema_version`; non-object input `null`, `[]`, `"x"` → only `invalid` at the root `[]`, no other issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | N, C              |
| AC12 | `test/response.test.ts` — normalised set; three bad fields → three groups; `null`, `[]`, `"x"`, `1`, nested garbage → whole-set `invalid`, no throw; a schema type missing from the registry → `unknown_field_type` in that field's group, answered or not, no throw; a test-local plugin whose answer schema throws → the exception propagates. Built-ins never throw: each family test validates every value of `test/fixtures/hostile-json.ts` as its fields' answer (no throw, every issue in the catalogue); `test/builtins.test.ts` repeats it for all nine, as answers and as `config` through `parseFormSchema`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | N, C              |
| AC13 | `test/response.test.ts` (absent, `null`, `__proto__`, `constructor` keys); family tests, required vs optional: `text.test.ts` (blank text), `options.test.ts` (empty selection), `file.test.ts` (empty file list); `test/builtins.test.ts` cross-check over all nine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | N, C              |
| AC14 | `test/response.test.ts` — `acme/signature`'s `isUnanswered` honoured                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | N, C              |
| AC15 | `test/graphemes.test.ts` + `test/fields/text.test.ts` — every listed Thai/emoji/CRLF case, trimming, `toCell`; line breaks: `text` refuses inner LF, CR, CRLF, LS, PS (`invalid`), accepts inner NEL, VT, FF, and trims `"hi\n"` to `"hi"`; `textarea` keeps all of them; identical expectations in both engines                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | N, **C**          |
| AC16 | `test/fields/number.test.ts` — `2.5` by default, `not_integer` with `integer`, inclusive bounds, `min` = `max`, `"5"` → `invalid`; plain-decimal cells: `1234.5` → `"1234.5"`, `-0.25` → `"-0.25"`, `1e21` → `"1000000000000000000000"`, `1e-7` → `"0.0000001"`, `-1.5e-10` → `"-0.00000000015"`, `1.2345e21` → `"1234500000000000000000"`, `-0` → `"0"`, `Number.MAX_VALUE` (309 digits), `Number.MIN_VALUE` (`0.`, 323 zeros, `5`); a deterministic sweep (every power of ten from `1e-323` to `1e308`, plus 10,000 finite doubles from seeded random bit patterns): each cell matches `^-?(?:0\|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$` and `Number(cell) === n`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | N, C              |
| AC17 | `test/fields/rating.test.ts` — defaults (`max` 5, `icon` `star`); config `max` `1` → `too_small {min: 2}`, `11` → `too_big {max: 10}`, `4.5` → `not_integer`, each at `["fields", 0, "config", "max"]`; answer `0` → `too_small`, `max + 1` → `too_big`, `3.5` → `not_integer`; `toCell(4)` → `"4"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | N, C              |
| AC18 | `test/fields/options.test.ts`, config through `parseFormSchema`: no options → `too_few {min: 1}`; missing `options` → `required`; blank option label; repeated option ID and option ID `other` (shared with AC10); option entry with an extra key → `unknown_property` at `[…, "options", j, key]`; unknown config key; `allowOther` without `otherLabel`; checkbox `maxSelections: 0` → `too_small {min: 1}`, `minSelections` > `maxSelections` and `minSelections` above the selectable count → `invalid_range {min, max}` at `[…, "minSelections"]`, `minSelections` equal to options + 1 with "Other" accepted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | N, C              |
| AC19 | `test/fields/options.test.ts` (answer cases)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | N, C              |
| AC20 | `test/fields/options.test.ts` — the listed cells with the example form's config, plus the ordering rule (known options in config order, then unknown IDs in answer order, "Other" last) and the `otherLabel` rule (`allowOther` false with `otherLabel` kept → `<otherLabel>: <text>`; no `otherLabel` → `other: <text>`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | N, C              |
| AC21 | `test/fields/date.test.ts` (date-only cases and cells in no zone, Kiritimati, Pago Pago)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | N, C              |
| AC22 | `test/fields/date.test.ts` (date-time normalisation, `offset_required`, `invalid_date`, `storeAsOf`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | N, C              |
| AC23 | `test/fields/date.test.ts` (Z, Bangkok `+07:00`, New York Jan/Jul; a historical instant in a zone whose local-mean-time offset has seconds → whole-minute `±HH:MM` offset and a cell that names the same instant, case chosen so Node and Chromium agree), `test/cell-options.test.ts` (`Mars/Base`, `+07:00`, `""` → `invalid_time_zone`), `test/node/time-zone-independence.test.ts` (process TZ flipped between two zones, outputs identical); Chromium runs under UTC+14 and `th-TH`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | N, C              |
| AC24 | `test/fields/file.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | N, C              |
| AC25 | `test/ids.test.ts` — 100,000 IDs: each passes `idSchema` and is not reserved, equal length 12, no duplicates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | N, **C**          |
| AC26 | `test/version-history.test.ts` (type change only `field_type_changed`; accepted changes incl. removed and re-added field; history input: latest = highest `version` whatever the array order, a repeated `version` → `duplicate {value}`, `0`, `-1`, `1.5` → `invalid` at `["earlier", k, "version"]` and nothing else; a type missing from the registry → `unknown_field_type` at `["fields", i, "type"]`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | N, C              |
| AC27 | `test/version-history.test.ts` (`date` both directions, label-only change, `acme/measure` kind flip)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | N, C              |
| AC28 | CI: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:browser` (all shared files pass in both engines; `test/browser/engine.test.ts` proves real Chromium)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | N, **C**, T, lint |
| AC29 | `test/fields/rating.test.ts` (T017, before T019 implements `rating`): direct rule rows, `ratingField.incompatibleChanges({ max: 5, icon: "star" }, { max: 10, icon: "star" })` → `["max"]` and an `icon`-only change → `[]`, called without `?.` (compile-checked by `pnpm typecheck`, see "Provided optional members" in Design); `test/version-history.test.ts` (T029: rating `max` both ways and after removal; `icon` only; other built-ins' compatible changes; `acme/signature` rule; third-party `rating` without a rule)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | N, C              |

## Complexity tracking

None — no principle is bent.

## Revisions

### 2026-11-05 — `/analyze` findings

Corrections and additions only; the approved design is unchanged. Owner decisions taken the same
day: F04 (plain-decimal number cells), F06 (strict configs confirmed), F08 (plugin exceptions
propagate, confirmed), F27 (checkbox `maxSelections` ≥ 1).

- **F01** — AC10's option-ID rows (repeated option ID in one field, the same ID in two fields,
  option ID `other`) need option fields, so they are proven in `fields/options.test.ts` through
  `parseFormSchema` with the option built-ins (US5, step 7), not in the fixture-only
  `form-schema.test.ts`. Order steps 4 and 7 and Proof AC10 reworded.
- **F02** — each built-in family's test asserts its analytics (AC6) and stored values (AC7) before
  the family is implemented (steps 6–8); `builtins.test.ts` stays as the nine-field cross-check
  (step 10). Proof AC6, AC7, AC13 and Risk 6 updated.
- **F04** — number cells are plain decimal, never an exponent: new "Number cells" design
  (`fields/shared/decimal.ts`, string-only point shift of `String(n)`, exact round trip for every
  finite double, no locale APIs); `rating` uses the same helper; Proof AC16 gets the exponent-range
  rows and a round-trip sweep.
- **F06** — built-in configs and option entries are strict; the `unknown_property` path (object
  path + key) is stated; Proof AC10 and AC18 get unknown-config-key and option-entry rows, every
  family test has one, `builtins.test.ts` cross-checks all nine.
- **F08** — plugin exceptions propagate (kept); the built-ins' never-throw promise is now proven
  with `test/fixtures/hostile-json.ts` per family and across all nine, and a throwing test-local
  plugin proves propagation (Design, whole-response validation; Proof AC12; Risks 10, 11).
- **F09** — the ID pattern exists once, as the public `idSchema` (`core/ids.ts`, exported from
  `api.ts` in step 4, pinned); `parseFormSchema` and the option builder both use it. ADR 0012
  decision 5 updated with a change-log line.
- **F10** — `./package.json` stays in `exports` (tooling reads the manifest through it); the
  manifest assertion and Risk 5 now say "exactly `.` and `./package.json`" instead of "only `.`".
- **F16** — "latest" is the highest `version` number, whatever the array order; a non-positive or
  non-integer `version` → `invalid`, a repeated one → `duplicate {value}`, both at
  `["earlier", k, "version"]`, returned alone. A registry miss → `unknown_field_type` at
  `["fields", i, "type"]`. Proof AC26 rows added.
- **F20** — glossary line under the header.
- **F21** — Constitution check row 1 now says hand-written structural types (`FieldDefinition`,
  `FieldRegistry`, …) exist and that none duplicates a schema.
- **F22** — Files to touch completed: `test/public-api.test.ts` with the exports each step adds;
  `test/smoke.test.ts` (created in step 1, deleted in step 2); `tsconfig.json` and
  `tsdown.config.ts` (verify, edit only if a check fails); new `fields/shared/decimal.ts` and
  `test/fixtures/hostile-json.ts`.
- **F25 / F26** — stated for the spec sync: checkbox cells list known options in config order,
  then unknown IDs in answer order, then "Other"; the "Other" cell is `<otherLabel>: <text>` when
  the given config has an `otherLabel` (even with `allowOther` off), else `other: <text>`; `text`
  refuses LF, CR, LS and PS left after trimming and accepts NEL, VT and FF.
- **F27** — checkbox `maxSelections` ≥ 1 (`too_small {min: 1}`) and ≥ `minSelections`;
  `invalid_range` params and path stated; Proof AC18 rows added.
- **F28** — `validateResponse` with a schema type missing from the registry gives
  `unknown_field_type {type}` in that field's group (path `[]`), answered or not, and never
  throws; Proof AC12 row added.

### 2026-11-05 — second `/analyze` pass

Corrections only; the approved design is unchanged. Main-session decision the same day: N06.

- **N03** — the unknown rating config key in the examples is `color` (as in spec AC10, Limits and
  T017), not `colour`: Rules on values and Proof AC10 fixed.
- **N04** — Proof AC11: non-object input `null`, `[]`, `"x"` → only `invalid` at the root `[]`;
  `parseFormSchema` step 1 says "and nothing else".
- **N06** — no ESLint TSDoc rule or plugin. TSDoc on every public export stays a T033 deliverable,
  checked in review; the sentence moved out of the ESLint guard-rail bullet into its own bullet so
  it no longer reads as a lint rule.
- **N07** — confirmed under the Zod mapping table: rating config `max` `1` → `too_small {min: 2}`,
  `11` → `too_big {max: 10}`, `4.5` → `not_integer`, at `["fields", i, "config", "max"]`. Proof
  AC10 (`max` 11) and AC17 (all three, plus the answer rows) state the codes.
- **N09** — Proof rows added: AC9 `th-th` → `th-TH`; AC10 language `x-private` → `invalid` (also
  listed in the Language rule); AC23 Bangkok `+07:00` cell, the local-mean-time seconds-offset row,
  and `+07:00` / `""` → `invalid_time_zone` in `cell-options.test.ts`.
- **N15** — Order step 6: `exit-check.test.ts` is written with the other tests, before the
  implementations (test-first, as T017), and goes green with `ratingField`.

### 2026-11-05 — third `/analyze` pass

Wording sync with tasks.md and spec.md; the approved design is unchanged (P02 moves where a type
is created, P03 and P05 state behaviour the design already implied).

- **P01** — synced with tasks.md's second-pass fixes N01 and N02, which the second-pass entry above
  missed: (N01) each built-in config default is asserted once, by its family test (`rating.test.ts`
  and `number.test.ts` in T017, `options.test.ts` in T020, `date.test.ts` in T022, `file.test.ts`
  in T024), written in and re-parsing equal, with `builtins.test.ts` (T032) only the cross-check
  loop; (N02) the direct `ratingField.incompatibleChanges` rows (`max` change → `["max"]`,
  `icon`-only → `[]`) live in `rating.test.ts` (T017, before T019), alongside
  `version-history.test.ts`. Proof AC9 and AC29, the Order intro, Order step 6 (and the matching
  default mentions in steps 7 and 8), and the `test/fields/*` and `builtins.test.ts` rows of Files
  to touch updated.
- **P02** — the cell-options Zod schema and the branded `CellOptions` type move to the US1 step
  (Order step 3, T010; `core/cell-options.ts` is created there, type exported from `api.ts`)
  because `defineField`'s `toCell(answer, config, options?: CellOptions)` needs the type. The
  time-zone refinement, `parseCellOptions` and its runtime export stay in the US6 step (Order
  step 8, T025), test-first with `cell-options.test.ts`, so step 3 adds no untested behaviour.
  Module layout, `defineField`, "Dates and UTC", Files to touch and Order steps 3 and 8 updated.
- **P03** — Design states that `defineField`'s returned type makes each provided optional member
  (`incompatibleChanges`, `isUnanswered`) non-optional, so `ratingField.incompatibleChanges(...)`
  typechecks without `?.`; the widened `FieldDefinition` keeps them optional and generic code uses
  `?.`.
- **P05** — Language rule: a structural pre-check (IANA grandfathered list, extended language
  subtag pattern, one-character first subtag) runs before `Intl.getCanonicalLocales`, so
  `zh-cmn-Hans` and `i-klingon` (and `x-private`) give `invalid` at `["meta", "language"]`
  identically in Node and Chromium. ECMA-402 already makes both malformed, but engines have
  differed and regular grandfathered tags such as `art-lojban` are mapped rather than refused.
  Proof AC10 and Risk 9 updated.
- **P08** — the glossary covers the same terms as spec.md's Terms: adds "whole-response
  validation" → `validateResponse` and "version check" → `checkVersionHistory`; keeps "ID rules" →
  `idSchema`.

### 2026-11-05 — implementation divergence (T006)

- `FieldDefinitionError` is defined in `core/issues.ts` (T006, Order step 2) instead of
  `core/define-field.ts` (main-session decision): T005's `issues.test.ts` already tests it, and it
  depends only on `Issue`. `define-field.ts` (T010) imports and throws it; `api.ts` (T011) still
  exports it. Module layout, Files to touch and Order steps 2 and 3 updated.
- The rules the T005 tests left open (missing value for an int schema, exclusive bounds, parsing
  without `reportInput`, `FieldDefinitionError.message` format) are decided and listed under the
  Zod → catalogue mapping; `test/issues-rules.test.ts` (new) pins them, with `json.ts` and the
  result helpers (`failure`, `prefixIssues`).

### 2026-11-05 — implementation divergence (T010, T011)

Design unchanged in substance; these are the details the build settled.

- **`FieldDefinition` has a fourth generic** `K extends StoreAs = StoreAs` (the stored kind), so
  `storedValues` returns `readonly StoredValueOf<K>[]` on typed definitions (the T008 rows for
  `acme/measure` and `acme/note`). The widened default is unchanged for generic code.
- **P03 mechanism:** a defaulting-to-`undefined` generic is fixed to the default and an `& M`
  intersection breaks `Answer` inference, so the return type uses sentinel-default generics and
  `Omit<FieldDefinition<…>, …>` plus the two conditional members, written inline (no internal type
  alias). A declaration-emit probe of the fixtures against the built `dist` gives types naming
  only `FieldDefinition`, so plugins do not hit TS2742/TS4023; no Risk 3 fallback was needed.
  `incompatibleChanges: () => []` and `isUnanswered: () => false` still count as provided.
- **`FieldConfig<D>` / `FieldAnswer<D>`** take `D extends FieldDefinition` and read the parameter
  types of `answer` and `toCell`.
- **Definition checks:** a definition must be a plain object and its members are read as own
  properties (`json.ts`); only the config's `safeParse` is read through the prototype chain (Zod
  may define it there). A bad `kinds` entry is reported at `["analytics", "storeAs", "kinds", j]`;
  repeated kinds are checked once against `summarize`; no fit issue is added when `storeAs` or
  `summarize` is malformed.
- **Registry:** a non-array argument → `invalid` at `[]`; a well-formed `type` counts for
  `duplicate_field_type` even when other members of that entry are broken. `get` and `types` are on
  a frozen object; `get` returns the registered object itself.
- **`CellOptions` schema** is `z.strictObject({ timeZone: z.string().optional() })` branded
  (strict, like the configs); T025 adds the refinement and decides the unknown-key code with its
  tests.
- **Open for review:** `storeAsOf` returns what a config-dependent `pick` returns without checking
  it is one of the declared `kinds` (plugin misbehaviour, Risk 11).

### 2026-11-05 — T012 test decisions and implementation details (T013)

Design unchanged; the T012 tests pinned these details the plan did not specify, and T013
implements them.

- **T012 test decisions:**
  1. `core/form-schema.ts` exports `type MigrationStep = (input: Readonly<Record<string, unknown>>)
=> Record<string, unknown>` and `migrateFormSchema(input, steps?)` (internal, not in `api.ts`):
     step `i` migrates version `i + 1` → `i + 2`, the loop starts at the input's (already gated)
     `schemaVersion`, the input is never mutated, and `steps` defaults to the package's real list
     (empty in this item).
  2. `unsupported_schema_version` is reported at `["schemaVersion"]`, alone.
  3. `found` is the number or string given, else `null` (`1.5` → `1.5`; `true`, `{}`, `[1]` →
     `null`).
  4. A missing `meta`, `fields`, `language`, `fieldId` or `type` → `required`; a wrong type →
     `invalid`.
  5. An unknown `type` skips the config but the entry checks (`fieldId`, `label`, unknown keys)
     still run.
  6. The output is a fresh object; absent `description` / `help` keys are omitted (never
     `undefined`); `config` is always present.
  7. A `fieldId` of `""` or 65 characters → `invalid` (the pattern), not `too_short` / `too_long`;
     a reserved `fieldId` → only `reserved_id {id}`; a repeated `fieldId` →
     `duplicate_field_id` at each repeat.
  8. An own `__proto__` key from `JSON.parse` → `unknown_property {key: "__proto__"}` at form and
     field level.
- **Reserved `fieldId` set** lives in `core/ids.ts` next to `idSchema` (Module layout) and is
  applied in `core/form-schema.ts` (Rules on values). Only a `fieldId` that passes the pattern and
  is not reserved counts for `duplicate_field_id`.
- **Object levels** (meta, field entry) are read by their own keys: unknown keys come from
  `Object.keys`, and only the shape's own keys are copied into the object Zod parses, so an own
  `__proto__` is reported, never lost or used as a prototype, and nothing is read through the
  prototype chain. Form-level keys are checked against the same strict form shape.
- **`config` absent** (or `undefined` from a JavaScript caller) → `{}` is parsed, so every default
  is written in; `config: null` is not treated as absent but passed to the type's config schema
  (built-in and fixture configs refuse it with `invalid`). The plan's `config ?? {}` would have
  accepted `null` silently.
- **`found` for a non-finite number** (only possible from a JavaScript caller) is `null`, because
  the catalogue's `found` cannot carry `NaN` or `Infinity`.
- **Public types** added in this step: `FormSchema`, `FormMeta`, `FieldEntry` (all `z.output` of
  the static shapes, no hand-written duplicates).

### 2026-11-05 — T014 test decisions (T015)

Design unchanged; the T014 tests pinned these details the plan did not specify, and T015
implements them in `core/response.ts`.

- **Result shape, exactly:** `{ ok: true, answers }` or `{ ok: false, answerSet, fields }` with
  no other keys; `answerSet` is always an array (empty when the set as a whole has no issue);
  `fields` has a key only for a `fieldId` with at least one issue.
- **Not a plain object** (`null`, array, string, number, boolean, the 10,000-deep array) →
  `answerSet: [invalid @ []]`, `fields: {}`, nothing else checked.
- **Paths:** `required`, `unknown_field` and `unknown_field_type` are at `[]`; a field's own issues
  are at their path inside the answer (`toIssues(…, "answer")` on a `reportInput: true` parse).
- **Order per field:** registry miss → absent / `null` → `isUnanswered(value, parsed config)` →
  answer schema. Nothing is caught: an exception from the answer-schema factory, a refine or
  `isUnanswered` reaches the caller as the same exception. `""` is not unanswered unless the
  type's own rule says so.
- **`unknown_field`:** one per own key of `Object.keys(answers)` that is not a schema `fieldId`
  (`""`, `__proto__`, `constructor` included), in key order, in the answer-set group, even when
  the form has no fields.
- **Own keys only, no pollution:** values are read with `Object.hasOwn`, so a `fieldId` such as
  `toString` never sees `Object.prototype`; the normalised set and `fields` are plain objects
  written with `Object.defineProperty` (own data properties), keyed only by schema `fieldId`s.
- **`AnswerSet`** is `z.output` of an internal `answerSetSchema = z.record(z.string(), z.json())`
  (exported from `core/response.ts`, not from `api.ts`); answer outputs are cast to its value
  type, because the definition type cannot state that answer schemas output JSON.

### 2026-11-05 — implementation details (T018, T019)

Design unchanged; details the plan left open, as built in `src/core/text.ts` and
`src/fields/{shared/text,shared/decimal,text,textarea,number,rating}.ts`.

- **`countGraphemes`** counts by stepping the segment iterator (no array of segments); the
  `Intl.Segmenter("en", { granularity: "grapheme" })` is created on the first call and reused.
- **`text` order of rules:** `trim()`, then an inner LF / CR / LS / PS gives one `invalid` and
  skips the length rules; otherwise `too_short` / `too_long` (both custom issues, counted only when
  a limit is set). `isUnanswered` is "a string blank after `trim()`", so blank text never reaches
  the length rules.
- **Integer answers (`number` with `integer`, `rating`)** use `z.number()` plus an aborting
  `not_integer` refine (`customIssue`, `abort: true`) before `.min` / `.max`, not `z.int()`:
  `z.int()` adds safe-integer bounds, so `1e300` would give two `too_big` issues (one with
  `max: 9007199254740991`) and `number` would refuse integers above 2^53. Effect: a fraction gives
  only `not_integer`, an out-of-range integer one `too_small` / `too_big`. Config integers
  (`minLength`, `maxLength`, rating `max`) keep `z.int()` (their own bounds are far below 2^53).
- **Config range rules** (`minLength` > `maxLength`, `min` > `max`) are a `superRefine` on the
  strict config object. Zod runs it after continuable issues, so a limit that is out of its own
  range and also crosses the other (e.g. `{ minLength: 5, maxLength: 0 }`) gives both its own
  issue and `invalid_range`; a wrong-type limit or nothing to compare gives no `invalid_range`.
- **`toPlainDecimal`** reads the exponent with `Number.parseInt(…, 10)` (an integer from the
  string, not float arithmetic on `n`); everything else is the plan's string shift.

### 2026-11-05 — implementation details (T020, T021)

Design unchanged; details the T020 tests pinned and `src/fields/shared/options.ts` implements.

- **`otherLabel` blank is refused even while `allowOther` is false** (`required` at
  `["otherLabel"]`), following spec R13's wording ("a blank `otherLabel` … fail[s] with
  `required`"). "Option fields" above said only that `otherLabel` is required and non-blank when
  `allowOther` is true; a non-blank one is still allowed and kept when it is false.
- **Option-ID checks run on the list once every entry is well formed:** an `other` entry gives
  only `reserved_id` and never counts as a repeat; each later repeat gives
  `duplicate_option_id` at its own `["options", j, "id"]`. A missing `id` → `required`, a
  non-string one → `invalid`. Only `other` is reserved for options (`Other`, `__proto__`,
  `constructor`, `toString` are valid option IDs; option lookups use a `Set` of the config's
  IDs, never object keys, so nothing is read through `Object.prototype`).
- **Cross-field config rules** (`otherLabel` missing while `allowOther`, the two checkbox
  `invalid_range` rules) are a `superRefine` on the strict config, so Zod skips them when a key
  has an aborting issue (missing or malformed `options`, an unknown key): a config without
  `options` gives only `required` plus any `unknown_property`.
- **Answer rules, order and scope:** the answer parses as strict
  `{ optionIds: string[], other?: string | null }` (so `null` reaches the "Other" rules); a wrong
  shape stops there. Then, per index, a repeat → `duplicate {value}` (not also `unknown_option`),
  else an ID that is not an own option, or `other` while "Other" is off → `unknown_option`. With
  `other` selected while "Other" is off, its text is not checked (one `unknown_option` only).
  `too_many` / `too_few` are counted on `optionIds.length` and only when it is non-zero, so
  `{ optionIds: [], other: "x" }` gives only `invalid` at `["other"]`. The output is piped
  through the strict normalised-answer schema (`OptionAnswer` is its `z.output`).
- **`toCell` for an answer built by a caller** with `other` selected but no text writes
  `<otherLabel>: ` (empty text); normalised answers always carry the text.

### 2026-11-05 — implementation details (T025–T027)

Design unchanged; decisions the T022–T024 tests pinned and details the plan left open, as built in
`src/core/cell-options.ts`, `src/fields/shared/calendar.ts`, `src/fields/date.ts` and
`src/fields/file.ts`.

- **`parseCellOptions(input: { timeZone?: string })`** parses the strict branded schema with
  `reportInput` and maps in the `schema` context: an unknown option → `unknown_property {key}` at
  `[key]` (not `invalid`), a non-string zone → `invalid` at `["timeZone"]`, a non-object →
  `invalid` at `[]`. On success `options` equals the input (`{}` stays `{}`, the zone is kept as
  given, e.g. `utc` is not rewritten to `UTC`).
- **Time-zone refinement:** `""`, a zone starting with `+`, `-` or U+2212 (`+07:00`, `+0700`,
  `+07`; both engines accept these) and a zone whose resolved name is offset-style are refused;
  otherwise `new Intl.DateTimeFormat("en-US", { timeZone })` decides, and only a `RangeError`
  counts as unknown (any other exception propagates). `Etc/GMT-7` is an IANA name and is accepted.
- **Date answers:** a non-string → `invalid` (Zod type issue), every refused string →
  `invalid_date` or `offset_required` at `[]`; nothing is trimmed (`" 2026-11-04 "`, a trailing
  LF, `""` and `"  "` are `invalid_date`, also on an optional field). A string of the date-time
  shape without an offset gives `offset_required` before any range check (so
  `2026-02-30T10:00` is `offset_required`). A local year `0000` is accepted when the offset moves
  the UTC instant into year 0001 (only the UTC year is range-checked, as the plan says), so a cell
  near the lower bound validates back.
- **Date cells:** `toCell` branches on `config.includeTime`; a date-time answer is re-read with the
  same parser (no `Date.parse`), and a string that does not read back is returned unchanged. The
  offset comes from a per-zone cached `Intl.DateTimeFormat("en-US", { timeZone, timeZoneName:
"longOffset" })`; a seconds offset is rounded to the nearest minute, half away from zero. The
  wall time is `toISOString()` of the shifted instant without its `Z`, so years below 1000 stay
  four digits (a wall year above 9999, only reachable at the very top of the range, would use
  `toISOString`'s expanded `+YYYYYY` form). An engine without `longOffset` throws (unreachable on
  the supported engines).
- **File config:** `allowedTypes` uses a non-empty `refine` raising `too_few {min: 1}` instead of
  `.min(1)`, and the answer raises `too_many {max}` in its `superRefine` instead of `.max()`:
  Zod 4 length checks also measure a string (a bare `"fileA"` answer got a second `too_big`) and a
  failed one skips later refinements (a repeat next to too many IDs lost its `duplicate`). A
  malformed MIME entry is `invalid` at `["allowedTypes", j]` (the entry's index). MIME names keep
  their case.
- **File answers:** an empty or non-string entry → `invalid` at `[i]`; a repeat → `duplicate
{value}` at the repeat's index (the first occurrence is not flagged); `too_many` and `duplicate`
  are both reported when every entry is a non-empty string; IDs are kept as given.

### 2026-11-06 — implementation details (T030, T031)

Design unchanged; details the plan left open, as built in `src/core/ids.ts` and
`src/core/version-history.ts`.

- **`generateId`:** reads `globalThis.crypto.getRandomValues` at every call (never cached or bound
  at module load) and passes it one `Uint8Array(9)`; the bytes are encoded in byte order, three
  bytes to four base64url characters, with no padding. No retry loop (no reserved value has 12
  characters). `test/public-api.test.ts` already pinned `generateId` and `checkVersionHistory`
  (written with T028/T029), so T030/T031 did not edit it.
- **`checkVersionHistory` result and types:** `{ ok: true }` (exactly that object) or the shared
  `Failure`. The element type of `earlier` is exported as the type `EarlierVersion`
  (`{ version: number; schema: FormSchema }`, type only, no new runtime export). A `version` that
  is not a `number` at all (JavaScript caller) is `invalid` like `0` or `1.5`. Repeats are flagged
  only for valid versions; the first occurrence is not flagged.
- **Lazy lookup (R19 "only when a check needs the definition"):** the registry is consulted only
  when an earlier version holds the same `fieldId` with the same `type`. Hence:
  - a candidate field whose `fieldId` appears in no earlier version is never looked up, so a new
    field whose type the registry lacks gets no issue here (`parseFormSchema` with that registry
    would already have refused it);
  - the walk is from the highest `version` down and stops at the first version that needs the
    missing definition: if v2 shares the candidate's type (registry miss) and v1 has another type,
    the field gets one `unknown_field_type` and is skipped; v1's type change is not reported,
    because whether v2 conflicts (and so which version is "the most recent conflict") cannot be
    decided without the definition;
  - a type change met before any lookup (most recent version first) is reported as
    `field_type_changed` without a lookup, whether the earlier or the candidate type is missing.
- **Order of evaluation:** the candidate's stored kind is computed once per field, on the first
  same-type earlier version; `incompatibleChanges` is called once per same-type, same-kind earlier
  version until one names properties (copied into a new array for the issue). An exception thrown
  by a plugin's `storeAs.pick` or `incompatibleChanges` propagates (same rule as plugin code in
  `validateResponse`).

### 2026-11-06 — Phase 10 (T032–T036)

Design unchanged; details the build settled.

- **Barrel:** `fields/index.ts` re-exports the nine definitions by name and adds `builtInFields`
  (`Object.freeze([...] as const)`, brief §5 order); `index.ts` is `export * from "./api"` and
  `export * from "./fields/index"`, as in Module layout. `public-api.test.ts` already held the
  final 24 runtime names (written with T032), so T033 did not edit it.
- **TSDoc:** every public export already had a TSDoc comment except the `Issue` and `IssueCode`
  types (`core/issues.ts`), which got one; `builtInFields` got one in `fields/index.ts`.
- **T034:** the build-artifact tests pass against the existing `tsdown.config.ts`; no change.
- **Standards:** the browser parity bullet also notes that browser tests loading `dist` need
  `pnpm build` first (T035's dist smoke).
