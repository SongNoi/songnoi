# 001 — Field core: spec

Source: [intent.md](./intent.md). Brief references: §2 (design rules), §5 (field plugin API), §6
(data model), §9 (analytics), §10 (MVP item 1). ADRs: 0006 (item 001 scope and exit check), 0007
(headless field core), 0009 (versioning and stable IDs), 0011 (file field, still Proposed), 0003
(i18n).

The owner decisions recorded in intent.md (interview 2026-11-04) are taken as given and are not
re-opened here. Where the intent's open questions had a sound recommendation consistent with those
decisions, it is stated below as a requirement. Two questions stay open as markers (R14, R19).

## How does the form schema change?

**It is created from nothing.** `@songnoi/schema` is an empty placeholder today. This item defines
the first Form Schema contract, `schemaVersion: 1`. Once released it is frozen: any later change
to the stored format needs a new `schemaVersion` and a migration step (R7), and follows ADR 0009
(stable IDs, immutable published versions).

### Form Schema (stored as `Form.draftSchema` and `FormVersion.schema`, brief §6)

| Part               | Contents                             | Rules                                                                          |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------------ |
| `schemaVersion`    | the literal `1`                      | required; anything else is refused (R7)                                        |
| `meta.title`       | plain string                         | required, not blank                                                            |
| `meta.description` | plain string                         | optional                                                                       |
| `meta.language`    | BCP 47 language tag, e.g. `th`, `en` | required; **one language per form** (owner decision 1); all form text is in it |
| `fields`           | ordered list of field entries        | list order is display order; may be empty                                      |

Each field entry:

| Part       | Contents                                                   | Rules                                                                                                                 |
| ---------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `fieldId`  | identity of the question across versions (ADR 0009)        | 1–64 URL-safe characters (`A–Z a–z 0–9 _ -`), unique in the form, not a reserved key; generated ones are random (R18) |
| `type`     | a registered field type, e.g. `rating` or `acme/signature` | must exist in the registry used to validate; permanent once released (ADR 0007)                                       |
| `label`    | plain string                                               | required, not blank                                                                                                   |
| `help`     | plain string                                               | optional                                                                                                              |
| `required` | boolean                                                    | default `false`                                                                                                       |
| `config`   | object checked by that type's config schema                | defaults are filled in when parsed (R6)                                                                               |

- All form text (title, description, label, help, option labels, the "Other" label) is a **plain
  string** in the form's one language. There is no `LocalizedText` and no markup. Multi-language
  forms would be a later schema migration (owner decision 1).
- The Form Schema is **public**: the renderer sends it to respondents' browsers. It holds only
  what a respondent may see — never access settings, passwords, webhook targets or response data
  (those belong on the `Form` record in items 003, 005, 007). Unknown properties are refused (R6),
  so nothing else can be stored in it.
- Choice options carry stable IDs with the same format and generator as `fieldId`s, unique within
  their field. The option ID `other` is reserved for the "Other" selection.

### Built-in fields (9, all defined through the public API)

| `type`     | Config (defaults)                                                               | Answer                                                            | Stored values (`storeAs`)         | `summarize`        | `groupable` |
| ---------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------- | ------------------ | ----------- |
| `text`     | `minLength`?, `maxLength`?                                                      | single-line string, trimmed                                       | 1 × `text`                        | `responses`        | no          |
| `textarea` | `minLength`?, `maxLength`?                                                      | string, line breaks allowed, trimmed                              | 1 × `text`                        | `responses`        | no          |
| `number`   | `min`?, `max`?, `integer` (`false`)                                             | number                                                            | 1 × `number`                      | `histogram+stats`  | no          |
| `choice`   | `options` [{`id`, `label`}], `allowOther` (`false`), `otherLabel`               | one option, or "Other" + text ¹                                   | 1 × `text` (option ID or `other`) | `counts`           | yes         |
| `dropdown` | as `choice`                                                                     | as `choice` ¹                                                     | as `choice`                       | `counts`           | yes         |
| `checkbox` | as `choice`, plus `minSelections`?, `maxSelections`?                            | set of options, optionally "Other" + text ¹                       | 1 × `text` per selection          | `counts`           | yes         |
| `date`     | `includeTime` (`false`)                                                         | `YYYY-MM-DD`; with time, a UTC instant `YYYY-MM-DDTHH:mm:ss.sssZ` | 1 × `date`, or 1 × `datetime`     | `timeline`         | no          |
| `rating`   | `max` (`5`, range 2–10), `icon` (`star` \| `heart`, default `star`)             | integer 1 … `max`                                                 | 1 × `number`                      | `distribution+avg` | no          |
| `file`     | `maxFiles` (`1`), `maxSize`? (bytes), `allowedTypes`? (MIME types, `type/*` ok) | list of file IDs                                                  | 1 × `text` per file ID            | `count`            | no          |

¹ The exact JSON shape is the open marker in R14. Recommended: `{ "optionIds": [...], "other"?: "..." }`.

Property names above are the proposed stored names; once released they are as permanent as `type`
strings.

### Answer set (stored as `Response.answers`, brief §6)

A JSON object keyed by `fieldId`; each value has the answer shape of that field's type.
Whole-response validation (R8) returns the **normalised** set: unanswered fields omitted, text
trimmed, date-times in UTC. Item 005 stores that normalised set. The `Answer` rows (one per stored
value, ADR 0007 point 5) come from each field's stored values (R2).

Illustrative example (Thai form):

```json
{
  "schemaVersion": 1,
  "meta": { "title": "แบบสอบถามความพึงพอใจ", "language": "th" },
  "fields": [
    {
      "fieldId": "k3Jx9aQ2mTzL",
      "type": "rating",
      "label": "ให้คะแนนบริการ",
      "required": true,
      "config": { "max": 5, "icon": "star" }
    },
    {
      "fieldId": "Vb7-pL0wQe4R",
      "type": "checkbox",
      "label": "รู้จักเราจากช่องทางใด",
      "help": "เลือกได้ไม่เกิน 2 ข้อ",
      "required": false,
      "config": {
        "options": [
          { "id": "Qm2xT8aLp0vW", "label": "Facebook" },
          { "id": "c9Rk_4NnYb1E", "label": "เพื่อนแนะนำ" }
        ],
        "allowOther": true,
        "otherLabel": "อื่นๆ",
        "maxSelections": 2
      }
    }
  ]
}
```

Answer set (shape of the checkbox answer pending R14):
`{ "k3Jx9aQ2mTzL": 4, "Vb7-pL0wQe4R": { "optionIds": ["Qm2xT8aLp0vW", "other"], "other": "TikTok" } }`

### Impact on later items (not built here)

- `storeAs` gains `datetime` next to `date`, so the `Answer` table will need a calendar-date
  column and a UTC-instant column (brief §6 has one `valueDate DateTime?`; see Flags). Items 003
  and 005 build it.
- `file` stores one `text` value (the file ID) per file, not `none` (see Flags).

## User stories

### US1 — Define and register a field type through the public API (P1)

- **Who:** a plugin author, and the SongNoi developer writing the built-ins with the same API.
  Admins and respondents are indirect users: what they can configure and answer is what field
  definitions allow.
- **Want:** to declare a field type once — permanent `type`, config with defaults, answer rules
  built from the config, cell conversion, stored values and analytics data — with config and
  answer types inferred from the schemas, and to register it through the same public call the
  built-ins use.
- **So that:** built-ins have no privileges (brief §2), and the renderer, server, export and
  analytics all read one typed contract that contains no UI code.
- **Independent test:** with no built-in loaded, a fixture third-party field with a scoped type
  is defined and registered through the public calls; type tests show its inferred types;
  duplicate or malformed types and incompatible analytics data are refused.

### US2 — Store a form as a validated Form Schema (P1)

- **Who:** the developer of form storage and publish (003) and of the Builder (004). Admins
  indirectly (what they can save and publish); respondents indirectly (the schema is what their
  browser receives).
- **Want:** to read any stored form JSON through one entry point that checks the format version,
  meta, ordered fields and per-type config, fills defaults, and reports every problem as a code
  with a path.
- **So that:** every layer reads the same trusted structure, and a stored version never changes
  meaning later.
- **Independent test:** with a registry holding only the fixture field, a valid schema parses with
  defaults filled and re-parses unchanged; each invalid case fails with its documented code and
  path.

### US3 — Validate a whole response in one call (P1)

- **Who:** the developer of the respond flow (005). Respondents indirectly: the server accepts
  only what this call accepts, and its error codes become messages in their language (002).
- **Want:** to check a respondent's full answer set against a form version and get either the
  normalised answers or every error grouped by `fieldId`.
- **So that:** the server decides on its own without trusting client checks, and stores clean,
  normalised answers.
- **Independent test:** with a form made only of fixture fields, answer sets that are valid, miss
  a required field, carry unknown keys or are not objects give the documented outcomes.

### US4 — Built-in text, textarea, number and rating fields (P2)

- **Who:** developers of the renderer (002), Builder (004), export (007) and analytics (008).
  Admins indirectly (the settings they get); respondents indirectly (what a valid answer is).
- **Want:** the four scalar built-ins with config, answer rules, cells, stored values and analytics
  data, defined only through US1's public API.
- **So that:** admins can ask free-text, numeric and rating questions with the essential limits
  (owner decision 2), validated the same way in the browser and on the server.
- **Independent test:** per-field tests of config, answers, `toCell`, stored values and analytics
  through a registry created with the public call.

### US5 — Built-in choice, dropdown and checkbox fields with "Other" (P2)

- **Who:** as US4. Admins indirectly (options and an optional "Other"); respondents indirectly
  (choosing options, typing an "Other" answer).
- **Want:** the three option fields with stable option IDs, an optional "Other: \_\_\_" choice,
  checkbox min/max selections, label-based cells and one stored value per selection.
- **So that:** renaming an option keeps its answers together across versions (ADR 0009) and "Other"
  answers are exported with their text and summarised as one bucket.
- **Independent test:** per-field tests of config, "Other" rules, checkbox min/max counting,
  cells with labels / "Other" / unknown option IDs, and stored values.

### US6 — Built-in date and file fields (P2)

- **Who:** as US4, plus the developer of file uploads (006). Respondents indirectly (dates they
  enter mean the same in every time zone); admins indirectly (date and file settings, cells).
- **Want:** a date field with optional time stored as calendar date or UTC instant, cells in a
  chosen time zone, and a file field whose answer references uploads by ID.
- **So that:** a date-only answer is never shifted, a date-time answer is one exact instant, and
  file answers never hold file contents.
- **Independent test:** date-only and date-time answers and cells across several time zones and
  with the process time zone changed; file count limits, ID lists, cells and stored values.

### US7 — Keep a question's identity across versions (P3)

- **Who:** the developer of publish (003) and the Builder (004). Admins indirectly: a typo fix
  after publish does not split their data, while a changed meaning gets a new question.
- **Want:** an ID generator for fields and options, and a check that refuses a version in which an
  existing `fieldId` changes type.
- **So that:** export and analytics can merge versions by `fieldId` (ADR 0009), and every source of
  schemas (Builder, API, future AI generation) obeys the same rule.
- **Independent test:** generated IDs are URL-safe, fixed-length and unique over a large sample; a
  version history with a type change is refused with the conflict listed; label, option and order
  changes pass.

## Requirements

### Field API and registry

**R1. Public field definition.** One public call defines a field type from: a `type` string; a
config schema with defaults; an answer schema built from the parsed config; a cell converter
(`toCell`); how a valid answer becomes stored values; and data-only analytics (`storeAs`,
`summarize`, `groupable`). Config and answer types are inferred from those schemas, never written
by hand, and every other part receives the inferred types. A definition holds no UI component.
`toCell` receives a valid answer, the parsed config and optional export options (in MVP only an
IANA time zone), returns a string, is pure, and never reads the environment (process time zone,
locale, variables). — _US1_

**R2. Analytics data and stored values.** `storeAs` is one of `text`, `number`, `date` (calendar
date), `datetime` (UTC instant) or `none`, and may depend on the parsed config (needed by `date`).
`summarize` is one of a closed set that item 008 maps to charts — `responses`, `counts`,
`histogram+stats`, `distribution+avg`, `timeline`, `count`, `none` — and third-party fields use
the same set. A definition is refused (`incompatible_analytics`) when `summarize` does not fit
`storeAs`: `responses` and `counts` need `text`; `histogram+stats` and `distribution+avg` need
`number`; `timeline` needs `date` or `datetime`; `count` needs any kind but `none`; `none` pairs
only with `none`. `groupable` is a boolean. For a valid answer, the stored values are zero or more
values of the `storeAs` kind, one per future `Answer` row (ADR 0007 point 5); `storeAs: none`
gives none. The built-ins use exactly the values in the schema-section table. — _US1, US4, US5,
US6_

**R3. Public registry, no privileges.** A registry is created by one public call from a list of
field definitions and looks a definition up by `type`. Built-in fields are exported as ordinary
definitions that a consumer passes to that call exactly like a plugin; there is no global,
implicit or pre-filled registry and no other registration path. Two definitions with the same
`type` are refused (`duplicate_field_type`). A `type` is lowercase ASCII letters, digits and `-`,
optionally prefixed by one scope and `/` (e.g. `acme/signature`); anything else is refused
(`invalid_field_type`). — _US1_

**R4. Machine-readable errors only.** Every failure — field definitions, registry, Form Schema,
answers, export options — is reported as a code, named params and a location (a path inside the
schema; a `fieldId` plus optional path inside the answer; or the answer set as a whole), never as
display text. The package contains no user-facing strings (constitution 13); item 002 maps codes
to `messages/{en,th}.json`. Errors from a third-party field's own rules come out in the same
code-plus-params form. The package itself produces only these codes:

- values and config: `required`, `invalid`, `too_short` {min}, `too_long` {max}, `too_small`
  {min}, `too_big` {max}, `not_integer`, `too_few` {min}, `too_many` {max}, `invalid_range` {min,
  max}, `duplicate` {value}, `unknown_option` {optionId}, `other_text_required`, `invalid_date`,
  `offset_required`;
- answer set: `unknown_field` {fieldId};
- Form Schema: `unsupported_schema_version` {found}, `unknown_property` {key},
  `unknown_field_type` {type}, `duplicate_field_id` {fieldId}, `duplicate_option_id` {optionId},
  `reserved_id` {id}, `field_type_changed` {fieldId, previousType, type, version};
- definitions, registry and export: `invalid_field_type` {type}, `duplicate_field_type` {type},
  `incompatible_analytics` {storeAs, summarize}, `invalid_time_zone` {timeZone}.

— _US1, US2, US3_

### Form Schema

**R5. Form Schema structure.** A Form Schema has exactly `schemaVersion`, `meta` and `fields` as
described in "How does the form schema change?". `meta` holds a non-blank `title`, an optional
`description` and a required `language` (a well-formed BCP 47 tag, returned in canonical case,
e.g. `TH` → `th`). Each field entry holds `fieldId`, `type`, a non-blank `label`, optional `help`,
`required` (default `false`) and `config`. All text is plain strings in the form's one language.
`fieldId`s and option IDs are 1–64 URL-safe characters (`A–Z a–z 0–9 _ -`); `__proto__`,
`constructor` and `prototype` are refused as `fieldId`s and `other` as an option ID
(`reserved_id`). — _US2_

**R6. Form Schema validation.** Validating a candidate against a registry returns either the
parsed schema or every error with its path. It refuses unknown properties at form, meta and
field-entry level (`unknown_property`), a `type` not in the registry (`unknown_field_type`), a
config that fails its type's config schema (codes from R4 at the config path) and a repeated
`fieldId` (`duplicate_field_id`). The parsed schema has every config default written in, so a
stored version does not change meaning if a default changes later, and parsing the parsed output
again gives an equal value. — _US2_

**R7. Format version and migration.** Stored schemas are read through one public entry point that
first brings the input to the current format and then validates it (R6). In this item the current
format is `schemaVersion: 1`; a missing, non-integer or unknown version (e.g. `0`, `2`, `"1"`) is
refused with `unsupported_schema_version` before any other check. Every future change to the
stored format — including any built-in field's config — bumps the literal and adds a migration
step from the previous version; stored published versions are migrated when read, never rewritten
(constitution 8). — _US2_

### Whole-response validation

**R8. One call validates a whole response.** Given a parsed Form Schema, its registry and a
candidate answer set (any JSON value), one public call returns either success with the normalised
answer set, or failure with every error found, grouped by `fieldId` plus one group for the answer
set as a whole. It checks all fields (never stops at the first error), never throws for any JSON
input, gives the same result in Node and in a browser, and needs nothing outside this package
(ADR 0007), so the server can re-validate without trusting client checks. — _US3_

**R9. Answered, unanswered and unknown.** A field is unanswered when its key is absent or `null`;
built-in fields are also unanswered when text is blank after trimming, a selection is empty or a
file list is empty. A required unanswered field fails with `required`; an optional one is valid
and left out of the normalised set. Answered fields are checked with their type's answer schema
for their parsed config. The built-ins' "unanswered" rules use the same public means that
third-party fields have. Keys that are not a `fieldId` of the schema (including `__proto__` and
`constructor`) fail with `unknown_field` and never change any other result. An answer set that is
not a JSON object fails as a whole with `invalid`. — _US3_

### Built-in fields

All nine are defined with R1 and reach a registry only through R3.

**R10. `text` and `textarea`.** Config: optional `minLength` (integer ≥ 0) and `maxLength`
(integer ≥ 1), with `minLength` ≤ `maxLength` (`invalid_range`). Answer: a string, trimmed of
leading and trailing whitespace; its length is counted in Unicode code points after trimming
(`too_short` / `too_long`); `text` refuses line breaks (`invalid`), `textarea` keeps them. `toCell`
returns the trimmed text. Stored value: the text. Analytics: `text`, `responses`, not groupable. —
_US4_

**R11. `number`.** Config: optional finite `min` and `max` with `min` ≤ `max` (`invalid_range`),
and `integer` (default `false`). Answer: a finite JSON number (a numeric string such as `"5"` is
`invalid`); decimals are allowed unless `integer` is set (`not_integer`); bounds are inclusive
(`too_small` / `too_big`). There is no precision or step setting. `toCell` writes the number
without locale formatting: ASCII digits, `.` as decimal point, no grouping. Stored value: the
number. Analytics: `number`, `histogram+stats`, not groupable. — _US4_

**R12. `rating`.** Config: `max`, an integer from 2 to 10 (default 5); `icon`, `star` or `heart`
(default `star`); the minimum is always 1. Answer: an integer from 1 to `max` (`not_integer`,
`too_small`, `too_big`). `toCell` writes the integer. Stored value: the number. Analytics:
`number`, `distribution+avg`, **not groupable** (brief §5; see Flags). — _US4_

**R13. `choice`, `dropdown`, `checkbox`: config.** Shared config: `options`, an ordered list of at
least one `{ id, label }` (`too_few` {min: 1}) with unique IDs (`duplicate_option_id`) and
non-blank labels; `allowOther` (default `false`); `otherLabel`, a non-blank plain string in the
form's language, required when `allowOther` is true (the package supplies no default text).
`checkbox` adds optional `minSelections` and `maxSelections` (integers ≥ 0, `minSelections` ≤
`maxSelections`, and `minSelections` no more than the number of options plus one if "Other" is
allowed; otherwise `invalid_range`). `choice` and `dropdown` have the same config and answer rules
and differ only in how they are rendered (002). — _US5_

**R14. `choice`, `dropdown`, `checkbox`: answers, cells, stored values.** [NEEDS CLARIFICATION:
What is the stored answer shape for choice, dropdown and checkbox now that "Other" exists?
Recommended: one shape for all three, `{ "optionIds": string[], "other"?: string }`, where the
reserved ID `other` marks the "Other" selection and `other` holds its text; choice and dropdown
allow at most one ID. Alternatives: `{ "optionId", "other"? }` for choice/dropdown with a list
only for checkbox; or bare option ID(s) with the free text kept outside the answer.] Whatever the
shape, these rules hold:

- Every selected ID is an option of the field, or the reserved `other` when `allowOther` is true;
  anything else — including `other` while "Other" is off — fails with `unknown_option`. No ID may
  appear twice (`duplicate`).
- `choice` and `dropdown` allow at most one selection (`too_many` {max: 1}).
- Choosing "Other" requires non-blank text, which is trimmed (`other_text_required`); "Other" text
  without the "Other" selection is `invalid`.
- For `checkbox`, "Other" counts as one selection toward `minSelections` / `maxSelections`
  (`too_few` / `too_many`); these limits apply only when the field is answered.
- `toCell` writes the option's label; "Other" as `<otherLabel>: <text>`; `checkbox` lists its
  selections in the config's option order with "Other" last, joined by `; `. An ID that the given
  config does not contain is written as the ID itself.
- Stored values: one `text` value per selected ID, with `other` for "Other"; the free text stays
  only in the normalised answer (item 003 decides whether `Answer` needs a column for it).
- Analytics: `text`, `counts` ("Other" is one bucket), groupable.

— _US5_

**R15. `date`: answers and storage.** Config: `includeTime` (default `false`).

- Without time: the answer is a real calendar date `YYYY-MM-DD` (years 0001–9999). It is never
  shifted or converted; stored value of kind `date`.
- With time: the answer is an ISO 8601 date-time with hours and minutes, optional seconds and
  fraction, and an explicit `Z` or `±HH:MM` offset; without an offset it fails with
  `offset_required`. It is normalised to the UTC instant `YYYY-MM-DDTHH:mm:ss.sssZ`; the original
  offset is not kept. Stored value of kind `datetime`.
- A date-time when `includeTime` is false, a date-only value when it is true, or an impossible date
  or time fails with `invalid_date`.
- Analytics: `date` or `datetime` according to `includeTime`, `timeline`, not groupable.

— _US6_

**R16. `date`: cells.** For a date-only answer `toCell` returns it unchanged, whatever time zone
is passed. For a date-time it returns the instant as ISO 8601 with milliseconds: in UTC with `Z`
when no time zone is passed, otherwise in the given IANA time zone with that instant's offset
(daylight saving applied) — e.g. `2026-11-04T10:30:00.000Z` with `Asia/Bangkok` gives
`2026-11-04T17:30:00.000+07:00`. An unknown time zone fails with `invalid_time_zone`. Which zone
the CSV uses is decided in item 007 (intent open question 1). — _US6_

**R17. `file`.** Config: `maxFiles` (integer ≥ 1, default 1); optional `maxSize` in bytes (integer
≥ 1); optional `allowedTypes`, a list of MIME types such as `application/pdf` or `image/*`
(malformed entries are `invalid`). Answer: a list of non-empty, opaque file ID strings, no ID twice
(`duplicate`), at most `maxFiles` (`too_many`). The answer holds references only: size and type
limits are enforced against the upload in item 006, and whether an ID exists and belongs to this
respondent and field is checked in 005/006, because this package cannot see files. `toCell` joins
the IDs in answer order with `; ` (item 007 turns them into names and download paths). Stored
values: one `text` value per file ID (owner decision 6). Analytics: `text`, `count`, not
groupable. — _US6_

### Versioning

**R18. ID generation.** One public function generates IDs for fields and options: random, from a
cryptographically secure source available in both Node and browsers, URL-safe, of fixed length,
with at least 64 bits of randomness, always accepted by R5's ID rules and never a reserved value.
IDs are generated once when a field or option is created and never derived from labels. — _US7_

**R19. Same question, same type.** Given a form's earlier versions in order and a candidate
version, one public call refuses the candidate when any `fieldId` in it appears in an earlier
version with a different `type` (`field_type_changed`, naming the `fieldId`, the earlier and new
type and the earlier version). It accepts changes to label, help, required, config and order,
removed fields, and a removed field coming back with the same type. [NEEDS CLARIFICATION: Must
the check also refuse a fieldId whose stored kind changes between versions — e.g. a date field
whose includeTime is switched after publish, turning calendar dates into UTC instants?
Recommended: yes, treat a change of `storeAs` like a type change (the Builder then issues a new
fieldId), so no merged column or summary mixes dates and instants. Alternative: allow it and make
007/008 handle mixed date and date-time values in one column.] The rule lives in this package, so
publish (003), the Builder (004) and any future API or AI-generated schema all obey it (ADR 0009).
— _US7_

### Platform

**R20. Runs anywhere, no UI dependency.** The package works unchanged in the supported Node LTS
and in current browsers: it imports no Node built-in module, makes no network request, and reads
no environment variable, process time zone or locale. It is ESM-only with type declarations, has
no React (or other UI library) in its dependencies or peer dependencies, and has Zod (brief §3) as
its only runtime dependency. TypeScript is strict with `noUncheckedIndexedAccess`; no `any`
without a comment. — _US1–US7_

## Edge cases

### Empty

- A form with zero fields is a valid schema; the answer set `{}` validates to an empty normalised
  set. Whether such a form may be published is item 003's call.
- `{}` for a form with required fields gives one `required` error per required field.
- `null` is the same as an absent key. Blank or whitespace-only text, an empty selection and an
  empty file list are unanswered.
- `""` for `number`, `rating` or `date` is not "unanswered" but `invalid` / `invalid_date`; the
  renderer (002) sends `null` or omits the key for "no answer".
- Optional checkbox with `minSelections: 2`: no selection is valid, one selection is `too_few`. A
  required checkbox with `minSelections: 0` still needs at least one selection.
- A field with no `config` gets all defaults; an option field without `options` fails with
  `required`, and with an empty `options` list with `too_few` {min: 1}.

### Failure

- A stored version using a type that is no longer registered (a plugin removed from the instance)
  fails with `unknown_field_type`; fields are never dropped silently.
- A plugin whose config schema becomes stricter can make older stored versions fail. Type strings
  are permanent (ADR 0007), so plugin authors must keep config backward compatible; built-in
  config changes go through `schemaVersion` migration (R7).
- Repeated `fieldId` in one schema → `duplicate_field_id`; the same option ID twice in one field →
  `duplicate_option_id`; the same option ID in two different fields is allowed (IDs are scoped per
  field). Duplicate option **labels** are allowed (IDs identify options); CSV cells then cannot
  tell them apart, so 004 may warn.
- Same `fieldId` with a different `type` across versions → `field_type_changed` (R19).
- Unknown answer keys → `unknown_field`; all other fields are still checked and reported.
- An answer set that is an array, string, number or `null` → `invalid` for the whole set, never a
  thrown exception.
- Duplicate or malformed `type`, or incompatible analytics data → refused when the definition or
  registry is created, before any form is read.
- `toCell` given an option ID that the passed config no longer has (option removed in a later
  version) writes the raw ID instead of failing.
- `toCell` given an unknown time zone → `invalid_time_zone`.
- The package has one validity level. Whether the Builder may autosave a draft that is
  temporarily invalid (e.g. a label cleared mid-edit) is decided in 003/004.

### Permission and the two worlds

- This item has no route, session or auth surface; the admin/respondent split is not exercised
  directly, but the contract must not let anything cross between the worlds:
  - The Form Schema goes to respondents, so it holds only respondent-visible content; refusing
    unknown properties keeps admin-only data out of it.
  - Answers are untrusted respondent input. The server must re-validate every submission with R8
    alone; client validation (002) is only a convenience.
  - File IDs in an answer are untrusted: this package checks shape and count only. Items 005/006
    must check that each ID is a pending upload of this respondent for this field and passed its
    size and type limits (ADR 0011).
  - Labels, help and option text are admin-written plain text, stored verbatim and never
    interpreted as markup; 002 renders them as text, so markup cannot be injected into the
    respondent page.
  - Respondent text in `toCell` output is raw. Item 007 must quote it and neutralise spreadsheet
    formula injection (cells starting with `=`, `+`, `-`, `@`) before an admin opens the CSV.
  - Answer keys such as `__proto__` cannot change validation results (R9).

### i18n (en/th)

- The package has no user-facing strings: errors are codes plus params only (numbers, IDs), so
  002 can phrase them in `en` and `th` from `messages/{en,th}.json`.
- Thai title, labels, help, options, `otherLabel` and answers are plain Unicode strings stored as
  given (no normalisation). The admin writes `otherLabel` in the form's language; 004 may prefill
  it from its messages.
- Length is counted in code points: `ที่` counts 3 (ท, ี, ่) and `👍` counts 1. The renderer's
  character counter (002) must use the same rule so client and server agree.
- `meta.language` accepts any well-formed BCP 47 tag (`th`, `en`, `ja`, `th-TH`). The respondent UI
  locale is derived from it in 005 through `resolveRespondentLocale` (000 R26): a tag with a
  region such as `th-TH` should resolve to `th`; unsupported languages fall back to `en`.
- Numbers are JSON numbers: Thai digits (`๑๒๓`) or grouped strings (`"1,000"`) are refused; the
  renderer converts input. `toCell` output uses ASCII digits.
- Dates are Gregorian ISO with ASCII digits. A Buddhist Era year (`2569-11-04`) is a valid
  Gregorian date to this package, so 002 must convert BE input before sending it.

### Limits

- Date-time without offset (`2026-11-04T17:30:00`) → `offset_required`.
- `2026-11-04T17:30+07:00` → `2026-11-04T10:30:00.000Z`; `2026-11-04T01:00:00+07:00` →
  `2026-11-03T18:00:00.000Z` (the UTC date differs, as expected).
- Date-only is never shifted: `2026-11-04` stays `2026-11-04` in every zone, including
  `Pacific/Kiritimati` (UTC+14) and `Pacific/Pago_Pago` (UTC−11).
- `2026-02-29` → `invalid_date`; `2028-02-29` is valid; `T24:00` and `T23:59:60` → `invalid_date`.
- Daylight saving: an `America/New_York` cell has offset `-05:00` for a January instant and
  `-04:00` for a July instant.
- "Other" chosen with empty or whitespace-only text → `other_text_required`.
- Checkbox with `maxSelections: 2`, two options plus "Other" chosen → `too_many` {max: 2};
  `minSelections: 2` with one option plus "Other" → valid.
- `choice` with two selected IDs → `too_many` {max: 1}.
- `allowOther: false` and `other` selected → `unknown_option` {optionId: "other"}.
- `file` with `maxFiles: 1` and two IDs → `too_many` {max: 1}; the same ID twice → `duplicate`.
- `number` with `integer: true`: `2` is valid, `2.5` → `not_integer`; `min` = `max` is allowed.
- `rating` config `max` of 1, 11 or 4.5 → config error; answer `0` → `too_small`, `max + 1` →
  `too_big`, `3.5` → `not_integer`.
- `text` config `maxLength: 0` → `too_small`; `minLength` > `maxLength` → `invalid_range`.
- Checkbox `minSelections` greater than the options (plus one with "Other") → `invalid_range`.
- `fieldId` of 65 characters or containing `.` or a space → `invalid`; option ID `other` →
  `reserved_id`.
- This item sets no caps on the number of fields or options, label length, or text length beyond
  the admin's config; request-size limits belong to 005 (long `textarea` answers vs the `Answer`
  index: see Flags).

## Roadmap phase

**MVP** — it is brief §10 MVP item 1 (`defineField` API + built-in fields) and ADR 0006 item 001
(milestone M1); every later MVP item reads or writes this schema.

## Acceptance criteria

- [ ] **AC1** Exit check: a test creates one registry with the built-in `rating` and a fixture
      third-party field (scoped type, defined in test code outside the built-ins) through the same
      public call, then validates a Form Schema using both and a response to it. (R1, R3, R6, R8)
- [ ] **AC2** Exit check: the package builds; its manifest has no `react`, `react-dom` or other UI
      library in dependencies, peer or optional dependencies; Zod is its only runtime dependency;
      the build output imports no Node built-in module. (R20)
- [ ] **AC3** Type tests: the inferred config and answer types of `rating` and of the fixture field
      equal the expected types; a `toCell` or stored-values rule written for the wrong answer type
      fails to compile. (R1)
- [ ] **AC4** Unit: a registry created without built-ins refuses a form using `text` with
      `unknown_field_type`; a registry may hold a third-party definition with type `text` instead
      of the built-in; the package exports no pre-filled registry. (R3)
- [ ] **AC5** Unit: registry creation refuses a duplicate `type` (`duplicate_field_type`) and
      malformed types such as `Text`, `my type`, `a/b/c` (`invalid_field_type`), and accepts
      `acme/signature`. (R3)
- [ ] **AC6** Unit: each incompatible `summarize` / `storeAs` pair in R2 is refused with
      `incompatible_analytics`; every built-in's `storeAs`, `summarize` and `groupable` equal the
      schema-section table (for `date`, with `includeTime` false and true). (R2, R10–R17)
- [ ] **AC7** Unit: for a valid answer to each built-in, the stored values equal the expected list
      (checkbox with "Other" → its option IDs plus `other`; file with two IDs → two `text` values;
      date-time → one `datetime`); a `storeAs: none` fixture gives an empty list. (R2, R14, R17)
- [ ] **AC8** Unit: every error produced by the failure cases of AC4–AC27 (definitions, registry,
      schema, answers, cells) has a code, params and a location and no message text, and every
      code produced by the package is in R4's list. (R4)
- [ ] **AC9** Unit: a valid schema parses with defaults written in (`required` false, rating `max` 5
      and `icon` `star`, number `integer` false, `allowOther` false, `includeTime` false,
      `maxFiles` 1); parsing the result again gives an equal value; `meta.language` `TH` comes back
      as `th`. (R5, R6)
- [ ] **AC10** Unit: each invalid schema fails with its code and path — repeated `fieldId`; repeated
      option ID in one field (the same ID in two fields passes); option ID `other` and `fieldId`
      `__proto__` (`reserved_id`); `fieldId` with a space or 65 characters; unknown type; config
      errors (rating `max` 11, text `minLength` > `maxLength`); unknown property at form, meta and
      field level; blank title or label; language `en_US` or empty. (R5, R6)
- [ ] **AC11** Unit: the read entry point accepts `schemaVersion: 1` and refuses a missing
      version, `0`, `2` and `"1"` with `unsupported_schema_version` and no other error. (R7)
- [ ] **AC12** Unit: with the fixture field, a valid answer set returns the normalised set; a set
      with three bad fields returns three `fieldId` groups; inputs `null`, `[]`, `"x"`, `1` and
      deeply nested garbage return a whole-set `invalid` without throwing. (R8, R9)
- [ ] **AC13** Unit: absent, `null`, blank text, empty selection and empty file list give
      `required` when required and are omitted when optional; keys not in the schema (including
      `__proto__` and `constructor`) give `unknown_field` and leave the other fields' results
      unchanged. (R9)
- [ ] **AC14** Unit: the fixture field declares its own "unanswered" rule through the same public
      means the built-ins use, and whole-response validation honours it. (R3, R9)
- [ ] **AC15** Unit: `"  hi  "` becomes `"hi"`; `ที่` has length 3 and `👍` length 1 against
      `minLength` / `maxLength`; `text` with a line break is `invalid` while `textarea` keeps it;
      `too_short` / `too_long` carry `min` / `max`; `toCell` returns the trimmed text. (R10)
- [ ] **AC16** Unit: `number` accepts `2.5` by default and gives `not_integer` with `integer`;
      bounds are inclusive; `"5"` is `invalid`; `toCell(1234.5)` is `"1234.5"` and
      `toCell(-0.25)` is `"-0.25"`. (R11)
- [ ] **AC17** Unit: `rating` config defaults and errors and answer errors match the Limits cases;
      `toCell(4)` is `"4"`. (R12)
- [ ] **AC18** Unit: option config with no options, a blank option label, repeated option IDs,
      option ID `other`, `allowOther` without `otherLabel`, checkbox `minSelections` >
      `maxSelections`, or `minSelections` above the selectable count is refused with its code.
      (R13)
- [ ] **AC19** Unit: option answers match the Limits cases — `choice` with two IDs, `other` while
      "Other" is off, blank "Other" text, "Other" text without the selection, checkbox "Other"
      counted toward min/max, optional checkbox with `minSelections: 2`, unknown and repeated IDs.
      (R14)
- [ ] **AC20** Unit: `toCell` gives the option label for `choice`; `อื่นๆ: TikTok` for "Other"
      with `otherLabel` `อื่นๆ`; for `checkbox`, labels in config order with "Other" last joined
      by `; `; an unknown option ID as the ID itself. (R14)
- [ ] **AC21** Unit: date-only `2026-11-04` is accepted unchanged, `2026-02-29` is `invalid_date`,
      a date-time while `includeTime` is false is `invalid_date`; `toCell` returns `2026-11-04`
      with no zone, `Pacific/Kiritimati` and `Pacific/Pago_Pago`. (R15, R16)
- [ ] **AC22** Unit: with `includeTime`, `2026-11-04T17:30+07:00` → `2026-11-04T10:30:00.000Z`,
      `2026-11-04T01:00:00+07:00` → `2026-11-03T18:00:00.000Z`, `2026-11-04T17:30:00` →
      `offset_required`, `2026-11-04` → `invalid_date`; `storeAs` is `datetime`, and `date` without
      `includeTime`. (R15)
- [ ] **AC23** Unit: date-time `toCell` gives `…Z` with no zone, `2026-11-04T17:30:00.000+07:00`
      for `Asia/Bangkok`, `-05:00` / `-04:00` for `America/New_York` in January / July, and
      `invalid_time_zone` for `Mars/Base`; results are identical with the test process time zone
      set to two different zones. (R1, R16)
- [ ] **AC24** Unit: `file` config defaults to `maxFiles` 1 and refuses `maxFiles` 0 and a malformed
      MIME entry; answers with too many IDs, a repeated ID or an empty ID fail with `too_many`,
      `duplicate`, `invalid`; `toCell` joins IDs with `; `. (R17)
- [ ] **AC25** Unit: 100,000 generated IDs all pass R5's ID rules, have the same length (at least 11
      URL-safe characters), contain no duplicate, and the same test passes in a browser-like
      environment. (R18, R20)
- [ ] **AC26** Unit: a version history where one `fieldId` is `text` in v1 and `number` in v2 is
      refused with `field_type_changed` naming the field, both types and v1; label, help,
      required, config and order changes, a removed field, and a removed field re-added with the
      same type are accepted. (R19)
- [ ] **AC27** Unit (outcome depends on the R19 marker): a `date` field with `includeTime` false in
      v1 and true in v2 under the same `fieldId` is refused (recommended answer) or accepted.
      (R19)
- [ ] **AC28** Check: the package's unit tests pass in Node and in a browser-like environment with
      the same results, and `pnpm lint` and `pnpm typecheck` pass with the strict settings. (R20)

## Flags

1. **Brief §5 lists 8 built-in fields; this spec has 9.** `file` is the owner's decision (ADR 0011,
   intent decision 6), but ADR 0011 is still _Proposed_ until the owner amends brief §5 and §10
   MVP item 1. This item builds on that Proposed ADR. Owner action: amend the brief (or confirm
   that `/impl-plan` may proceed before the amendment).
2. **Brief §5 puts React components inside `defineField`.** This spec follows ADR 0007 (headless
   core; `Render`, `Settings`, `Chart` live in the renderer's UI binding, item 002). The §5 example
   also shows `toCell: (v) => …`; here `toCell` also receives the parsed config (needed for option
   labels) and optional export options (time zone). Brief gap 2 in ADR 0006 already lists the
   example update.
3. **Brief §6 `Answer.valueDate DateTime?` is one column; this spec needs two kinds.** `storeAs`
   gains `datetime` (owner decision 5), extending ADR 0007's `"text" | "number" | "date" | "none"`.
   Proposed brief §6 change (owner to make): `valueDate` as a Postgres `date` plus a new
   `valueDateTime` as `timestamptz`; items 003/005 build them. ADR 0007 needs a matching amendment.
4. **ADR 0011 no longer matches the `file` field.** ADR 0011 says the answer holds storage key,
   name, size and type, `storeAs: "none"`, and `toCell` writes names plus a download path. Per
   owner decision 6 the answer is a list of file IDs, stored as one `text` value per file (so
   `storeAs: "text"`, not `"none"`), and `toCell` writes IDs that item 007 resolves to names and
   paths. File metadata lives with the upload record (006). ADR 0011 needs an update before it is
   accepted.
5. **`rating` groupable: brief and intent disagree.** Brief §5 and intent open question 5 say
   `groupable: false`; intent open question 6 says `true`. This spec follows the brief (the source
   of truth): **not groupable** (R12). If the owner wants rating as a cross-tab "split by"
   dimension (Phase 2), amend brief §5 and change R12; it does not affect stored data.
6. **ADR 0003 and `000-foundation` require `LocalizedText`.** ADR 0003 Consequences and the 000
   spec (Flag 1) say `001` must model schema text as `LocalizedText`. Owner decision 1 replaced
   that with one plain-text language per form. ADR 0003 needs an amendment, and multi-language form
   content (proposed in 000 for Phase 2) now means a `schemaVersion` migration.
7. **New parts of the public field API beyond ADR 0007's member list.** To let item 005 write
   `Answer` rows for any field (including plugins and "Other"), each definition must state how an
   answer becomes stored values (R2) and what counts as unanswered (R9); `storeAs` may depend on
   config (R2); `summarize` is a closed set that adds `none` (not in intent open question 6) so a
   `storeAs: "none"` plugin has a valid pairing. `/impl-plan` should record these, together with
   single-language text and `schemaVersion`, in one ADR or an amendment to ADR 0007/0009 (as the
   intent asks).
8. **Downstream risks, not conflicts:**
   - Brief §6 indexes `Answer(fieldId, valueText)`. Long `textarea` answers can exceed Postgres's
     B-tree index row size; item 003 must decide (e.g. no index on long text, or a prefix/hash).
   - File IDs, "Other" text and all answers are untrusted respondent input; 005/006 must check file
     ownership and limits, and 007 must neutralise CSV formula injection (Edge cases, Permission).
   - 005 must map a region-tagged `meta.language` (e.g. `th-TH`) to the UI locale `th`.
9. **Size is at the ADR 0006 limit: 20 of 20 requirements**, with R4 and R14 dense. Nothing was
   trimmed. If `/tasks` goes over 40 tasks, apply the intent's fallback split (open question 7)
   along story lines: US1–US4 and US7 stay in `001-field-core`; US5 (option fields with "Other")
   and US6 (date, file) move to `001b`.
10. **No BI creep.** `summarize` and `groupable` are data only; no charts, pivot tables, formulas or
    dashboards. No custom condition language. Intent open question 1 (CSV time zone) stays with
    item 007; this item only accepts an optional time zone in `toCell` (R16).
