# Spec quality checklist — 001-field-core

Built-in, **author-owned** checklist for [spec.md](../spec.md): written by `/spec`, re-evaluated by
`/clarify`. `[x]` means the author's own evaluation found the item satisfied; `[ ]` items say why
not. Reviewer-owned checklists (`/checklist`) are separate files and are never ticked here.

Evaluated: 2026-11-04, first draft of spec.md.

## Content quality

- [x] No implementation details: no file paths, code structure or library choices beyond what the
      brief itself names (Zod, brief §2/§3). Stored property names appear only because they are
      the schema contract; where the API places the stored-values and "unanswered" rules is left to
      `plan.md`.
- [x] Each part says what and why; "how" is deferred to `/impl-plan`.
- [x] Sections are in the required order, with schema impact first.
- [x] Both worlds considered: every story names admin and respondent impact (indirect in this
      item), and the two-world edge cases are listed (public schema, untrusted answers and file
      IDs, plain-text labels, CSV formula injection, prototype keys).
- [x] Written in English; no user-facing strings are introduced.

## Requirement completeness

- [ ] All `[NEEDS CLARIFICATION]` markers resolved — **2 open**: R14 ("Other" answer shape) and R19
      (stored-kind change across versions, e.g. `includeTime`). Run `/clarify`.
- [x] At most three markers used (2).
- [x] Requirements are numbered, testable, and each is tagged with at least one user story.
- [x] Requirement count within the ADR 0006 limit: **20 / 20**. Nothing trimmed; the fallback
      split is mapped to stories in Flags §9.
- [x] Every user story has a priority, who / want / so that, and an "Independent test" line.
- [x] Every story is independently demonstrable: US1–US3 with the fixture field only, US4–US6 per
      field family, US7 with schemas only.
- [x] Edge cases cover empty, failure, permission, i18n (en/th) and limit cases, including every
      case named in the intent (date-time without offset, date-only never shifted, blank "Other"
      text, checkbox min/max counting "Other", `maxFiles`, duplicate `fieldId` / option ID, unknown
      type, type change across versions, unknown answer keys).
- [x] Scope is bounded: nothing from items 002–009 or Phase 2 is required; display rules, CSV time
      zone, upload/storage, `Answer` columns and Builder behaviour are deferred by name.
- [x] Owner decisions 1–6 in intent.md are carried as requirements and not re-opened.
- [x] Intent open questions handled: 2 → marker (R14); 3, 4, 5, 6 → resolved in R17, R11, R12, R2
      (rating `groupable` follows the brief, Flag 5); 1 → stays with item 007, R16 only accepts an
      optional zone; 7 → not triggered.

## Feature readiness

- [x] Roadmap phase stated (MVP) with a one-line reason.
- [x] Every acceptance criterion is provable by a named unit test, type test or build/lint check.
- [x] Every acceptance criterion cites the requirement(s) it proves.
- [x] Every requirement is proven by at least one acceptance criterion (trace below).
- [x] ADR 0006 exit check is included (AC1: built-in and fixture field through the same public
      calls; AC2: build with no React dependency).
- [ ] Acceptance criteria are final — AC7, AC19, AC20 (answer shape) and AC27 (outcome) depend on
      the open markers in R14 and R19.
- [x] Flags list every conflict found with the brief, the constitution and ADRs 0003, 0007, 0011;
      no BI creep.
- [ ] Brief and ADR follow-ups the spec depends on are done — **owner action**: brief §5 (9 fields,
      headless API) and §6 (`date` + `datetime`), ADR 0011 acceptance and file-answer update, ADR
      0003 `LocalizedText` amendment (Flags 1–4, 6). Not blocking `/clarify`; should be settled or
      explicitly accepted by the owner before `/impl-plan` is approved.

## Constitution (MUST principles relevant to this item)

- [x] 1 Schema is the hero — Zod-first, types inferred, never hand-written (R1, R5–R7).
- [x] 2 Dogfood the plugin API — built-ins only through the public calls; fixture field proves it
      (R3, R9, AC1, AC4, AC14).
- [x] 3 Self-host first — no network requests, no environment reads (R20).
- [x] 4 Two separate worlds — no auth surface here; public-safe schema and untrusted-input rules
      in Edge cases.
- [x] 5 No in-house BI — analytics is data only, closed `summarize` set (R2, Flag 10).
- [x] 7 Small scope — MVP item 1 only; scope fence from intent.md respected.
- [x] 8 Response integrity — stored versions never rewritten (R7); type change refused across
      versions (R19).
- [x] 11 Test first — every acceptance criterion maps to a test or check.
- [x] 12 Type safety — inferred types and strict settings (R1, R20, AC3, AC28).
- [x] 13 Multilingual by default — codes and params only, no user-facing strings (R4).

## Traceability (requirement → acceptance criteria)

| Req | Proven by           | Req | Proven by       |
| --- | ------------------- | --- | --------------- |
| R1  | AC1, AC3, AC23      | R11 | AC6, AC16       |
| R2  | AC6, AC7            | R12 | AC6, AC17       |
| R3  | AC1, AC4, AC5, AC14 | R13 | AC18            |
| R4  | AC8                 | R14 | AC7, AC19, AC20 |
| R5  | AC9, AC10           | R15 | AC21, AC22      |
| R6  | AC1, AC9, AC10      | R16 | AC21, AC23      |
| R7  | AC11                | R17 | AC6, AC7, AC24  |
| R8  | AC1, AC12           | R18 | AC25            |
| R9  | AC12, AC13, AC14    | R19 | AC26, AC27      |
| R10 | AC6, AC15           | R20 | AC2, AC25, AC28 |

## Story → requirements

| Story                               | Requirements           |
| ----------------------------------- | ---------------------- |
| US1 — Define and register (P1)      | R1, R2, R3, R4, R20    |
| US2 — Form Schema (P1)              | R4, R5, R6, R7, R20    |
| US3 — Whole response (P1)           | R4, R8, R9, R20        |
| US4 — Text, number, rating (P2)     | R2, R10, R11, R12, R20 |
| US5 — Option fields + Other (P2)    | R2, R13, R14, R20      |
| US6 — Date and file (P2)            | R2, R15, R16, R17, R20 |
| US7 — Identity across versions (P3) | R18, R19, R20          |
