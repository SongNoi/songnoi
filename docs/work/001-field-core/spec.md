# 001 — Field core: spec

Source: [intent.md](./intent.md). Brief references: §2 (design rules), §5 (field plugin API), §6
(data model), §9 (analytics), §10 (MVP item 1). ADRs: 0006 (item 001 scope and exit check), 0007
(headless field core), 0009 (versioning and stable IDs), 0011 (file field, still Proposed), 0003
(i18n).

The owner decisions recorded in intent.md (interview 2026-11-04) are taken as given and are not
re-opened here. Where the intent's open questions had a sound recommendation consistent with those
decisions, it is stated below as a requirement. The two markers of the first draft (R14, R19) and
six further questions (rating `groupable`, text length counting, the stored-kind error code, rating
scale changes across versions, how Node/browser parity is proven, and the status of the brief and
ADR gaps) were answered by the owner on 2026-11-05 in two rounds. A third round on 2026-11-05,
after `/analyze`, settled four more points (number cells, strict configs, plugin exceptions,
checkbox `maxSelections`) and aligned the spec with the approved `plan.md` and ADR 0012; a
second `/analyze` pass the same day led to one more sync with the revised `plan.md`, with no owner
decision. On 2026-11-06, after `/implement` and two `/converge` rounds, the spec was synced with
the implementation details recorded in `plan.md` (Revisions), again with no owner decision. All
answers are written into the sections below (log: Clarifications).

**Terms** (spec term = API name in plan.md, for tracing only): "export options" = `CellOptions`,
validated by `parseCellOptions`; "answer-compatibility rule" = `incompatibleChanges`; "unanswered"
rule = `isUnanswered`; "stored values" = `storedValues`; read entry point = `parseFormSchema`;
whole-response validation = `validateResponse`; version check = `checkVersionHistory`; "ID rules"
(R5) = `idSchema`, the public ID schema for `fieldId` and option IDs.

## How does the form schema change?

**It is created from nothing.** `@songnoi/schema` is an empty placeholder today. This item defines
the first Form Schema contract, `schemaVersion: 1`. Once released it is frozen: any later change
to the stored format needs a new `schemaVersion` and a migration step (R7), and follows ADR 0009
(stable IDs, immutable published versions).

### Form Schema (stored as `Form.draftSchema` and `FormVersion.schema`, brief §6)

| Part               | Contents                                    | Rules                                                                      |
| ------------------ | ------------------------------------------- | -------------------------------------------------------------------------- |
| `schemaVersion`    | the literal `1`                             | required; anything else is refused (R7)                                    |
| `meta.title`       | plain string                                | required, not blank                                                        |
| `meta.description` | plain string                                | optional                                                                   |
| `meta.language`    | Unicode BCP 47 locale identifier, e.g. `th` | required; canonicalised (R5); **one language per form** (owner decision 1) |
| `fields`           | ordered list of field entries               | list order is display order; may be empty                                  |

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
  (those belong on the `Form` record in items 003, 005, 007). Unknown properties are refused at
  form, meta and field-entry level and inside built-in configs, option entries included (R6), so
  nothing else can be stored there; third-party configs are recommended to be just as strict.
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
| `rating`   | `max` (`5`, range 2–10), `icon` (`star` \| `heart`, default `star`)             | integer 1 … `max`                                                 | 1 × `number`                      | `distribution+avg` | yes ²       |
| `file`     | `maxFiles` (`1`), `maxSize`? (bytes), `allowedTypes`? (MIME types, `type/*` ok) | list of file IDs                                                  | 1 × `text` per file ID            | `count`            | no          |

¹ One answer shape for all three: `{ "optionIds": [...], "other"?: "..." }`, where the reserved ID
`other` marks the "Other" selection and `other` holds its text (R14).

² Owner decision 2026-11-05; departs from the brief §5 example (Flag 5).

**Answer compatibility across versions (R19).** A definition may declare which config changes make
answers under the same `fieldId` incomparable. Among the built-ins only `rating` declares one: a
different `max`, because a 1–5 and a 1–10 scale must never share an average or a split-by (R12); a
different `icon` is fine. `date` needs no rule, since switching `includeTime` already changes the
stored kind. The other seven declare none: number bounds and `integer`, text length limits,
selection limits and file limits change what is accepted, not what a stored value means, and option
IDs keep option answers comparable when options are added, removed or relabelled, or "Other" is
switched on or off.

Property names above are the proposed stored names; once released they are as permanent as `type`
strings.

### Answer set (stored as `Response.answers`, brief §6)

A JSON object keyed by `fieldId`; each value has the answer shape of that field's type.
Whole-response validation (R8) returns the **normalised** set: unanswered fields omitted, text
trimmed, date-times in UTC. Item 005 stores that normalised set. The `Answer` rows (one per stored
value, ADR 0007 point 5) come from each field's stored values (R2). The answer shapes in the
table, including the option-field object `{ "optionIds": [...], "other"?: "..." }`, are part of
the stored format and as permanent as the config property names.

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

Answer set (the checkbox answer uses the option-field shape of R14):
`{ "k3Jx9aQ2mTzL": 4, "Vb7-pL0wQe4R": { "optionIds": ["Qm2xT8aLp0vW", "other"], "other": "TikTok" } }`

### Impact on later items (not built here)

- `storeAs` gains `datetime` next to `date`, so the `Answer` table will need a calendar-date
  column and a UTC-instant column (brief §6 has one `valueDate DateTime?`; see Flags). Items 003
  and 005 build it.
- `file` stores one `text` value (the file ID) per file, not `none` (see Flags).
- A `fieldId` keeps one `type`, one stored kind and, where its definition declares it, comparable
  config (e.g. one rating scale) across all versions (R19), so the merged columns and summaries of
  007 and 008 never mix kinds (e.g. calendar dates and instants) or scales (e.g. averages of a 1–5
  and a 1–10 rating).

## User stories

### US1 — Define and register a field type through the public API (P1)

- **Who:** a plugin author, and the SongNoi developer writing the built-ins with the same API.
  Admins and respondents are indirect users: what they can configure and answer is what field
  definitions allow.
- **Want:** to declare a field type once — permanent `type`, config with defaults, answer rules
  built from the config, cell conversion, stored values, analytics data and which config changes
  keep answers comparable across versions — with config and answer types inferred from the
  schemas, and to register it through the same public call the built-ins use.
- **So that:** built-ins have no privileges (brief §2), and the renderer, server, export and
  analytics all read one typed contract that contains no UI code.
- **Independent test:** with no built-in loaded, a fixture third-party field with a scoped type,
  including its own answer-compatibility rule, is defined and registered through the public
  calls; type tests show its inferred types; duplicate or malformed types and incompatible
  analytics data are refused.

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
  through a registry created with the public call, and of `rating`'s answer-compatibility rule,
  which refuses a `max` change and accepts an `icon` change.

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
  after publish does not split their data, while a changed meaning or scale gets a new question.
- **Want:** an ID generator for fields and options, and a check that refuses a version in which an
  existing `fieldId` changes type, stored kind, or a config setting that its definition declares
  incompatible (e.g. a rating's `max`).
- **So that:** export and analytics can merge versions by `fieldId` (ADR 0009) without mixing kinds
  or scales, and every source of schemas (Builder, API, future AI generation) obeys the same rule.
- **Independent test:** generated IDs are URL-safe, fixed-length and unique over a large sample, in
  Node and in Chromium; version histories with a type change, with a `date` field's `includeTime`
  switched, or with a `rating` field's `max` changed under the same `fieldId` are each refused with
  their own code and the conflict listed; a fixture field's own compatibility rule is honoured the
  same way; label, option, order and rating `icon` changes pass.

## Requirements

### Field API and registry

**R1. Public field definition.** One public call defines a field type from: a `type` string; a
config schema with defaults; an answer schema built from the parsed config; a cell converter
(`toCell`); how a valid answer becomes stored values; data-only analytics (`storeAs`, `summarize`,
`groupable`); and, optionally, an answer-compatibility rule over an earlier and a new parsed config
(R19). Config and answer types are inferred from those schemas, never written by hand, and every
other part receives the inferred types. A definition holds no UI component. `toCell` receives a
valid answer, the parsed config and optional export options that the package has already
validated (in MVP only an IANA time zone, R16), returns a string, is pure, and never reads the
environment (process time zone, locale, variables); the compatibility rule is pure as well.
— _US1_

**R2. Analytics data and stored values.** `storeAs` is one of `text`, `number`, `date` (calendar
date), `datetime` (UTC instant) or `none`, and may depend on the parsed config (needed by `date`). A
config-dependent `storeAs` declares the kinds it can give; if for some config it resolves to
anything other than one of its declared kinds, the package throws a developer-facing `TypeError`
wherever the kind is read (e.g. the version check, R19): a broken plugin is loud (R8), and this is
not a catalogue issue (R4).
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
schema, or for the version check's input a path inside its list of earlier versions (R19); a
`fieldId` plus optional path inside the answer; or the answer set as a whole), never as display
text. The package contains no user-facing strings (constitution 13); item 002 maps codes
to `messages/{en,th}.json`. Errors from a third-party field's own rules come out in the same
code-plus-params form. The list is **closed in MVP**: a third-party field's rules can raise only
these codes, and any other code, or a rule failure with no matching code, comes out as `invalid`
(adding a code changes the package and both message files). The package produces only these codes:

- values and config: `required`, `invalid`, `too_short` {min}, `too_long` {max}, `too_small`
  {min}, `too_big` {max}, `not_integer`, `too_few` {min}, `too_many` {max}, `invalid_range` {min,
  max}, `duplicate` {value}, `unknown_option` {optionId}, `other_text_required`, `invalid_date`,
  `offset_required`;
- answer set: `unknown_field` {fieldId};
- Form Schema: `unsupported_schema_version` {found}, `unknown_property` {key},
  `unknown_field_type` {type}, `duplicate_field_id` {fieldId}, `duplicate_option_id` {optionId},
  `reserved_id` {id};
- version history (R19): `field_type_changed` {fieldId, previousType, type, version},
  `field_kind_changed` {fieldId, type, previousStoreAs, storeAs, version},
  `field_config_incompatible` {fieldId, type, properties, version};
- definitions, registry and export: `invalid_field_type` {type}, `duplicate_field_type` {type},
  `incompatible_analytics` {storeAs, summarize}, `invalid_time_zone` {timeZone}.

The catalogue covers issues about definitions, schemas, answers and export options. Outside it are
the faults the package detects in a third-party definition's own rules at run time — a stored kind
the definition did not declare (R2), an answer-compatibility result that is not a list of config
property names (R19): they are programming faults, not issues about a schema or an answer, so the
package throws a developer-facing `TypeError` for them, like any other exception from plugin code
(R8), and they have no code or message file entry.

— _US1, US2, US3, US7_

### Form Schema

**R5. Form Schema structure.** A Form Schema has exactly `schemaVersion`, `meta` and `fields` as
described in "How does the form schema change?". `meta` holds a non-blank `title`, an optional
`description` and a required `language`. Each field entry holds `fieldId`, `type`, a non-blank
`label`, optional `help`, `required` (default `false`) and `config`. A missing, empty or
whitespace-only `title` or `label` fails with `required`. All text is plain strings in the form's
one language.

- `language` is a Unicode BCP 47 locale identifier (Unicode UTS #35), returned canonicalised: case
  is normalised and deprecated aliases are replaced (`TH` → `th`, `th-th` → `th-TH`, `iw` → `he`).
  A malformed tag (`en_US`, empty) is `invalid`, and so are a few rare forms that BCP 47 allows but
  Unicode locale identifiers do not: extended language subtags, private-use-only tags (e.g.
  `x-private`) and grandfathered tags.
- `fieldId`s and option IDs are 1–64 URL-safe characters (`A–Z a–z 0–9 _ -`); `__proto__`,
  `constructor` and `prototype` are refused as `fieldId`s and `other` as an option ID
  (`reserved_id`).

— _US2_

**R6. Form Schema validation.** Validating a candidate against a registry returns either the
parsed schema or every error with its path. It refuses unknown properties (`unknown_property`
{key}, with its path) at form, meta and field-entry level and inside every built-in field's
config, each option entry included; a `type` not in the registry (`unknown_field_type`); a config
that fails its type's config schema (codes from R4 at the config path); and a repeated `fieldId`
(`duplicate_field_id`). Third-party fields are recommended, not required, to make their configs
just as strict. A released config shape is frozen: a built-in config changes only with a new
`schemaVersion` and a migration step (R7); a plugin cannot migrate stored versions, so it must not
change its released config shape (with a strict config, a removed or renamed key would make every
stored version that holds it fail with `unknown_property`). Only an absent `config` gets the
defaults: `config: null` is passed to the type's config schema like any other value, and every
built-in refuses it with `invalid`. The parsed schema has every config default written in, so a stored version does not change meaning if a default changes later, and
parsing the parsed output again gives an equal value. — _US2_

**R7. Format version and migration.** Stored schemas are read through one public entry point that
first brings the input to the current format and then validates it (R6). In this item the current
format is `schemaVersion: 1`. Input that is not a JSON object is refused with `invalid` at the
root; otherwise a missing, non-integer or unknown version (e.g. `0`, `2`, `"1"`) is refused with
`unsupported_schema_version` before any other check. Every future change to the stored format —
including any built-in field's config — bumps the literal and adds a migration step from the
previous version; stored published versions are migrated when read, never rewritten
(constitution 8). — _US2_

### Whole-response validation

**R8. One call validates a whole response.** Given a parsed Form Schema, its registry and a
candidate answer set (any JSON value), one public call returns either success with the normalised
answer set, or failure with every error found, grouped by `fieldId` plus one group for the answer
set as a whole. It checks all fields (never stops at the first error), gives the same result in
Node and in a browser, and needs nothing outside this package (ADR 0007), so the server can
re-validate without trusting client checks. The registry must hold the definitions the schema was
read with: a field whose `type` is missing from the registry passed to this call gets
`unknown_field_type` {type} in its own group at path `[]`, whether it is answered or not; its value
is not checked, the result is a failure, and nothing is thrown, so a registry that does not match
the schema can never accept a response. On any engine that meets R20's baseline, the package and
the built-in fields never throw for any JSON input (the one stated exception is in R20; faults of
third-party definitions are not covered). An exception thrown by a third-party field's own code
(e.g. its answer or "unanswered" rule) propagates to the caller unchanged, and a third-party rule
whose result breaks its contract — a stored kind it did not declare (R2), an answer-compatibility
result that is not a list of config property names (R19) — makes the package throw a
developer-facing `TypeError` wherever that result is read: a broken plugin must be loud, not
disguised as an invalid answer or a catalogue issue (R4). — _US3_

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
leading and trailing whitespace. Its length is the number of user-perceived characters after
trimming — extended grapheme clusters as defined by Unicode UAX #29 — so a Thai consonant with the
vowel and tone marks written above or below it, an emoji with a skin-tone modifier and an emoji ZWJ
sequence each count 1 (`too_short` / `too_long`). The count is the same in Node and in modern browsers, so the browser
and the server accept exactly the same answers. A line break is an ECMAScript line terminator: LF,
CR, LS (U+2028) or PS (U+2029); NEL (U+0085), VT and FF are not line breaks. `text` refuses line
breaks (`invalid`), `textarea` keeps them. `toCell` returns the trimmed text. Stored value: the
text. Analytics: `text`, `responses`, not groupable. — _US4_

**R11. `number`.** Config: optional finite `min` and `max` with `min` ≤ `max` (`invalid_range`),
and `integer` (default `false`). Answer: a finite JSON number (a numeric string such as `"5"` is
`invalid`); decimals are allowed unless `integer` is set (`not_integer`); bounds are inclusive
(`too_small` / `too_big`). There is no precision or step setting. `toCell` writes the number in
plain decimal notation, never exponent notation, and without locale formatting: ASCII digits, an
optional leading `-`, `.` as decimal point, no grouping (`1e+21` → `1000000000000000000000`,
`1e-7` → `0.0000001`); the cell reads back as the same number. Stored value: the number.
Analytics: `number`, `histogram+stats`, not groupable. — _US4_

**R12. `rating`.** Config: `max`, an integer from 2 to 10 (default 5); `icon`, `star` or `heart`
(default `star`); the minimum is always 1. Answer: an integer from 1 to `max` (`not_integer`,
`too_small`, `too_big`). `toCell` writes the integer. Stored value: the number. Analytics:
`number`, `distribution+avg`, **groupable** (owner decision 2026-11-05, departing from the brief §5
example; see Flag 5). Answer compatibility (R19): the definition declares a change of `max`
incompatible, so a rescaled rating needs a new `fieldId` and averages and split-by never mix scales
(owner decision 2026-11-05); a change of `icon` is compatible. — _US4_

**R13. `choice`, `dropdown`, `checkbox`: config.** Shared config: `options`, an ordered list of at
least one `{ id, label }` (`too_few` {min: 1}; no other keys, R6) with unique IDs
(`duplicate_option_id`) and non-blank labels; `allowOther` (default `false`); `otherLabel`, a
non-blank plain string in the form's language, required when `allowOther` is true (the package
supplies no default text). A missing or blank option label, a blank `otherLabel`, and a missing
`otherLabel` while `allowOther` is true fail with `required`. `checkbox` adds optional
`minSelections` (integer ≥ 0) and `maxSelections` (integer ≥ 1, so `maxSelections: 0` fails with
`too_small` {min: 1}); `minSelections` must not exceed `maxSelections` when both are set, nor the
number of options plus one if "Other" is allowed (otherwise `invalid_range`). `choice` and
`dropdown` have the same config and answer rules and differ only in how they are rendered (002).
— _US5_

**R14. `choice`, `dropdown`, `checkbox`: answers, cells, stored values.** All three use one answer
shape: an object with exactly `optionIds`, a list of selected option ID strings, and `other`, a
string holding the "Other" text, present only when the reserved ID `other` is selected — e.g.
`{ "optionIds": ["Qm2xT8aLp0vW", "other"], "other": "TikTok" }`. Any other shape (a bare ID
string, `optionIds` that is not a list of strings, an extra property) is `invalid`.
`{ "optionIds": [] }` is an empty selection, i.e. unanswered (R9).

- Every selected ID is an option of the field, or the reserved `other` when `allowOther` is true;
  anything else — including `other` while "Other" is off — fails with `unknown_option`. With
  "Other" off, a selected `other` gives only that `unknown_option`: its text is not checked, so
  there is no `other_text_required`. No ID may appear twice (`duplicate`).
- `choice` and `dropdown` allow at most one ID in `optionIds` (`too_many` {max: 1}).
- Selection limits count every entry of `optionIds`, repeats included, so a repeated ID can give
  both `duplicate` and `too_many`.
- When `other` is selected, `other` is required and must be non-empty after trimming; missing,
  `null`, empty or whitespace-only text fails with `other_text_required` (`null` counts as
  missing), and the normalised answer holds the trimmed text. When `other` is not selected, the
  `other` property must be absent: any value, even `""` or `null`, is `invalid`.
- For `checkbox`, "Other" counts as one selection toward `minSelections` / `maxSelections`
  (`too_few` / `too_many`); these limits apply only when the field is answered.
- `toCell` writes the option's label, and "Other" as `<otherLabel>: <text>`, or as
  `other: <text>` when the given config has no `otherLabel` (e.g. a later version with "Other"
  switched off). An ID that the given config does not contain is written as the ID itself.
  `checkbox` lists the selected options that the config contains in its option order, then the IDs
  it does not contain in answer order, then "Other" last, all joined by `; `.
- Stored values: one `text` value per selected ID, with `other` for "Other"; the free text stays
  only in the normalised answer (item 003 decides whether `Answer` needs a column for it).
- Analytics: `text`, `counts` ("Other" is one bucket), groupable.

— _US5_

**R15. `date`: answers and storage.** Config: `includeTime` (default `false`).

- Without time: the answer is a real calendar date `YYYY-MM-DD` (years 0001–9999). It is never
  shifted or converted; stored value of kind `date`.
- With time: the answer is an ISO 8601 date-time with hours and minutes, optional seconds with an
  optional fraction of 1–9 digits, and an explicit `Z` or `±HH:MM` offset; without an offset it
  fails with `offset_required`. It is normalised to the UTC instant `YYYY-MM-DDTHH:mm:ss.sssZ`: a
  fraction is truncated (not rounded) to milliseconds, and the original offset is not kept. The
  UTC instant must lie in years 0001–9999, else `invalid_date`; only the UTC year is checked, so a
  local year 0000 is accepted when its offset moves the instant into year 0001
  (`0000-12-31T23:30-01:00` → `0001-01-01T00:30:00.000Z`). Stored value of kind `datetime`.
- A date-time when `includeTime` is false, a date-only value when it is true, or an impossible date
  or time fails with `invalid_date`.
- A date answer is a string and is not trimmed: a non-string fails with `invalid`, and a string
  padded with spaces or a line break, `""` or a blank string fails like any other refused string
  (`invalid_date`, or `offset_required` for a date-time shape without an offset).
- Analytics: `date` or `datetime` according to `includeTime`, `timeline`, not groupable.

— _US6_

**R16. `date`: cells.** For a date-only answer `toCell` returns it unchanged, whatever time zone
is passed. For a date-time it returns the instant as ISO 8601 with milliseconds: in UTC with `Z`
when no time zone is passed, otherwise in the given IANA time zone with that instant's offset
(daylight saving applied) — e.g. `2026-11-04T10:30:00.000Z` with `Asia/Bangkok` gives
`2026-11-04T17:30:00.000+07:00`. An offset with seconds (historical local mean time) is rounded to
the minute and the wall time shifted to match, so the cell still names the exact instant. A
wall-clock year above 9999 — reachable only for instants at the very end of year 9999 in a zone
ahead of UTC — is written in the ISO 8601 expanded year form (`9999-12-31T23:30:00.000Z` with
`Asia/Bangkok` gives `+010000-01-01T06:30:00.000+07:00`); item 007 must expect it. The time
zone is checked once, when the export options are validated, before any cell is written: a name
that is not an IANA time zone (e.g. `Mars/Base`, `+07:00`, empty) fails with `invalid_time_zone`,
a time zone that is not a string with `invalid`, and an export-option key other than `timeZone`
with `unknown_property` {key}; `toCell` only ever receives validated options and never fails on a zone (R1). Which zone the CSV
uses is decided in item 007 (intent open question 1). — _US6_

**R17. `file`.** Config: `maxFiles` (integer ≥ 1, default 1); optional `maxSize` in bytes (integer
≥ 1); optional `allowedTypes`, a list of at least one MIME type (`[]` fails with `too_few`
{min: 1}) such as `application/pdf` or `image/*` (malformed entries and `*/*` are `invalid`).
Answer: a list of non-empty, opaque file ID strings, no ID twice (`duplicate`), at most `maxFiles`
(`too_many`). The answer holds references only: size and type
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

**R19. Same question, comparable answers.** Given the registry, a form's earlier versions (each a
parsed schema with its stored `version` number, passed in any order) and a candidate version, one
public call refuses the candidate when a `fieldId` in it also appears in an earlier version and the
answers of the two cannot be merged.

The version numbers are checked first. A `version` that is not a positive safe integer (e.g. `0`,
`-1`, `1.5`) fails with `invalid`, and a `version` already seen in the list fails with `duplicate`
{value} at the repeat; both are located at `["earlier", k, "version"]`, `k` being the position in
the list as passed. If any such error exists, only those errors are returned and no field is
compared. No earlier version (a form never published) means nothing to compare: the candidate is
accepted. "Most recent" below means the highest `version` number, whatever the list order. The
field checks are:

- a different `type` → `field_type_changed`;
- the same `type` but a different stored kind (the `storeAs` its definition gives for that
  version's parsed config; e.g. a `date` field whose `includeTime` was switched, `date` ↔
  `datetime`) → `field_kind_changed`;
- the same `type` and stored kind, but a config change that the definition's answer-compatibility
  rule (R1) refuses: the rule receives the earlier and the new parsed config and either accepts the
  change or names the config properties that make answers incomparable →
  `field_config_incompatible` with those properties. A definition without a rule accepts every
  config change that keeps the stored kind. The rule's result must be a list whose every entry is
  a config property name of the field: a name counts when either compared config holds it as its
  own property, or the definition's config shape declares it (so an optional key without a
  default, absent from both configs, may be named); inherited names (e.g. `toString`) never
  count. Any other result (a bare string, `null`, a non-name entry) makes the check throw a
  developer-facing `TypeError` (R8), not a catalogue issue (R4).

Each conflicting `fieldId` gives one error, located at that field in the candidate
(`["fields", i]`), naming the earlier `version`: the first failing check in the order above,
against the most recent earlier version it conflicts with. The Builder must then issue a new
`fieldId`, so no merged column or summary mixes kinds or scales. The call reads `type`, `storeAs`
and the rules from the registry's definitions only, with no special case for any built-in; among
the built-ins only `rating` declares a rule (R12). The registry is consulted only when a check
needs a definition: comparing `type` strings needs none, so a new candidate field (its `fieldId`
in no earlier version) of a type the registry lacks gets no issue here (parsing the candidate with
that registry already refuses it, R6). When the stored-kind or config check needs the definition
of a `type` that the registry does not hold (schemas read with another registry), that field gets
one `unknown_field_type` {type} at the candidate's `["fields", i, "type"]` and is skipped: if the
most recent earlier version with the same type needs the missing definition, older versions are
not compared for that field. Nothing is thrown for a registry miss. The call accepts
changes to label, help, required and order, compatible config changes, removed fields, and a
removed field coming back with the same type and stored kind and a compatible config. The check lives in this package, so publish (003), the Builder (004) and
any future API or AI-generated schema all obey it (ADR 0009). — _US7_

### Platform

**R20. Runs anywhere, no UI dependency.** The package works unchanged in the supported Node LTS
and in current browsers: it imports no Node built-in module, makes no network request, and reads
no environment variable, process time zone or locale. It is ESM-only with type declarations, has
no React (or other UI library) in its dependencies or peer dependencies, and has Zod (brief §3) as
its only runtime dependency. TypeScript is strict with `noUncheckedIndexedAccess`; no `any`
without a comment.

Baseline: the package requires `Intl.Segmenter` (for R10's length counting); the supported Node
LTS and current browsers all have it. On an engine without it, importing the package still works,
but counting a text length — which happens only when a `text` or `textarea` field sets a length
limit — throws. This is the one stated exception to "the package and the built-ins never throw"
(R8); there is no silent fallback counter, because it would make browser and server disagree
(R10). — _US1–US7_

## Edge cases

### Empty

- A form with zero fields is a valid schema; the answer set `{}` validates to an empty normalised
  set. Whether such a form may be published is item 003's call.
- `{}` for a form with required fields gives one `required` error per required field.
- `null` is the same as an absent key. Blank or whitespace-only text, an empty selection
  (`{ "optionIds": [] }`) and an empty file list are unanswered. `{ "optionIds": [], "other": "x" }`
  is not unanswered but `invalid` ("Other" text without the "Other" selection, R14).
- `""` for `number`, `rating` or `date` is not "unanswered" but `invalid` / `invalid_date`; the
  renderer (002) sends `null` or omits the key for "no answer".
- Optional checkbox with `minSelections: 2`: no selection is valid, one selection is `too_few`. A
  required checkbox with `minSelections: 0` still needs at least one selection.
- A field with no `config` gets all defaults; `config: null` is not absent and fails with
  `invalid` for every built-in (R6). An option field without `options` fails with `required`, and
  with an empty `options` list with `too_few` {min: 1}.

### Failure

- A stored version using a type that is no longer registered (a plugin removed from the instance)
  fails with `unknown_field_type`, also when it is read as an earlier version for the R19 check;
  fields are never dropped silently. A parsed schema handed to whole-response validation or the
  version check with a registry that lacks one of its types gives `unknown_field_type` for that
  field (R8: in its group, answered or not, result not ok; R19: at the candidate's
  `["fields", i, "type"]`), never a thrown exception.
- Earlier versions passed to the version check out of order are compared by `version` number, so
  the result does not depend on the order. A `version` of `0`, `-1` or `1.5` → `invalid`, the same
  `version` twice → `duplicate` {value}, each at `["earlier", k, "version"]` and returned alone,
  without comparing any field (R19).
- An engine without `Intl.Segmenter` is below the package's baseline (R20): import works, but a
  `text` or `textarea` answer to a field with a length limit throws instead of being counted. All
  supported Node and browser targets have it.
- A plugin whose config schema changes after release can make older stored versions fail (e.g. a
  strict config refuses a key it no longer knows with `unknown_property`). Type strings are
  permanent (ADR 0007) and a released config shape is frozen (R6), so plugin authors must not
  change it; built-in config changes go through `schemaVersion` migration (R7). Likewise, a plugin
  release that changes the `storeAs` it gives for a config, or tightens its answer-compatibility
  rule, can make an existing version history conflict, so the next publish of such a form is
  refused (R19); plugin authors must keep both stable.
- Repeated `fieldId` in one schema → `duplicate_field_id`; the same option ID twice in one field →
  `duplicate_option_id`; the same option ID in two different fields is allowed (IDs are scoped per
  field). Duplicate option **labels** are allowed (IDs identify options); CSV cells then cannot
  tell them apart, so 004 may warn.
- Same `fieldId` with a different `type` across versions → `field_type_changed` (R19), and only
  that, even when the stored kind changes too (e.g. `text` → `number`).
- Same `fieldId` and `type` but a different stored kind across versions → `field_kind_changed`.
  Example: a `date` field published with `includeTime` false, then switched to true under the same
  `fieldId` (`date` → `datetime`), gives `field_kind_changed` {type: `date`, previousStoreAs:
  `date`, storeAs: `datetime`}; the switch back is refused too. The Builder (004) must give the
  switched question a new `fieldId`.
- Same `fieldId`, `type` and stored kind, but a config change that the definition declares
  incompatible → `field_config_incompatible`. Example: a `rating` published with `max` 5, then set
  to 10 under the same `fieldId`, gives `field_config_incompatible` {type: `rating`, properties:
  [`max`]}; 10 → 5 is refused too, and so is a field removed in one version that comes back later
  with a different `max`. The Builder (004) must give the rescaled question a new `fieldId`. A form
  that was never published has no earlier version, so its draft rating may change `max` freely.
- Config changes that keep the stored kind and that no rule declares incompatible pass: an option
  added, removed or relabelled, "Other" switched on or off, a text length limit or number bound
  changed, `integer` switched, rating `icon` changed, `maxFiles` raised.
- Unknown answer keys → `unknown_field`; all other fields are still checked and reported.
- An answer set that is an array, string, number or `null` → `invalid` for the whole set, never a
  thrown exception.
- A third-party field whose own code throws (e.g. a bug in its answer or "unanswered" rule): the
  exception propagates out of whole-response validation to the caller and is never turned into
  `invalid` or `required` (R8). It is a server fault for 005 to report, not the respondent's
  mistake.
- A third-party rule whose result breaks its contract is a developer-facing `TypeError`, never a
  catalogue issue (R4, R8): a config-dependent `storeAs` that resolves to a kind it did not
  declare (`"Text"`, `"json"`, `null`, a kind outside its declared list) throws wherever the kind
  is read, e.g. in the version check (R2); an answer-compatibility rule that returns a bare string
  such as `"max"`, `null`, or a list holding a non-string or a name that is not a config property
  of the field throws in the version check (R19). A rule naming an optional config key that
  neither compared config holds (e.g. checkbox `minSelections`) is fine, because the config shape
  declares it.
- The version check with a registry that lacks a type: a new candidate field of that type (its
  `fieldId` in no earlier version) gets no issue there, as parsing already refused it; a field
  whose most recent same-type earlier version needs the missing definition gets one
  `unknown_field_type`, and older versions are not compared for it (R19).
- A third-party rule that raises a code outside R4's list comes out as `invalid`; the catalogue is
  closed in MVP (R4).
- Duplicate or malformed `type`, or incompatible analytics data → refused when the definition or
  registry is created, before any form is read.
- `toCell` given an option ID that the passed config no longer has (option removed in a later
  version) writes the raw ID instead of failing.
- An unknown time zone for date-time cells → `invalid_time_zone` when the export options are
  validated, once and before any cell is written; `toCell` never receives it (R1, R16).
- The package has one validity level. Whether the Builder may autosave a draft that is
  temporarily invalid (e.g. a label cleared mid-edit) is decided in 003/004.

### Permission and the two worlds

- This item has no route, session or auth surface; the admin/respondent split is not exercised
  directly, but the contract must not let anything cross between the worlds:
  - The Form Schema goes to respondents, so it holds only respondent-visible content; refusing
    unknown properties (form, meta, field entries, built-in configs and option entries) keeps
    admin-only data out of it. A third-party config that keeps unknown keys could carry extra data
    to respondents, hence the recommendation that plugin configs be strict (R6).
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
- Length (R10) is counted in user-perceived characters (extended grapheme clusters, UAX #29)
  after trimming — not in code points or UTF-16 units: `ที่` (ท + ี + ่, 3 code points) counts 1;
  `สวัสดี` (6 code points) counts 4; a vowel written beside the consonant is a character of its
  own, so `กา` counts 2; `👍🏽` (thumbs up + skin-tone modifier) counts 1; the family
  emoji `👨‍👩‍👧‍👦` (four people joined by three ZWJ, 7 code points) counts 1; the flag `🇹🇭` counts 1.
  Node and modern browsers must give the same count (proven in Node and in Chromium, AC15), and
  the renderer's character counter (002) must use the same rule so client and server agree.
- `meta.language` accepts Unicode BCP 47 locale identifiers (`th`, `en`, `ja`, `th-TH`) and keeps
  their canonical form (`th-th` → `th-TH`); rare BCP 47-only forms (extended language subtags,
  private-use-only and grandfathered tags) are `invalid` (R5). The respondent UI locale is derived
  from it in 005 through `resolveRespondentLocale` (000 R26): a tag with a region such as `th-TH`
  should resolve to `th`; unsupported languages fall back to `en`.
- Numbers are JSON numbers: Thai digits (`๑๒๓`) or grouped strings (`"1,000"`) are refused; the
  renderer converts input. `toCell` output uses ASCII digits in plain decimal notation (R11).
- Dates are Gregorian ISO with ASCII digits. A Buddhist Era year (`2569-11-04`) is a valid
  Gregorian date to this package, so 002 must convert BE input before sending it.

### Limits

- Date-time without offset (`2026-11-04T17:30:00`) → `offset_required`.
- `2026-11-04T17:30+07:00` → `2026-11-04T10:30:00.000Z`; `2026-11-04T01:00:00+07:00` →
  `2026-11-03T18:00:00.000Z` (the UTC date differs, as expected).
- Date-only is never shifted: `2026-11-04` stays `2026-11-04` in every zone, including
  `Pacific/Kiritimati` (UTC+14) and `Pacific/Pago_Pago` (UTC−11).
- `2026-02-29` → `invalid_date`; `2028-02-29` is valid; `T24:00` and `T23:59:60` → `invalid_date`.
- Fractions of a second: 1–9 digits are accepted and truncated to milliseconds, never rounded:
  `2026-11-04T10:30:00.123456789Z` → `2026-11-04T10:30:00.123Z`, `.9999` → `.999`.
- The UTC instant must lie in years 0001–9999: `0001-01-01T00:30+01:00` (UTC year 0000) and
  `9999-12-31T23:30-01:00` (UTC year 10000) → `invalid_date`; only the UTC year is checked, so
  `0000-12-31T23:30-01:00` → `0001-01-01T00:30:00.000Z` is valid.
- Date answers are not trimmed: `" 2026-11-04 "`, `"2026-11-04\n"`, `""` and `"  "` →
  `invalid_date` (also on an optional field); a non-string such as `20261104` → `invalid`.
- A date-time cell whose wall-clock year passes 9999: `9999-12-31T23:30:00.000Z` with
  `Asia/Bangkok` → `+010000-01-01T06:30:00.000+07:00` (ISO expanded year form; 007 must expect
  it). Such a cell is export output only: an expanded-year string is not a valid answer
  (`invalid_date`), the same as a date-only expanded year.
- Daylight saving: an `America/New_York` cell has offset `-05:00` for a January instant and
  `-04:00` for a July instant.
- A date-time cell in a zone whose offset at that instant has seconds (local mean time, before
  about 1900) gets a whole-minute offset and still names the same instant (R16).
- Export options with time zone `Mars/Base`, `+07:00` or `""` → `invalid_time_zone`; a time zone
  that is not a string (`7`, `null`) → `invalid`; an unknown option key such as `locale` →
  `unknown_property` {key: "locale"}.
- "Other" chosen with the `other` text missing, `null`, empty or whitespace-only →
  `other_text_required`; `other` text present (even `""` or `null`) while `other` is not selected
  → `invalid`.
- Checkbox with `maxSelections: 2`, two options plus "Other" chosen → `too_many` {max: 2};
  `minSelections: 2` with one option plus "Other" → valid; `maxSelections: 0` in config →
  `too_small` {min: 1}.
- `choice` with two selected IDs → `too_many` {max: 1}.
- Checkbox with `maxSelections: 1` and the same option ID twice → `duplicate` and `too_many`
  {max: 1} (limits count every entry of `optionIds`).
- `allowOther: false` and `other` selected → only `unknown_option` {optionId: "other"}, with or
  without `other` text (no `other_text_required`).
- `file` with `maxFiles: 1` and two IDs → `too_many` {max: 1}; the same ID twice → `duplicate`.
- `file` config `allowedTypes: []` → `too_few` {min: 1}; `*/*` → `invalid`; `image/*` is valid.
- `number` with `integer: true`: `2` is valid, `2.5` → `not_integer`; `min` = `max` is allowed.
- `number` cells never use exponent notation: `1e21` → `1000000000000000000000`, `1e-7` →
  `0.0000001`, `-0.25` → `-0.25`.
- Unknown keys inside a built-in config (rating `{ "max": 5, "color": "red" }`) or an option entry
  (`{ "id": "…", "label": "…", "value": 1 }`) → `unknown_property` at that path.
- `text` with an inner LF, CR, U+2028 or U+2029 → `invalid`; NEL (U+0085), VT and FF are not line
  breaks.
- `rating` config `max` 1 → `too_small` {min: 2}, 11 → `too_big` {max: 10}, 4.5 →
  `not_integer`; answer `0` → `too_small` {min: 1}, `max + 1` → `too_big` {max: `max`}, `3.5` →
  `not_integer`.
- `text` config `maxLength: 0` → `too_small`; `minLength` > `maxLength` → `invalid_range`.
- `textarea` with `maxLength: 1`: `ที่` and `👨‍👩‍👧‍👦` are valid. An inner line break counts 1
  whether sent as `\n` or `\r\n` (one grapheme cluster): `a\nb` and `a\r\nb` both count 3.
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
      equal the expected types; a `toCell` or stored-values rule written for the wrong answer type,
      or an answer-compatibility rule written for the wrong config type, fails to compile. (R1)
- [ ] **AC4** Unit: a registry created without built-ins refuses a form using `text` with
      `unknown_field_type`; a registry may hold a third-party definition with type `text` instead
      of the built-in; the package exports no pre-filled registry. (R3)
- [ ] **AC5** Unit: registry creation refuses a duplicate `type` (`duplicate_field_type`) and
      malformed types such as `Text`, `my type`, `a/b/c` (`invalid_field_type`), and accepts
      `acme/signature`. (R3)
- [ ] **AC6** Unit: each incompatible `summarize` / `storeAs` pair in R2 is refused with
      `incompatible_analytics`; every built-in's `storeAs`, `summarize` and `groupable` equal the
      schema-section table (for `date`, with `includeTime` false and true); `groupable` is true for
      exactly `choice`, `dropdown`, `checkbox` and `rating`. (R2, R10–R17)
- [ ] **AC7** Unit: for a valid answer to each built-in, the stored values equal the expected list
      (checkbox `{ "optionIds": ["Qm2xT8aLp0vW", "other"], "other": "TikTok" }` →
      `["Qm2xT8aLp0vW", "other"]`, without the text; `choice` with "Other" chosen → `["other"]`;
      file with two IDs → two `text` values; date-time → one `datetime`); a `storeAs: none`
      fixture gives an empty list. (R2, R14, R17)
- [ ] **AC8** Unit: every error produced by the failure cases of AC4–AC27 and AC29 (definitions,
      registry, schema, answers, cells, version history) has a code, params and a location and no
      message text, and every code produced by the package is in R4's list; a fixture rule that
      raises a code outside the list comes out as `invalid`. (R4)
- [ ] **AC9** Unit: a valid schema parses with defaults written in (`required` false, rating `max` 5
      and `icon` `star`, number `integer` false, `allowOther` false, `includeTime` false,
      `maxFiles` 1); parsing the result again gives an equal value; `meta.language` `TH` comes back
      as `th` and `th-th` as `th-TH`. (R5, R6)
- [ ] **AC10** Unit: each invalid schema fails with its code and path — repeated `fieldId`; repeated
      option ID in one field (the same ID in two fields passes); option ID `other` and `fieldId`
      `__proto__` (`reserved_id`); `fieldId` with a space or 65 characters; unknown type; config
      errors (rating `max` 11 → `too_big` {max: 10}, text `minLength` > `maxLength`); unknown property at form, meta and
      field level and inside a built-in config (rating `{ "max": 5, "color": "red" }`), each
      `unknown_property` at its path; blank title or label (`required`); language `en_US`,
      `x-private` or empty (`invalid`). (R5, R6)
- [ ] **AC11** Unit: the read entry point accepts `schemaVersion: 1` and refuses a missing
      version, `0`, `2` and `"1"` with `unsupported_schema_version` and no other error; input that
      is not an object (`null`, `[]`, `"x"`) is refused with `invalid` at the root and no other
      error. (R7)
- [ ] **AC12** Unit: with the fixture field, a valid answer set returns the normalised set; a set
      with three bad fields returns three `fieldId` groups; inputs `null`, `[]`, `"x"`, `1` and
      deeply nested garbage return a whole-set `invalid` without throwing; a fixture field whose
      own answer rule throws makes the call throw that same exception instead of reporting
      `invalid`; a parsed schema validated with a registry that lacks one of its types gives
      `unknown_field_type` {type} at path `[]` in that field's group, both when the field is
      answered and when it is not, a failed result and no exception. Per built-in family (text,
      number, rating, option, date, file), every value of one shared corpus of hostile JSON values
      (wrong types, empty and blank strings, `-0`, `1e308`, mixed arrays, wrong option-answer
      shapes, own `__proto__` / `constructor` keys, a 10,000-deep nested array) is validated as
      the family's answer without throwing and with every issue in R4's list; across all nine
      built-ins the corpus is also used as `config` through the read entry point, again without
      throwing. (R8, R9)
- [ ] **AC13** Unit: absent, `null`, blank text, empty selection and empty file list give
      `required` when required and are omitted when optional; keys not in the schema (including
      `__proto__` and `constructor`) give `unknown_field` and leave the other fields' results
      unchanged. (R9)
- [ ] **AC14** Unit: the fixture field declares its own "unanswered" rule through the same public
      means the built-ins use, and whole-response validation honours it. (R3, R9)
- [ ] **AC15** Unit: `"  hi  "` becomes `"hi"`. Length counts user-perceived characters after
      trimming: with `maxLength: 1`, `ที่`, `"  ที่  "`, `👍🏽` and `👨‍👩‍👧‍👦` are each accepted,
      and with `minLength: 2` each fails with `too_short` {min: 2}; `สวัสดี` passes
      `maxLength: 4` and fails `maxLength: 3` with `too_long` {max: 3}; `textarea` counts `a\r\nb`
      as 3. These cases give identical results when run in Node and in Chromium, a real browser
      engine; a simulated browser environment inside Node does not satisfy this, as it uses Node's
      own engine and Unicode data. `text` with an inner LF, CR, U+2028 or U+2029 is `invalid`
      while `textarea` keeps it; `toCell` returns the trimmed text. (R10, R20)
- [ ] **AC16** Unit: `number` accepts `2.5` by default and gives `not_integer` with `integer`;
      bounds are inclusive; `"5"` is `invalid`; `toCell(1234.5)` is `"1234.5"`,
      `toCell(-0.25)` is `"-0.25"`, `toCell(1e21)` is `"1000000000000000000000"` and
      `toCell(1e-7)` is `"0.0000001"` (never exponent notation). (R11)
- [ ] **AC17** Unit: `rating` config defaults and errors and answer errors match the Limits cases;
      `toCell(4)` is `"4"`. (R12)
- [ ] **AC18** Unit: option config is refused with its code for: missing `options`, a blank option
      label, or `allowOther` without `otherLabel` (`required`); an empty `options` list (`too_few`
      {min: 1}); repeated option IDs (`duplicate_option_id`); option ID `other` (`reserved_id`);
      an option entry with an extra key such as `value` (`unknown_property`); checkbox
      `maxSelections: 0` (`too_small` {min: 1}); checkbox `minSelections` > `maxSelections` or
      `minSelections` above the selectable count (`invalid_range`). (R6, R13)
- [ ] **AC19** Unit: option answers match the Limits cases — `choice` and `dropdown` with two IDs,
      `other` while "Other" is off, "Other" selected with the `other` text missing, `null`, `""`
      or `"  "` (`other_text_required`), `other` text present (including `""` and `null`) without the
      selection (`invalid`), checkbox "Other" counted toward min/max, optional checkbox with
      `minSelections: 2`, unknown and repeated IDs. A bare ID string, `optionIds` that is not a
      list of strings and an extra property are `invalid`; `{ "optionIds": [] }` is unanswered;
      `"  TikTok "` is normalised to `"TikTok"`. (R9, R14)
- [ ] **AC20** Unit: `toCell` gives the option label for `choice`; `อื่นๆ: TikTok` for
      `{ "optionIds": ["other"], "other": "TikTok" }` with `otherLabel` `อื่นๆ`; for `checkbox`
      with the example form's config, `optionIds` `["c9Rk_4NnYb1E", "Qm2xT8aLp0vW"]` gives
      `Facebook; เพื่อนแนะนำ` (config order, not answer order) and `["other", "c9Rk_4NnYb1E"]`
      with `other` `TikTok` gives `เพื่อนแนะนำ; อื่นๆ: TikTok` ("Other" last); an unknown option
      ID as the ID itself, and `["Rm0vedOpt123", "c9Rk_4NnYb1E", "other"]` with `other` `TikTok`
      gives `เพื่อนแนะนำ; Rm0vedOpt123; อื่นๆ: TikTok` (known options, then unknown IDs in answer
      order, then "Other"); with a config that has no `otherLabel`, "Other" is written as
      `other: TikTok`. (R14)
- [ ] **AC21** Unit: date-only `2026-11-04` is accepted unchanged, `2026-02-29` is `invalid_date`,
      a date-time while `includeTime` is false is `invalid_date`; `toCell` returns `2026-11-04`
      with no zone, `Pacific/Kiritimati` and `Pacific/Pago_Pago`. (R15, R16)
- [ ] **AC22** Unit: with `includeTime`, `2026-11-04T17:30+07:00` → `2026-11-04T10:30:00.000Z`,
      `2026-11-04T01:00:00+07:00` → `2026-11-03T18:00:00.000Z`, `2026-11-04T17:30:00` →
      `offset_required`, `2026-11-04` → `invalid_date`; `2026-11-04T10:30:00.123456789Z` →
      `2026-11-04T10:30:00.123Z` (truncated); `0001-01-01T00:30+01:00` and
      `9999-12-31T23:30-01:00` → `invalid_date` (UTC instant outside years 0001–9999); `storeAs`
      is `datetime`, and `date` without `includeTime`. (R15)
- [ ] **AC23** Unit: date-time `toCell` gives `…Z` with no zone, `2026-11-04T17:30:00.000+07:00`
      for `Asia/Bangkok`, `-05:00` / `-04:00` for `America/New_York` in January / July; an
      instant whose offset in the given zone has seconds (historical local mean time) gives a
      whole-minute offset and a cell that names the same instant; validating export options with
      `Mars/Base` or `+07:00` gives `invalid_time_zone`; results are identical with the test
      process time zone set to two different zones. (R1, R16)
- [ ] **AC24** Unit: `file` config defaults to `maxFiles` 1, accepts `image/*` and refuses
      `maxFiles: 0` (`too_small` {min: 1}), `maxSize: 0` (`too_small` {min: 1}),
      `allowedTypes: []` (`too_few` {min: 1}), a malformed MIME entry and `*/*`
      (`invalid`); answers with too many IDs, a repeated ID or an empty ID fail with `too_many`,
      `duplicate`, `invalid`; `toCell` joins IDs with `; `. (R17)
- [ ] **AC25** Unit: 100,000 generated IDs all pass R5's ID rules, have the same length (at least 11
      URL-safe characters), contain no duplicate, and the same test passes when run in Chromium, a
      real browser engine (a simulated browser environment inside Node does not satisfy this).
      (R18, R20)
- [ ] **AC26** Unit: a version history where one `fieldId` is `text` in v1 and `number` in v2 is
      refused with `field_type_changed` {fieldId, previousType: `text`, type: `number`, version:
      v1} and no `field_kind_changed`, although the stored kind changes too; label, help, required
      and order changes, config changes that keep the stored kind and are not declared
      incompatible, a removed field, and a removed field re-added with the same type, stored kind
      and a compatible config are accepted; no earlier version is accepted. History input: with a
      `fieldId` that is `text` in v1 and v2 and `number` in the candidate, earlier versions passed
      as [v1, v2] and as [v2, v1] both give `field_type_changed` with `version` 2 (the highest
      number, not the last in the list); a `version` of `0`, `-1` or `1.5` gives `invalid` and a
      repeated `version` gives `duplicate` {value}, each at `["earlier", k, "version"]`, and with
      such an error the result holds only the version errors, even when the history also has a
      field conflict; a field whose `type` is shared by an earlier version but missing from the
      registry gives `unknown_field_type` {type} at the candidate's `["fields", i, "type"]`, the
      field is skipped and nothing is thrown. (R19)
- [ ] **AC27** Unit: a `date` field with `includeTime` false in v1 and true in v2 under the same
      `fieldId` is refused with `field_kind_changed` {fieldId, type: `date`, previousStoreAs:
      `date`, storeAs: `datetime`, version: v1}; true → false is refused too; the same field with
      only its label changed passes. A fixture field whose `storeAs` depends on its config is
      refused with `field_kind_changed` too when that config flips its kind. (R2, R19)
- [ ] **AC28** Check: the shared unit tests — every unit test of the package except the few that by
      nature inspect one environment (in Node: the manifest, the build output, the process time
      zone; in Chromium: that it is a real browser) — pass both in Node and in Chromium, a real
      browser engine, with the same results and no test skipped depending on the environment (a
      simulated browser environment inside Node does not satisfy this); `pnpm lint` and
      `pnpm typecheck` pass with the strict settings. (R8, R20)
- [ ] **AC29** Unit: a `rating` field with `max` 5 in v1 and 10 in v2 under the same `fieldId` is
      refused with `field_config_incompatible` {fieldId, type: `rating`, properties: [`max`],
      version: v1}; 10 → 5 is refused too, and so is v1 `max` 5, v2 without the field, candidate
      `max` 10 (against v1). A change of only `icon` passes, and so do these changes to other
      built-ins: `number` `integer` switched; a `choice`, `dropdown` and `checkbox` option removed
      and "Other" switched on; `text` and `textarea` `maxLength` changed; `file` `maxFiles`
      raised. A fixture third-party field declares its own compatibility rule through the same
      public definition call, and a history that breaks it is refused with
      `field_config_incompatible` naming the properties its rule returns; a third-party definition
      registered as `rating` without a rule accepts the same `max` change, showing that the check
      has no built-in special case. (R1, R12, R19)

## Flags

Flags 1–7 are **accepted known gaps** (owner decision 2026-11-05): the ADRs they name (0003, 0007,
0009, 0011) are amended during `/impl-plan`, the owner updates the brief (§5, §6, §10) later, and
none of them blocks `/impl-plan`. Each flag keeps its remaining action.

1. **Brief §5 lists 8 built-in fields; this spec has 9.** `file` is the owner's decision (ADR 0011,
   intent decision 6), but ADR 0011 is still _Proposed_ until the owner amends brief §5 and §10
   MVP item 1. This item builds on that Proposed ADR. **Status: accepted known gap** (owner,
   2026-11-05): `/impl-plan` proceeds before the amendment. Remaining: the owner amends brief §5
   and §10 MVP item 1; ADR 0011 is updated in `/impl-plan` (Flag 4) and accepted after the brief
   amendment.
2. **Brief §5 puts React components inside `defineField`.** This spec follows ADR 0007 (headless
   core; `Render`, `Settings`, `Chart` live in the renderer's UI binding, item 002). The §5 example
   also shows `toCell: (v) => …`; here `toCell` also receives the parsed config (needed for option
   labels) and optional export options (time zone). Brief gap 2 in ADR 0006 already lists the
   example update. **Status: accepted known gap** (owner, 2026-11-05). Remaining: the owner
   updates the brief §5 example later.
3. **Brief §6 `Answer.valueDate DateTime?` is one column; this spec needs two kinds.** `storeAs`
   gains `datetime` (owner decision 5), extending ADR 0007's `"text" | "number" | "date" | "none"`.
   Proposed brief §6 change (owner to make): `valueDate` as a Postgres `date` plus a new
   `valueDateTime` as `timestamptz`; items 003/005 build them. **Status: accepted known gap**
   (owner, 2026-11-05). Remaining: ADR 0007 amended in `/impl-plan`; the owner updates brief §6
   later.
4. **ADR 0011 no longer matches the `file` field.** ADR 0011 says the answer holds storage key,
   name, size and type, `storeAs: "none"`, and `toCell` writes names plus a download path. Per
   owner decision 6 the answer is a list of file IDs, stored as one `text` value per file (so
   `storeAs: "text"`, not `"none"`), and `toCell` writes IDs that item 007 resolves to names and
   paths. File metadata lives with the upload record (006). **Status: accepted known gap** (owner,
   2026-11-05). Remaining: ADR 0011 updated in `/impl-plan`; it stays Proposed until the brief
   amendment of Flag 1.
5. **`rating` groupable: owner decision 2026-11-05 departs from brief §5 example.** Brief §5's
   `ratingField` example (and intent open question 5) has `groupable: false`. The owner chose
   `groupable: true` (as intent open question 6 proposed), so a rating can be the "split by"
   dimension of a cross-tab (brief §9 layer 2, Phase 2). R12, the schema table and AC6 follow the
   owner. `groupable` is data only: no cross-tab is built in this item, and stored data is
   unaffected. **Status: accepted known gap** (owner, 2026-11-05). Remaining: the owner amends the
   brief §5 example later (together with Flag 2).
6. **ADR 0003 and `000-foundation` require `LocalizedText`.** ADR 0003 Consequences and the 000
   spec (Flag 1) say `001` must model schema text as `LocalizedText`. Owner decision 1 replaced
   that with one plain-text language per form; multi-language form content (proposed in 000 for
   Phase 2) now means a `schemaVersion` migration. **Status: accepted known gap** (owner,
   2026-11-05). Remaining: ADR 0003 amended in `/impl-plan`.
7. **New parts of the public field API beyond ADR 0007's member list, and a wider ADR 0009
   rule.** To let item 005 write `Answer` rows for any field (including plugins and "Other"), each
   definition must state how an answer becomes stored values (R2) and what counts as unanswered
   (R9); `storeAs` may depend on config (R2); `summarize` is a closed set that adds `none` (not in
   intent open question 6) so a `storeAs: "none"` plugin has a valid pairing; and a definition may
   declare an answer-compatibility rule (R1, R19). ADR 0009's "changing a field's `type` creates a
   new `fieldId`" now also covers a change of stored kind and a config change that the definition
   declares incompatible (owner, 2026-11-05), each with its own code: `field_type_changed`,
   `field_kind_changed`, `field_config_incompatible` (R4). **Status: accepted known gap** (owner,
   2026-11-05). Remaining: `/impl-plan` records these, together with single-language text and
   `schemaVersion`, in one ADR or an amendment to ADR 0007/0009 (as the intent asks); the owner's
   later brief §5 update should show them.
8. **Downstream risks, not conflicts:**
   - Brief §6 indexes `Answer(fieldId, valueText)`. Long `textarea` answers can exceed Postgres's
     B-tree index row size; item 003 must decide (e.g. no index on long text, or a prefix/hash).
   - File IDs, "Other" text and all answers are untrusted respondent input; 005/006 must check file
     ownership and limits, and 007 must neutralise CSV formula injection (Edge cases, Permission).
   - 005 must map a region-tagged `meta.language` (e.g. `th-TH`) to the UI locale `th`.
   - Grapheme rules change between Unicode versions (e.g. Unicode 15.1 changed some Indic
     conjuncts), and Node and browsers can ship different Unicode data. The Thai and emoji cases
     in AC15 are stable. Node/browser parity (R8, R10, R18, R20) must be proven in a real browser
     engine, Chromium, not only in a simulated browser environment inside Node, which shares
     Node's engine and Unicode data (owner, 2026-11-05; AC15, AC25, AC28). `/impl-plan` must name
     the tooling that runs the package's tests in Chromium and show how R10's parity holds while
     Zod stays the only runtime dependency (R20), or bring the trade-off back to the owner.
   - R10 and R20 say "modern" / "current" browsers, but only Chromium is tested. Firefox and
     Safari use other engines and their own Unicode data, so parity there is not proven by this
     item — a residual risk unless the owner adds those engines later.
   - `meta.language` canonicalisation (R5) replaces deprecated aliases (e.g. `iw` → `he`) from the
     engine's CLDR data, and Node and browsers can ship different CLDR versions, so a rarely used
     deprecated tag could be canonicalised differently in the browser and on the server. The
     server's result is the one stored (003 and 005 re-validate); the ACs use only stable tags
     (`th`, `TH`, `th-th`, `th-TH`, `en`, `en_US`, `x-private`).
9. **Size is at the ADR 0006 limit: 20 of 20 requirements**, with R4, R14 and R19 dense. All three
   rounds of 2026-11-05 answers were written into existing requirements (the second round extended
   R1, R4, R12 and R19 and added AC29; the third, after `/analyze`, extended R1, R4–R8, R10, R11
   and R13–R17 and existing ACs; the sync after the second `/analyze` extended R4, R8, R19 and R20
   and AC10, AC12 and AC26; the 2026-11-06 sync with the implementation extended R2, R4, R6, R8,
   R14–R16 and R19 and the Edge cases only); no requirement was added, no AC besides AC29, and
   nothing was trimmed. If `/tasks`
   goes over 40 tasks, apply the intent's fallback split (open question 7) along story lines,
   exactly as plan.md Risk 6 does: US5 (option fields with "Other") and US6 (date, file) — plan
   steps 7–8 — move to `001b` with AC18–AC24 and every AC row that needs an option, date or file
   built-in: the AC6, AC7, AC9, AC12 (hostile-corpus) and AC13 rows of those families, AC10's
   option-ID rows, AC27's `date` case and AC29's option-field and `file` rows. US1–US4 and US7
   stay in `001-field-core`, with AC27's fixture case and AC29's other rows, and US7 (plan step 9)
   is built right after US4 (plan step 6).
10. **No BI creep.** `summarize` and `groupable` are data only; no charts, pivot tables, formulas or
    dashboards. No custom condition language. Intent open question 1 (CSV time zone) stays with
    item 007; this item only accepts an optional time zone in the export options that `toCell`
    receives (R16).

## Clarifications

### Session 2026-11-05

- Q: What is the stored answer shape for `choice`, `dropdown` and `checkbox` now that "Other"
  exists (R14 marker)? → A: One shape for all three, `{ optionIds: string[], other?: string }`.
  The reserved option ID `other` marks the "Other" selection and `other` holds its text: required
  and non-empty after trimming when `other` is selected, absent otherwise. `choice` and `dropdown`
  allow at most one ID. (Schema section, R14, Edge cases, AC7, AC19, AC20)
- Q: Must the cross-version check also refuse a `fieldId` whose stored kind (`storeAs`) changes,
  e.g. a `date` field's `includeTime` switched after publish (R19 marker)? → A: Yes. A `storeAs`
  change under the same `fieldId` is refused exactly like a type change; the Builder must issue a
  new `fieldId`. (Impact on later items, US7, R4, R19, Edge cases, AC26, AC27, Flag 7)
- Q: Is `rating` groupable? Brief §5 example and intent open question 5 say `false`, intent open
  question 6 says `true`. → A: Yes, `groupable: true`. This departs from the brief §5 example and
  needs a brief amendment. (Schema table, R12, AC6, Flag 5)
- Q: How are `text` / `textarea` `minLength` and `maxLength` counted? → A: In user-perceived
  characters (extended grapheme clusters, Unicode UAX #29) after trimming: `ที่`, `👍🏽` and a
  family emoji ZWJ sequence each count 1. Node and modern browsers must give the same count; how
  is left to `plan.md`. (R10, Edge cases, AC15, Flag 8)
- Q: Which error code does a stored-kind change under the same `fieldId` give? → A: A new code,
  `field_kind_changed` {fieldId, type, previousStoreAs, storeAs, version}, distinct from
  `field_type_changed` {fieldId, previousType, type, version}, which is now only for a different
  `type`. (R4, R19, Edge cases, AC26, AC27, Flag 7)
- Q: May a `rating` field's `max` change across versions under the same `fieldId`? → A: No; a
  scale change is a new question, so averages and split-by never mix scales. Not a rating special
  case (constitution 2): any field definition may declare, through the public definition call, an
  answer-compatibility rule over the earlier and the new config, and the version check consults it.
  Built-ins: only `rating` declares one (`max`); `date`'s `includeTime` is already a stored-kind
  change; no other built-in needs one. A fixture third-party field proves the same call. Code
  (analyst's choice): a dedicated `field_config_incompatible` {fieldId, type, properties, version}
  rather than `field_kind_changed` with a reason param, so every code keeps one fixed param set and
  maps to one message. (Schema section, Impact on later items, US1, US4, US7, R1, R4, R12, R19,
  Edge cases, AC3, AC8, AC29, Flags 7, 9)
- Q: Where must Node/browser parity (grapheme counting, ID generation, the package working in a
  browser) be proven? → A: In a real browser engine, Chromium, not only in a simulated browser
  environment inside Node; the tooling belongs to `plan.md`. (US7, Edge cases, AC15, AC25, AC28,
  Flag 8)
- Q: Must the disagreements with brief §5/§6 and ADRs 0003/0007/0009/0011 be settled before
  `/impl-plan`? → A: No; they are accepted as known gaps. The ADRs are amended during
  `/impl-plan`; the owner updates the brief later. (Flags 1–7)
- Q: How does `number`'s `toCell` write very large or very small numbers (`/analyze` F04)? → A:
  Always in plain decimal notation, never exponent notation: ASCII digits, an optional leading
  `-`, `.` as decimal point, no grouping; `1e+21` → `1000000000000000000000`, `1e-7` →
  `0.0000001`. (R11, Edge cases, AC16)
- Q: Do built-in configs and option entries refuse unknown keys, and must plugins do the same
  (`/analyze` F06)? → A: Built-in configs and option entries are strict: unknown keys fail with
  `unknown_property` at their path. Plugin authors are recommended, not required, to use strict
  configs. A config shape is frozen once released. (Schema section, R6, R13, Edge cases, AC10,
  AC18)
- Q: Does "never throws for any JSON input" also cover third-party fields (`/analyze` F08)? → A:
  No. It covers the package and the built-in fields; an exception thrown by a plugin's own code
  propagates to the caller, so a broken plugin is loud rather than disguised as an invalid answer.
  (R8, Edge cases, AC12)
- Q: May checkbox `maxSelections` be 0 (`/analyze` F27)? → A: No. `maxSelections` must be ≥ 1,
  and ≥ `minSelections` when both are set; `maxSelections: 0` is refused in config (`too_small`
  {min: 1}, the code `maxLength: 0` already gives). (R13, Edge cases, AC18)
- Spec synced with the approved plan.md and ADR 0012 after `/analyze` (no owner decision): F03,
  F05, F07, F11, F12, F13, F14, F15, F17, F18, F19, F20, F25, F26. (Terms, R1, R4, R5, R7, R10,
  R13–R17, Edge cases, AC8–AC11, AC15, AC18–AC20, AC22–AC24, AC28, Flags 8, 9)
- Spec synced after second /analyze: N05, N07, N08, N14 (N07 = rating config codes named in
  Limits); F29 accepted as-is (Flag 8 already records Chromium-only proof). (Intro, R4, R8, R19,
  R20, Edge cases (Failure, Limits), AC10, AC12, AC26, Flag 9)
- Spec synced after third /analyze: P06, P07, P08.

### Session 2026-11-06

- Spec synced with the implementation after /converge (no owner decision): a config-dependent
  stored kind outside the definition's declared kinds throws a developer-facing `TypeError`, not a
  catalogue issue (R2, R4, R8); the version check throws a `TypeError` when an
  answer-compatibility result is not a list of the field's config property names (own key of
  either compared config, or declared by the config shape; inherited names never count), and
  these plugin faults are outside R4's catalogue (R4, R8, R19); export options: an unknown key →
  `unknown_property`, a non-string zone → `invalid` (R16); date answers are not trimmed, a
  non-string is `invalid`, a local year 0000 is accepted when its UTC instant is in year 0001, and
  a date-time cell with a wall-clock year above 9999 uses the ISO expanded year form (R15, R16,
  note for 007); `config: null` → `invalid`, only an absent config gets the defaults (R6); with
  "Other" off a selected `other` gives only `unknown_option`, and selection limits count every
  `optionIds` entry, so a repeat can give `duplicate` and `too_many` (R14); the version check
  consults the registry only when a check needs a definition — no issue for a new candidate field
  of an unregistered type, one `unknown_field_type` and no older comparison when the most recent
  same-type earlier version needs a missing definition (R19). (Intro, R2, R4, R6, R8, R14–R16,
  R19, Edge cases (Empty, Failure, Limits))
