# Spec quality checklist — 001-field-core

Built-in, **author-owned** checklist for [spec.md](../spec.md): written by `/spec`, re-evaluated by
`/clarify`. `[x]` means the author's own evaluation found the item satisfied; `[ ]` items say why
not. Reviewer-owned checklists (`/checklist`) are separate files and are never ticked here.

Evaluated: 2026-11-04, first draft of spec.md. Re-evaluated: 2026-11-05, after `/clarify` wrote
back four owner answers; again on 2026-11-05 after a second `/clarify` round wrote back four more;
and again on 2026-11-05 after a third `/clarify` round resolved the `/analyze` findings — four
owner decisions (F04, F06, F08, F27) and fourteen syncs with the approved plan.md and ADR 0012
(Clarifications, Session 2026-11-05: 12 Q/A entries plus one sync entry); and again on 2026-11-05
after the second `/analyze` pass — a sync with the revised plan.md (N05, N07, N08, N14, with N07
= rating config codes named in Limits; F29 accepted as-is), no owner decision (one further sync
entry); and again on 2026-11-05 after the third `/analyze` pass — P06 (AC24 `file` config
codes), P07 (this list and the spec log now match), P08 (`idSchema` added to Terms), no owner
decision (one further sync entry); and again on 2026-11-06 after `/implement` and two `/converge`
rounds — a sync with the implementation details recorded in plan.md Revisions (converge finding
L1, seven items), no owner decision (Clarifications, Session 2026-11-06: one sync entry).

## Content quality

- [x] No implementation details: no file paths, code structure or library choices beyond what the
      brief itself names (Zod, brief §2/§3). Stored property names appear only because they are
      the schema contract; where the API places the stored-values, "unanswered" and
      answer-compatibility rules is left to `plan.md` (the compatibility rule is described only by
      what it decides: earlier and new config in, accepted or the properties concerned out). Text
      length cites a standard (Unicode UAX #29), not a library; so do the language rule (Unicode
      BCP 47 locale identifiers, UTS #35) and the line-break rule (ECMAScript line terminators,
      listed as characters). Chromium is named because the owner set it as the engine that proves
      Node/browser parity; the tooling that runs tests in it is left to `plan.md` (Flag 8). The
      "Terms" line maps spec terms to plan.md's API names for tracing only (same set as plan.md's
      glossary, incl. `idSchema`, `validateResponse`, `checkVersionHistory`); no requirement
      depends on those names.
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
      R19, Edge cases, AC3, AC8, AC15, AC25–AC29, Flags 1–9; third round (`/analyze`): intro
      (Terms), schema section, R1, R4–R8, R10, R11, R13–R17, Edge cases (Failure, Permission,
      i18n, Limits), AC8–AC12, AC15, AC16, AC18–AC20, AC22–AC24, AC28, Flags 8–10; second
      `/analyze` sync: intro, R4, R8, R19, R20, Edge cases (Failure, Limits), AC10, AC12, AC26,
      Flag 9; third `/analyze` sync: intro (Terms), AC24 — and logged under
      `## Clarifications` → `### Session 2026-11-05` (12 Q/A entries plus three entries listing
      the syncs); 2026-11-06 implementation sync: intro, R2, R4, R6, R8, R14–R16, R19, Edge cases
      (Empty, Failure, Limits), Flag 9 — logged under `### Session 2026-11-06` (one sync entry).
- [x] Requirements are numbered, testable, and each is tagged with at least one user story.
- [x] Requirement count within the ADR 0006 limit: **20 / 20**; acceptance criteria **29**. No
      round added a requirement (the second extended R1, R4, R12 and R19; the third extended R1,
      R4–R8, R10, R11 and R13–R17) and the third added no AC, only extended existing ones; the
      second `/analyze` sync extended R4, R8, R19, R20 and AC10, AC12, AC26 and added neither;
      the 2026-11-06 implementation sync extended R2, R4, R6, R8, R14–R16 and R19 and the Edge
      cases, changed no AC text and added neither (AC numbers stable); nothing trimmed; the fallback split is mapped to stories, plan steps and AC rows in Flag 9,
      with the same row list as plan.md Risk 6 (AC6, AC7, AC9, AC12 hostile-corpus and AC13 rows
      of the option, date and file families; AC10 option-ID rows; AC27 `date` case; AC29
      option-field and `file` rows).
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
      without the selection, empty `optionIds`, Thai and emoji length counting) and the third-round
      cases (non-object schema input, a plugin that throws, codes outside the catalogue, unknown
      keys in built-in configs and option entries, frozen plugin config shapes, `"other": null`,
      checkbox `maxSelections: 0`, `allowedTypes: []` and `*/*`, date-time fractions and the UTC
      year range, sub-minute historical offsets, invalid export time zones, numbers in plain
      decimal, which characters are line breaks, rare BCP 47 forms and engine CLDR differences)
      and the second `/analyze` sync cases (a registry lacking a schema's type in whole-response
      validation and in the version check, earlier versions out of order, invalid or repeated
      version numbers, engines without `Intl.Segmenter`, rating config codes with params) and the
      2026-11-06 implementation-sync cases (plugin rules that break their contract → developer
      `TypeError`, lazy registry lookup in the version check, `config: null`, export-option key and
      zone type, untrimmed and non-string dates, local year 0000, expanded-year cells, "Other"
      off with `other` selected, repeated IDs counted toward limits).
- [x] Scope is bounded: nothing from items 002–009 or Phase 2 is required; display rules, CSV time
      zone, upload/storage, `Answer` columns, cross-tab and Builder behaviour are deferred by name.
- [x] Owner decisions 1–6 in intent.md and the twelve 2026-11-05 answers are carried as
      requirements and not re-opened. The third-round syncs only align the spec with the
      owner-approved plan.md and ADR 0012; none re-opens an owner decision.
- [x] Intent open questions handled: 2 → R14 (owner, 2026-11-05); 3, 4, 5, 6 → R17, R11, R12, R2;
      rating `groupable` is `true` per the owner (2026-11-05, as open question 6 proposed),
      departing from the brief §5 example (Flag 5); 1 → stays with item 007, R16 only accepts an
      optional zone; 7 → not triggered.

## Feature readiness

- [x] Roadmap phase stated (MVP) with a one-line reason.
- [x] Every acceptance criterion is provable by a named unit test, type test or build/lint check;
      the parity criteria (AC15, AC25, AC28) run in Chromium, a real browser engine. The
      third-round extensions use concrete inputs and outputs (e.g. AC16 `1e21`, AC22 fraction and
      year-range cases) or a checkable property (AC23: the cell names the same instant); several
      of them still need matching test rows in tasks.md, which is outside this checklist.
- [x] Every acceptance criterion cites the requirement(s) it proves.
- [x] Every requirement is proven by at least one acceptance criterion (trace below). R10 and R20
      claim "modern" / "current" browsers but are proven in Chromium only; other engines are a
      named residual risk (Flag 8; `/analyze` F29 accepted as-is). R20's `Intl.Segmenter`
      baseline is a stated scope limit, not a behaviour this item can prove: both test engines
      have it, so the "throws without it" exception has no AC, matching plan.md Risk 10. The
      2026-11-06 sync details (developer `TypeError`s for plugin contract faults, lazy registry
      lookup, export-option key/zone type, date trimming and year edges, `config: null`, "Other"
      off, repeat counting) refine requirements that existing ACs already prove (AC8, AC10, AC12,
      AC19, AC21–AC23, AC26, AC27, AC29); their exact rows are pinned by the tests recorded in
      plan.md Revisions, not by new AC text.
- [x] ADR 0006 exit check is included (AC1: built-in and fixture field through the same public
      calls; AC2: build with no React dependency).
- [x] Acceptance criteria are final — AC7, AC19 and AC20 use the decided answer shape; AC26
      (`field_type_changed` only), AC27 (`field_kind_changed`) and AC29
      (`field_config_incompatible`) have fixed codes and params; AC6 checks rating as groupable;
      AC15 uses grapheme counts with Thai and emoji examples; AC15, AC25 and AC28 require Chromium.
      Third round: every case named by a finding states its code (`required` for blank texts and
      a missing `otherLabel`, `unknown_property` for config and option-entry keys, `too_small`
      for `maxSelections: 0`, `too_few` for `allowedTypes: []`, `invalid` for `*/*`, non-object
      schemas and out-of-catalogue plugin codes); AC28 now names the shared tests and forbids
      environment-dependent skips. Second `/analyze` sync: AC26 states the history-input rows
      (order-independent "latest", `invalid` / `duplicate` version numbers returned alone,
      registry miss → `unknown_field_type` at the candidate's `["fields", i, "type"]`); AC12
      states the registry-miss row and the per-family hostile-JSON rows; AC10 and the Limits
      give rating config codes with params (`too_small` {min: 2}, `too_big` {max: 10},
      `not_integer`), matching plan.md's Zod mapping table. Third `/analyze` sync: AC24 names
      `too_small` {min: 1} for `maxFiles: 0` and `maxSize: 0`, consistent with R17's "integer ≥ 1"
      bounds and the code `maxSelections: 0` gives.
- [x] Flags list every conflict found with the brief, the constitution and ADRs 0003, 0007, 0009,
      0011 (incl. the brief §5 rating example, Flag 5, and the ADR 0007/0009 extensions — stored
      kind, answer-compatibility rule, three version codes — Flag 7); Flag 8 also records the
      engine CLDR difference behind language canonicalisation; no BI creep.
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
      option-field answer shape is fixed as part of the stored format; built-in configs and option
      entries are strict and a released config shape is frozen (R6).
- [x] 2 Dogfood the plugin API — built-ins only through the public calls; fixture field proves it
      (R3, R9, AC1, AC4, AC14). R19 reads `type`, `storeAs` and answer-compatibility rules from the
      definitions with no built-in special case: `rating` declares its `max` rule through the same
      public call a fixture uses, and a third-party `rating` without a rule is not refused (R12,
      AC27, AC29). Strict configs are a recommendation open to plugins through the same means, not
      a built-in privilege (R6); plugins and built-ins raise codes from the same closed catalogue
      (R4, AC8). The never-throw promise covers only package and built-in code (R8), on engines
      that meet R20's `Intl.Segmenter` baseline; that is a statement about whose bugs surface,
      not a privilege. A registry miss is reported the same way for any type, built-in or plugin
      (R8, R19). The run-time contract checks on stored kinds and answer-compatibility results
      apply to every definition alike (R2, R19); built-ins pass them, so they are not a privilege.
- [x] 3 Self-host first — no network requests, no environment reads (R20).
- [x] 4 Two separate worlds — no auth surface here; public-safe schema and untrusted-input rules
      in Edge cases. Unknown keys are refused down to built-in configs and option entries (R6); a
      lenient plugin config is the remaining path for extra data to reach respondents, named in
      Edge cases (Permission) with the strict-config recommendation.
- [x] 5 No in-house BI — analytics is data only, closed `summarize` set; rating `groupable` only
      marks it usable in the Phase 2 cross-tab (R2, R12, Flags 5 and 10); the rating `max` rule
      is a validation rule, not analytics.
- [x] 7 Small scope — MVP item 1 only; scope fence from intent.md respected.
- [x] 8 Response integrity — stored versions never rewritten (R7); type, stored-kind and
      declared-incompatible config changes refused across versions, so merged data never mixes
      kinds or scales (R19).
- [x] 11 Test first — every acceptance criterion maps to a test or check.
- [x] 12 Type safety — inferred types and strict settings (R1, R20, AC3, AC28).
- [x] 13 Multilingual by default — codes and params only, no user-facing strings (R4); the
      catalogue is closed in MVP, so every code that can leave the package has an `en` and a `th`
      message to map to (R4, AC8); Thai and emoji lengths counted as users perceive them,
      identically in Node and Chromium (R10, AC15); number cells are plain ASCII decimals
      regardless of locale (R11).

## Traceability (requirement → acceptance criteria)

| Req | Proven by              | Req | Proven by             |
| --- | ---------------------- | --- | --------------------- |
| R1  | AC1, AC3, AC23, AC29   | R11 | AC6, AC16             |
| R2  | AC6, AC7, AC27         | R12 | AC6, AC17, AC29       |
| R3  | AC1, AC4, AC5, AC14    | R13 | AC18                  |
| R4  | AC8                    | R14 | AC7, AC19, AC20       |
| R5  | AC9, AC10              | R15 | AC21, AC22            |
| R6  | AC1, AC9, AC10, AC18   | R16 | AC21, AC23            |
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
