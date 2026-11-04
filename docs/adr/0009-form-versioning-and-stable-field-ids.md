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
- **Changing a field's `type` creates a new `fieldId`.** The Builder does this automatically;
  the schema refuses two fields with the same `fieldId` but different `type` across a form's
  versions (checked at publish).
- **Merged column set** for CSV and analytics = union of `fieldId`s over all versions. Order and
  label come from the latest version that contains the field; fields removed in later versions
  are appended after current ones. Answers from versions without a field are empty cells.
- **Choice options** also carry stable IDs, so renaming an option keeps its counts together.
- Queries by `fieldId` across versions need the form: `003` decides whether `Answer` gets a
  denormalised `formId` (brief §6 data model change, to propose to the owner) or joins through
  `Response → FormVersion`.

## Consequences

- Typo fixes do not split data; a "new meaning" requires a new question (or a type change).
- The rule is enforced in `@songnoi/schema` (unit-tested), not only in the Builder UI, so API
  and future AI-generated schemas follow it too.
- Phase 2 Postgres views use the same merged column set.
