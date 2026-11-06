# ADR 0009 — Form versioning and stable field IDs

Status: Accepted · Date: 2026-11-04 · Work items: `001-field-core`, `003-owner-and-forms`,
`004-builder`, `007-export-webhook`, `008-analytics-summary`

## Context

Brief §6: a `Response` belongs to a `FormVersion`, and a published version is immutable. Owners
will still fix typos or add a question after people have answered. The owner decided that CSV
export and analytics show **one merged view across versions**, not one view per version.

## Decision

- **Editing after publish** changes `Form.draftSchema` only. Publishing creates
  `FormVersion(version = n + 1)`; the share link always serves the latest version. Earlier
  versions are never updated.
- **`fieldId` is the identity of a question across versions.** It is generated once when a
  field is added (random, URL-safe), never reused, and survives label, option and order
  changes.
- **A `fieldId` keeps one meaning** (amended 2026-11-05). Across all versions of a form, the
  same `fieldId` must keep its `type`, its stored kind (the `storeAs` its definition gives for
  that version's parsed config), and every config property that its definition's
  `incompatibleChanges` rule declares answer-relevant (ADR 0007). Changing any of them creates a
  new `fieldId`; the Builder does this automatically. `@songnoi/schema` refuses the candidate
  version at publish (`checkVersionHistory`) with one issue per conflicting `fieldId`, the first
  failing check in this order, against the most recent earlier version it conflicts with:
  - different `type` → `field_type_changed` {fieldId, previousType, type, version};
  - same `type`, different stored kind (e.g. a `date` field's `includeTime` switched,
    `date` ↔ `datetime`) → `field_kind_changed` {fieldId, type, previousStoreAs, storeAs,
    version};
  - same `type` and kind, a change the rule refuses (e.g. a `rating` `max` of 5 → 10) →
    `field_config_incompatible` {fieldId, type, properties, version}.

  The check reads `type`, `storeAs` and rules from the registry's definitions only, with no
  special case for any built-in. It accepts label, help, required and order changes, option
  changes, config changes that keep the kind and that no rule refuses, removed fields, and a
  removed field coming back with the same type, kind and a compatible config. A form that was
  never published has no history, so its draft may change freely.

- **Merged column set** for CSV and analytics = union of `fieldId`s over all versions. Order and
  label come from the latest version that contains the field; fields removed in later versions
  are appended after current ones. Answers from versions without a field are empty cells.
- **Choice options** also carry stable IDs, so renaming an option keeps its counts together.
- Queries by `fieldId` across versions need the form: `003` decides whether `Answer` gets a
  denormalised `formId` (brief §6 data model change, to propose to the owner) or joins through
  `Response → FormVersion`.

## Consequences

- Typo fixes do not split data; a new meaning, stored kind or scale requires a new question, so
  merged columns and summaries never mix kinds (calendar dates and instants) or scales
  (averages of a 1–5 and a 1–10 rating).
- The rule is enforced in `@songnoi/schema` (unit-tested), not only in the Builder UI, so API
  and future AI-generated schemas follow it too.
- A plugin release that changes the `storeAs` it gives for a config, or tightens its
  `incompatibleChanges` rule, can make an existing history conflict: the next publish of such a
  form is refused. Stored data is never changed. Plugin authors must keep both stable.
- Phase 2 Postgres views use the same merged column set.

## Change log

- 2026-11-04 — first version (owner interview, ADR 0006).
- 2026-11-05 — the same `fieldId` must also keep its stored kind and every config property its
  definition declares incompatible; three codes `field_type_changed`, `field_kind_changed`,
  `field_config_incompatible` (owner decisions, spec `001` Flag 7, R19).
