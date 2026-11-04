# ADR 0006 — Delivery roadmap and work-item slicing

Status: Accepted · Date: 2026-11-04 · Work item: — (planning, precedes `001`)

## Context

`000-foundation` is done: toolchain, two auth worlds, `defineAction`, i18n, Docker Compose and
CI exist, but `@songnoi/schema` and `@songnoi/renderer` are still empty. Brief §10 lists what
belongs to MVP, Phase 2 and Phase 3, but not the order of work or how big each work item is.
Without that, every `/intent` re-argues scope, and a hobby project risks never reaching
"usable" (brief §2).

Owner interview (2026-11-04) decided:

| Topic                     | Decision                                                        | ADR  |
| ------------------------- | --------------------------------------------------------------- | ---- |
| Slicing strategy          | **Layer by layer**, inside-out from the schema                  | this |
| Definition of "MVP done"  | The owner replaces Google Forms with SongNoi for a real survey  | this |
| `defineField` vs React    | Headless core in `schema`, UI binding in `renderer`             | 0007 |
| Webhook delivery          | Job queue on Postgres (pg-boss)                                 | 0008 |
| Editing a published form  | New `FormVersion`; export/analytics merge versions by `fieldId` | 0009 |
| Admin / respondent in MVP | One instance, one owner; respondents log in by email + password | 0010 |
| File storage              | A 9th built-in field `file` in MVP, stored in RustFS            | 0011 |

## Decision

### Slicing rules

1. **Inside-out layers.** Each layer depends only on layers already done: schema → renderer →
   authoring → collecting → hand-off → ship. This follows "schema is the hero": every later
   layer reads or writes a schema that is already stable and tested.
2. **One work item = one `docs/work/NNN-slug/`**, sized to stay under the escalation threshold
   in `docs/work/README.md` (≤ 20 requirements, ≤ 40 tasks). If `/spec` exceeds it, split the
   item before `/impl-plan`.
3. **Every item has an exit check that runs**, not just "tests pass": a named test, script or
   page that proves the layer works with the layers below it. This is the mitigation for the
   main risk of layer-by-layer work (integration problems found late, see Consequences).
4. **Milestones group items.** A milestone ends with a tagged pre-release so progress is
   visible and the owner can stop at any milestone with something coherent.
5. Folder numbers below are the intended order; a number is fixed only when `/intent` creates
   the folder. Phase 2/3 items are coarse on purpose and get sliced when their phase starts.

### MVP (brief §10 MVP)

**M1 — Core: the schema and how it looks** · pre-release `v0.1.0-alpha.1`

| #   | Work item    | Scope                                                                                                                                                                                                                                                                                                      | Exit check                                                                                                                                              |
| --- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 | `field-core` | `@songnoi/schema`: Form Schema (form meta, ordered fields, stable `fieldId`, label/help/required), headless `defineField` (ADR 0007), field registry, the 9 built-in field cores (text, textarea, number, choice, checkbox, dropdown, date, rating, file), whole-response validation, `toCell`, `storeAs`. | Unit + type tests; a built-in and a fixture "third-party" field register through the same public API; package builds with no React in its dependencies. |
| 002 | `renderer`   | `@songnoi/renderer`: `defineFieldUI` binding, `Render` + `Settings` for the 9 fields, `<FormRenderer>` with client validation from the same Zod schemas, Thai typography, WCAG 2.1 AA.                                                                                                                     | A dev-only page in `apps/web` renders a fixture schema with every field in `en` and `th`; component tests per field; axe check passes.                  |

**M2 — Authoring: the owner builds and publishes** · `v0.1.0-alpha.2`

| #   | Work item         | Scope                                                                                                                                                                                                                        | Exit check                                                                                                   |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 003 | `owner-and-forms` | ADR 0010 owner onboarding (first sign-up becomes owner, then admin sign-up closes), implicit workspace, `Form` model with `draftSchema`, form list / create / rename / delete, publish → immutable `FormVersion` (ADR 0009). | Integration tests: owner bootstrap race, second admin sign-up rejected, published version cannot be updated. |
| 004 | `builder`         | Drag-and-drop Builder (dnd-kit): add, reorder, remove fields; `Settings` panels from the UI binding; live preview with the real `<FormRenderer>`; autosave of `draftSchema`; type change creates a new `fieldId` (ADR 0009). | E2E: owner builds a form with all 9 fields, reloads, sees the same draft, publishes.                         |

**M3 — Collecting: people answer** · `v0.1.0-alpha.3`

| #   | Work item      | Scope                                                                                                                                                                                                                                              | Exit check                                                                                                                             |
| --- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 005 | `respond`      | Share link `/(respond)/f/[slug]` for the latest version; access modes Public and Login (respondent email + password, ADR 0010); server re-validates with the version's schema; `Response` + `Answer` (+ webhook job, ADR 0008) in one transaction. | Integration: submit writes both tables atomically, a failure writes neither; E2E: public and login-required forms both accept answers. |
| 006 | `file-uploads` | RustFS in Docker Compose, upload/download through `api/files/**` (ADR 0005, 0011), per-field size/type limits, pending-upload lifecycle and cleanup job.                                                                                           | Integration against RustFS: upload → submit links file; abandoned upload is purged; respondent cannot read another response's file.    |

**M4 — Hand-off: data leaves through doors the owner opens** · `v0.1.0-beta.1`

| #   | Work item           | Scope                                                                                                                                                                                                            | Exit check                                                                                                                             |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 007 | `export-webhook`    | CSV export via `api/forms/[formId]/export`, columns merged across versions by `fieldId` (ADR 0009), `toCell` per field; webhook endpoints per form, HMAC signature, retry with backoff, delivery log (ADR 0008). | Integration: CSV of a form with 2 versions matches a golden file; webhook receiver test sees a signed payload and retries after a 500. |
| 008 | `analytics-summary` | Analytics layer 1: per-field auto summary driven by `analytics.summarize` and the UI binding's `Chart` (shadcn Chart), reading the `Answer` table.                                                               | Integration: summaries for seeded answers match expected numbers; page renders every field's chart.                                    |

**M5 — Ship** · `v0.1.0`

| #   | Work item     | Scope                                                                                                                                                                                                                              | Exit check                                                                                                                        |
| --- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 009 | `mvp-release` | Golden-path E2E (build → publish → answer with a file → CSV + webhook + summary), `docker compose up` from a clean clone, backup/restore notes, README quickstart, first npm release of `@songnoi/schema` and `@songnoi/renderer`. | Golden-path E2E green in CI against the Compose stack; **dogfood**: the owner runs one real survey that used to be a Google Form. |

### Phase 2 (brief §10 Phase 2) — sliced when MVP ships

- **Analytics layer 2** — filter + cross-tab (uses `analytics.groupable`).
- **Postgres views per form** — one column per question, for Metabase / Looker Studio.
- **Conditional logic** — JSON Logic in the Form Schema, evaluated by renderer and server.
- **Theme per form** — design tokens stored in the schema, applied by the renderer.
- **Remaining access modes** — token link, password, email-domain restriction. Domain
  restriction needs proof of email ownership, so it brings optional SMTP (ADR 0010).
- **REST API with API keys + embed** — see "Brief gaps" below.

### Phase 3 (brief §10 Phase 3) — sliced when Phase 2 ships

- **Workspace roles** — Owner / Editor / Viewer, invitations, possibly several workspaces.
- **Analytics layer 3** — saved views with locked filters, shared by link.
- **shadcn registry** for community fields (`registry/`), built on the ADR 0007 API.
- **AI form generation** — must be opt-in, bring-your-own provider or a local model, and off by
  default, because brief §2 says data never leaves the user's machine.

### Brief gaps found while planning (owner to decide; Claude never edits the brief)

1. Brief §5 lists 8 built-in fields; the owner added `file` as the 9th for MVP (ADR 0011).
   §5 and §10 MVP item 1 need updating.
2. Brief §5 shows one `defineField` holding React components; ADR 0007 splits it into a
   headless core and a UI binding. The §5 example needs updating.
3. Brief §8 promises a REST API with API keys and embedding, but §10 puts them in no phase.
   This plan proposes Phase 2.
4. Brief §3 has no job queue; ADR 0008 adds pg-boss (runs on the existing Postgres).

## Consequences

- **Risk of layer-by-layer:** nothing is usable end to end until M3, and contract mistakes
  between layers surface late. Mitigations: the exit checks above always run against the real
  lower layers (no mocks of `@songnoi/schema`), and `004` uses the real renderer for preview.
  If an exit check exposes a contract bug in a finished layer, fix it in a bug work item (test
  first) before continuing upward.
- The schema contract freezes early. Changes to it after `001` go through ADR 0009's rules
  (stable `fieldId`, immutable versions) and need a schema migration story.
- Each milestone is a natural stopping point: after M2 the project is a usable form designer,
  after M3 a usable form collector, after M4 a usable Google Forms replacement.
- This ADR is updated (not superseded) when an item is split, merged or reordered; record the
  change and its reason at the bottom.

## Change log

- 2026-11-04 — first version from the owner interview.
