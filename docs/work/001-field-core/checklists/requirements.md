# Spec quality checklist — 001-field-core

Built-in, **author-owned** checklist for [spec.md](../spec.md): written by `/spec`, re-evaluated by
`/clarify`. `[x]` means the author's own evaluation found the item satisfied; `[ ]` items say why
not. Reviewer-owned checklists (`/checklist`) are separate files and are never ticked here.

Evaluated: 2026-11-04, first draft of spec.md. Re-evaluated: 2026-11-05, after `/clarify` wrote
back four owner answers, and again on 2026-11-05 after a second `/clarify` round wrote back four
more (Clarifications, Session 2026-11-05, 8 entries).

## Content quality

- [x] No implementation details: no file paths, code structure or library choices beyond what the
      brief itself names (Zod, brief §2/§3). Stored property names appear only because they are
      the schema contract; where the API places the stored-values, "unanswered" and
      answer-compatibility rules is left to `plan.md` (the compatibility rule is described only by
      what it decides: earlier and new config in, accepted or the properties concerned out). Text
      length cites a standard (Unicode UAX #29), not a library. Chromium is named because the owner
      set it as the engine that proves Node/browser parity; the tooling that runs tests in it is
      left to `plan.md` (Flag 8).
- [x] Each part says what and why; "how" is deferred to `/impl-plan`.
- [x] Sections are in the required order, with schema impact first; `## Clarifications` follows
      `## Flags`.
- [x] Both worlds considered: every story names admin and respondent impact (indirect in this
      item), and the two-world edge cases are listed (public schema, untrusted answers and file
      IDs, plain-text labels, CSV formula injection, prototype keys). The version rules state the
      admin-visible effect (a changed meaning or scale gets a new question, US7).
- [x] Written in English; no user-facing strings are introduced.

## Requirement completeness

- [x] All `[NEEDS CLARIFICATION]` markers resolved — **0 open**. R14 ("Other" answer shape) and
      R19 (stored-kind change across versions) were settled by the owner on 2026-11-05.
- [x] At most three markers used (2 in the first draft, 0 open now).
- [x] Clarification answers are written into the sections they affect, not as a Q&A dump — first
      round: schema section, US7, R4, R10, R12, R14, R19, Edge cases, ACs, Flags; second round:
      schema section (answer compatibility, impact on later items), US1, US4, US7, R1, R4, R12,
      R19, Edge cases, AC3, AC8, AC15, AC25–AC29, Flags 1–9 — and logged under
      `## Clarifications` → `### Session 2026-11-05` (8 entries).
- [x] Requirements are numbered, testable, and each is tagged with at least one user story.
- [x] Requirement count within the ADR 0006 limit: **20 / 20**. Neither round added a requirement
      (the second round extended R1, R4, R12 and R19); nothing trimmed; the fallback split is
      mapped to stories in Flag 9.
- [x] Every user story has a priority, who / want / so that, and an "Independent test" line.
- [x] Every story is independently demonstrable: US1–US3 with the fixture field only, US4–US6 per
      field family, US7 with schemas, the fixture field's own compatibility rule and the `date` and
      `rating` built-ins (P2 stories, built before it).
- [x] Edge cases cover empty, failure, permission, i18n (en/th) and limit cases, including every
      case named in the intent (date-time without offset, date-only never shifted, blank "Other"
      text, checkbox min/max counting "Other", `maxFiles`, duplicate `fieldId` / option ID, unknown
      type, type change across versions, unknown answer keys) and the 2026-11-05 cases (stored-kind
      change with its own code, a type change that also changes the stored kind, rating `max`
      changed across versions incl. after removal and before first publish, compatible config
      changes, plugins changing `storeAs` or tightening their rule after release, "Other" text
      without the selection, empty `optionIds`, Thai and emoji length counting).
- [x] Scope is bounded: nothing from items 002–009 or Phase 2 is required; display rules, CSV time
      zone, upload/storage, `Answer` columns, cross-tab and Builder behaviour are deferred by name.
- [x] Owner decisions 1–6 in intent.md and the eight 2026-11-05 answers are carried as requirements
      and not re-opened.
- [x] Intent open questions handled: 2 → R14 (owner, 2026-11-05); 3, 4, 5, 6 → R17, R11, R12, R2;
      rating `groupable` is `true` per the owner (2026-11-05, as open question 6 proposed),
      departing from the brief §5 example (Flag 5); 1 → stays with item 007, R16 only accepts an
      optional zone; 7 → not triggered.

## Feature readiness

- [x] Roadmap phase stated (MVP) with a one-line reason.
- [x] Every acceptance criterion is provable by a named unit test, type test or build/lint check;
      the parity criteria (AC15, AC25, AC28) run in Chromium, a real browser engine.
- [x] Every acceptance criterion cites the requirement(s) it proves.
- [x] Every requirement is proven by at least one acceptance criterion (trace below). R10 and R20
      claim "modern" / "current" browsers but are proven in Chromium only; other engines are a
      named residual risk (Flag 8).
- [x] ADR 0006 exit check is included (AC1: built-in and fixture field through the same public
      calls; AC2: build with no React dependency).
- [x] Acceptance criteria are final — AC7, AC19 and AC20 use the decided answer shape; AC26
      (`field_type_changed` only), AC27 (`field_kind_changed`) and AC29
      (`field_config_incompatible`) have fixed codes and params; AC6 checks rating as groupable;
      AC15 uses grapheme counts with Thai and emoji examples; AC15, AC25 and AC28 require Chromium.
- [x] Flags list every conflict found with the brief, the constitution and ADRs 0003, 0007, 0009,
      0011 (incl. the brief §5 rating example, Flag 5, and the ADR 0007/0009 extensions — stored
      kind, answer-compatibility rule, three version codes — Flag 7); no BI creep.
- [x] Brief and ADR follow-ups the spec depends on — **accepted as known gaps** (owner decision
      2026-11-05, Flags 1–7); they no longer block `/impl-plan`. Remaining owner actions: amend
      brief §5 (9 fields, headless two-call API, `toCell` signature, rating `groupable: true`),
      §6 (`date` + `datetime` columns) and §10 MVP item 1 (9 fields), then accept ADR 0011.
      Remaining `/impl-plan` actions: amend ADR 0003 (no `LocalizedText`), ADR 0007 (`datetime`,
      stored values, "unanswered", answer-compatibility rule, `summarize` set) and ADR 0009 (stored
      kind and declared config incompatibility, three codes), and update ADR 0011 (file answer as
      IDs, `storeAs: "text"`).

## Constitution (MUST principles relevant to this item)

- [x] 1 Schema is the hero — Zod-first, types inferred, never hand-written (R1, R5–R7); the
      option-field answer shape is fixed as part of the stored format.
- [x] 2 Dogfood the plugin API — built-ins only through the public calls; fixture field proves it
      (R3, R9, AC1, AC4, AC14). R19 reads `type`, `storeAs` and answer-compatibility rules from the
      definitions with no built-in special case: `rating` declares its `max` rule through the same
      public call a fixture uses, and a third-party `rating` without a rule is not refused (R12,
      AC27, AC29).
- [x] 3 Self-host first — no network requests, no environment reads (R20).
- [x] 4 Two separate worlds — no auth surface here; public-safe schema and untrusted-input rules
      in Edge cases.
- [x] 5 No in-house BI — analytics is data only, closed `summarize` set; rating `groupable` only
      marks it usable in the Phase 2 cross-tab (R2, R12, Flags 5 and 10); the rating `max` rule
      is a validation rule, not analytics.
- [x] 7 Small scope — MVP item 1 only; scope fence from intent.md respected.
- [x] 8 Response integrity — stored versions never rewritten (R7); type, stored-kind and
      declared-incompatible config changes refused across versions, so merged data never mixes
      kinds or scales (R19).
- [x] 11 Test first — every acceptance criterion maps to a test or check.
- [x] 12 Type safety — inferred types and strict settings (R1, R20, AC3, AC28).
- [x] 13 Multilingual by default — codes and params only, no user-facing strings (R4); Thai and
      emoji lengths counted as users perceive them, identically in Node and Chromium (R10, AC15).

## Traceability (requirement → acceptance criteria)

| Req | Proven by              | Req | Proven by             |
| --- | ---------------------- | --- | --------------------- |
| R1  | AC1, AC3, AC23, AC29   | R11 | AC6, AC16             |
| R2  | AC6, AC7, AC27         | R12 | AC6, AC17, AC29       |
| R3  | AC1, AC4, AC5, AC14    | R13 | AC18                  |
| R4  | AC8                    | R14 | AC7, AC19, AC20       |
| R5  | AC9, AC10              | R15 | AC21, AC22            |
| R6  | AC1, AC9, AC10         | R16 | AC21, AC23            |
| R7  | AC11                   | R17 | AC6, AC7, AC24        |
| R8  | AC1, AC12, AC28        | R18 | AC25                  |
| R9  | AC12, AC13, AC14, AC19 | R19 | AC26, AC27, AC29      |
| R10 | AC6, AC15              | R20 | AC2, AC15, AC25, AC28 |

## Story → requirements

| Story                               | Requirements           |
| ----------------------------------- | ---------------------- |
| US1 — Define and register (P1)      | R1, R2, R3, R4, R20    |
| US2 — Form Schema (P1)              | R4, R5, R6, R7, R20    |
| US3 — Whole response (P1)           | R4, R8, R9, R20        |
| US4 — Text, number, rating (P2)     | R2, R10, R11, R12, R20 |
| US5 — Option fields + Other (P2)    | R2, R13, R14, R20      |
| US6 — Date and file (P2)            | R2, R15, R16, R17, R20 |
| US7 — Identity across versions (P3) | R4, R18, R19, R20      |
