# 001 — Field core: tasks

Inputs: [spec.md](./spec.md) (US1–US7, R1–R20, AC1–AC29), [plan.md](./plan.md) (approved
2026-11-05, incl. Zod as a peer dependency, ADR 0012, `pnpm test:browser` and the CI reorder;
revised the same day after `/analyze`, see its Revisions). All paths are relative to the repo root.
39 tasks (limit 40, ADR 0006), plus convergence tasks T040 and T041 appended at the end
(R2, R8, R19 hardening). Revised after `/analyze` (F01, F02, F04, F05, F06, F10, F11, F12,
F13, F16, F22, F23, F24, F27, F28, F30). Revised again after the second `/analyze` pass
(2026-11-05: N01, N02, N04, N06, N07, N10, N11, N12, N13). Revised a third time after the third
`/analyze` pass (2026-11-05: P02, P03, P04, P06); every fix is a wording change inside an
existing task, numbering unchanged.

Conventions for every task:

- Tests are written first and must fail for the right reason before the implementation task that
  follows them. A test task names the criterion it proves.
- Shared tests (`test/**/*.test.ts` outside `test/node/` and `test/browser/`) run in both engines:
  `pnpm test` (Node) and `pnpm test:browser` (Chromium, with `PLAYWRIGHT_CHROMIUM_PATH`
  set). They must not skip by environment.
- Every failure assertion goes through `test/helpers/issues.ts` (T005), which also parses the issues
  with the strict `issueSchema`; that is how each test task also serves AC8 for its own failure
  cases.
- Every task that adds a runtime export to `src/api.ts` or `src/fields/index.ts` (T011, T013, T015,
  T018, T025, T030, T031, T033) lists `test/public-api.test.ts` (created in T009) and extends its
  pinned list in the same commit; the file is also why edits to `api.ts` are sequential.
- Each built-in family's test task (T016 text and textarea, T017 number and rating, T020 option
  fields, T022 date, T024 file) asserts, before that family's implementation task: its analytics
  (AC6), its stored values (AC7), the built-in config defaults AC9 names for it, written in and
  re-parsing to an equal value (AC9; the text family has none), an unknown config key
  (`unknown_property` at
  `["fields", 0, "config", <key>]`, AC10) and every value of `test/fixtures/hostile-json.ts` (created in
  T014) as an answer and as a `config` through `parseFormSchema` (no throw, every issue in the
  catalogue, AC12). T032 is the final cross-check over `builtInFields`.
- Fields in `src/fields/**` import only `src/api.ts` and `zod` (constitution 2, ESLint from T004).
- Each phase ends green on `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm test:browser`; if the build diverges from `plan.md` or this file, update them in the same
  commit (constitution 18).

## Phase 1 — Setup

- [x] T001 Add the dependencies and scripts: `zod` as peer dependency `^4.6.0` plus pinned devDependency `4.6.7`; devDependencies `@vitest/browser-playwright` 5.1.0 and `playwright` 1.64.1; script `test:browser` = `vitest run --config vitest.browser.config.ts`; regenerate the lockfile — `packages/schema/package.json`, `pnpm-lock.yaml`
- [x] T002 SPIKE, gates every browser proof (AC15, AC25, AC28; plan Order step 1, Risk 2). Test first: write `test/browser/engine.test.ts` (asserts a real Chromium user agent and no Node `process`) and a trivial shared `test/smoke.test.ts`; `git mv` `test/dist.test.ts` to `test/node/dist.test.ts` and `test/no-react.test.ts` to `test/node/manifest.test.ts`. Then write the Node project (`env.TZ = "Pacific/Pago_Pago"`, shared plus `test/node/**`) and the Chromium project (Playwright provider, `executablePath` from `PLAYWRIGHT_CHROMIUM_PATH`, context `locale: "th-TH"`, `timezoneId: "Pacific/Kiritimati"`, shared plus `test/browser/**`). Exit: the smoke test passes under `pnpm test` and under `pnpm --filter @songnoi/schema test:browser` with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` (the root `test:browser` script only exists after T003), and `engine.test.ts` proves real Chromium. If Vitest browser mode cannot be made to run, STOP: take the plan's Playwright-bundle fallback and update `plan.md` in the same commit before any feature code (proves AC: AC28, engine part) — `packages/schema/vitest.config.ts`, `packages/schema/vitest.browser.config.ts`, `packages/schema/test/browser/engine.test.ts`, `packages/schema/test/smoke.test.ts`, `packages/schema/test/node/dist.test.ts`, `packages/schema/test/node/manifest.test.ts`
- [x] T003 [P] Wire the command and CI: root script `test:browser` = `turbo run test:browser`; Turbo task `test:browser` (`dependsOn: ["^build"]`) with `PLAYWRIGHT_CHROMIUM_PATH` and `PLAYWRIGHT_BROWSERS_PATH` in `globalPassThroughEnv`; package `turbo.json` makes `test:browser` also depend on the package's own `build` (dist smoke); in CI move "Install Playwright browser" before "Unit tests" and add a "Browser parity tests" step running `pnpm test:browser` — `package.json`, `turbo.json`, `packages/schema/turbo.json`, `.github/workflows/ci.yml`
- [x] T004 [P] Add the R20 guard rails to ESLint for `packages/schema/src/**`: `no-restricted-imports` (every `node:*` and bare Node built-in, `react*`), `no-restricted-globals` (`process`, `Buffer`, `require`, `global`, `__dirname`, `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator`, `window`, `document`, `localStorage`), `no-restricted-properties` (local-time and locale APIs, `Date.parse`); a second block for `src/fields/**` repeating those patterns and adding `**/core/**` (constitution 2); no TSDoc lint rule and no ESLint TSDoc plugin (TSDoc comments are a T033 deliverable) (proves AC: AC28, lint part; R20) — `eslint.config.mjs`

## Phase 2 — Foundational

- [x] T005 Write the error-catalogue tests and the assertion helper, and delete the spike's smoke test (`issues.test.ts` is now the first real shared test): `expectIssues(...)` that checks code, params and path and also parses every issue with strict `issueSchema` (no `message` key); `issues.test.ts` asserts the catalogue equals R4's 29 codes with their params, every row of the Zod-to-catalogue mapping table in both the `schema` and `answer` contexts (including `reportInput` missing-vs-wrong-type and the `unknown_property` path), `customIssue` (unknown or malformed code becomes `invalid`), and `FieldDefinitionError.issues` with a code-only `message` (proves AC: AC8) — `packages/schema/test/helpers/issues.ts`, `packages/schema/test/issues.test.ts`, `packages/schema/test/smoke.test.ts` (deleted)
- [x] T006 Implement `issueSchema` (discriminated union, strict `{ code, params, path }`), `Issue`, `IssueCode`, `customIssue`, the `toIssues(zodIssues, context)` mapping, result helpers and `FieldDefinitionError` (readonly `issues`, code-only `message`; tested by T005) (R4), plus `isPlainObject` and own-key reads with `Object.hasOwn`; the mapping rules T005 leaves open are recorded in plan.md and pinned by `issues-rules.test.ts` — `packages/schema/src/core/issues.ts`, `packages/schema/src/core/json.ts`, `packages/schema/test/issues-rules.test.ts`

## Phase 3 — Define and register a field type through the public API (P1)

Goal (US1): with no built-in loaded, a fixture third-party field is defined and registered through
the public calls, its types are inferred, and bad definitions are refused.

- [x] T007 [US1] Write the fixture plugins: `acme/signature` (own `isUnanswered`, own `incompatibleChanges` returning a named property), `acme/measure` (config-dependent `storeAs` with declared `kinds`), `acme/note` (`storeAs: "none"`); defined with the public `defineField` only (support for AC1, AC3, AC7, AC12, AC14, AC27, AC29) — `packages/schema/test/fixtures/third-party.ts`
- [x] T008 [P] [US1] Write the type tests with `expectTypeOf`: inferred config and answer types of `acme/signature` equal the expected types (the built-in `rating` types are asserted in T017); `@ts-expect-error` on a `toCell`, a `storedValues` and an `incompatibleChanges` written for the wrong type; a provided optional member is non-optional on the returned definition (`defineField` called with `incompatibleChanges` gives a definition whose `incompatibleChanges` can be called directly without a `?.` or a non-null assertion; P03); confirm the package `tsconfig.json` includes `test/types/*.test-d.ts` so `pnpm typecheck` checks them (proves AC: AC3) — `packages/schema/test/types/define-field.test-d.ts`, `packages/schema/tsconfig.json`
- [x] T009 [P] [US1] Write the definition and registry tests: all 35 `summarize` x `storeAs` pairs (each misfit refused with `incompatible_analytics`, fits accepted) (proves AC: AC6, pairs part); `acme/note` gives an empty stored-value list (proves AC: AC7, `none` fixture); a registry built without built-ins accepts a third-party definition with type `text` and exports no pre-filled registry (proves AC: AC4, registry part); `duplicate_field_type`, `Text` / `my type` / `a/b/c` give `invalid_field_type`, `acme/signature` accepted (proves AC: AC5); malformed hand-built definitions give `invalid`; create `public-api.test.ts` pinning the runtime exports of this phase and asserting no registry object is among them (proves AC: AC4, no pre-filled registry; AC8 for definition errors) — `packages/schema/test/define-field.test.ts`, `packages/schema/test/registry.test.ts`, `packages/schema/test/public-api.test.ts`
- [x] T010 [US1] Implement `defineField` (const-generic `type`, `NoInfer` on dependent members, frozen result with method-signature members), `storeAsOf`, `StoreAs` / `Summarize`, the fit table, the structural definition checks, `StoredValueOf`, `FieldConfig<D>` / `FieldAnswer<D>`, throwing the T006 `FieldDefinitionError` from `core/issues.ts` (not redefined here) (R1, R2); the returned definition type keeps a provided optional member (`incompatibleChanges`) non-optional (the T008 type-test row; P03); also create `src/core/cell-options.ts` with the `CellOptions` Zod schema (`{ timeZone?: string }`, branded, without the time-zone refinement) and its inferred type, which T011 exports from `api.ts` as a type only (the pinned runtime list does not change), because `toCell(answer, config, options?: CellOptions)` needs the type (P02; T025 adds only `parseCellOptions`) — `packages/schema/src/core/define-field.ts`, `packages/schema/src/core/cell-options.ts`
- [x] T011 [US1] Implement `createFieldRegistry` (re-runs the definition checks with list-index paths, `duplicate_field_type`, throws once with all issues, `get` / `types`, no global registry); add `src/api.ts` (public API without built-ins: `defineField`, `createFieldRegistry`, `storeAsOf`, `FieldDefinitionError`, `customIssue`, `issueSchema`) and replace the `VERSION` placeholder in `src/index.ts` with the barrel `export * from "./api"` (R3); update `test/node/dist.test.ts` to check `defineField` instead of `VERSION`; the pinned list from T009 must go green (edit it only if the export list differs) — `packages/schema/src/core/registry.ts`, `packages/schema/src/api.ts`, `packages/schema/src/index.ts`, `packages/schema/test/node/dist.test.ts`, `packages/schema/test/public-api.test.ts`

## Phase 4 — Store a form as a validated Form Schema (P1)

Goal (US2): any stored form JSON is read through one entry point with every problem reported as a
code with a path; testable with a fixture-only registry.

- [x] T012 [US2] Write the Form Schema tests with a fixture-only registry: valid schema parses with defaults written in (`required` false) and re-parses to an equal value, `meta.language` `TH` returns `th` and `th-th` returns `th-TH` (proves AC: AC9, fixture part); invalid cases with code and path — repeated `fieldId`, `fieldId` `__proto__` (and `constructor`, `prototype`) as `reserved_id`, `fieldId` with a space, a `.` or 65 characters as `invalid`, unknown type, unknown property at form, meta and field level, blank title or label, language `en_US`, `x-private` (private-use-only), `zh-cmn-Hans` (extended language subtag), `i-klingon` and `art-lojban` (grandfathered) or empty, each `invalid` at `["meta", "language"]` (proves AC: AC10, non-config rows; the option-ID rows need option fields and live in T020); `schemaVersion` `1` accepted, missing, `0`, `2`, `"1"` give only `unsupported_schema_version` (proves AC: AC11); a registry without built-ins refuses `text` with `unknown_field_type` (proves AC: AC4, unknown-`text` part); internal migration loop driven by a fake step; non-object input `null`, `[]` and `"x"` each give `invalid` at `[]` and no other error (proves AC: AC11) — `packages/schema/test/form-schema.test.ts`
- [x] T013 [US2] Implement the ID rules (`idSchema` with pattern `^[A-Za-z0-9_-]{1,64}$`, the only copy of the pattern, public; reserved `fieldId` set) and Form Schema v1: strict shapes, `FormSchema` types, version gate, migration loop (empty step list), `parseFormSchema` orchestration reporting every problem (unknown type skips config, config issues prefixed with `["fields", i, "config"]`, `duplicate_field_id`), language canonicalised with `Intl.getCanonicalLocales`, defaults written into the output; export `CURRENT_SCHEMA_VERSION`, `parseFormSchema` and `idSchema` from `api.ts` and extend the pinned list (R5, R6, R7) — `packages/schema/src/core/ids.ts`, `packages/schema/src/core/form-schema.ts`, `packages/schema/src/api.ts`, `packages/schema/test/public-api.test.ts`

## Phase 5 — Validate a whole response in one call (P1)

Goal (US3): the server decides on its own, getting normalised answers or every error grouped by
`fieldId`; testable with fixture fields only.

- [x] T014 [US3] Create the shared hostile-JSON corpus and write the response tests with fixture fields. `test/fixtures/hostile-json.ts` holds what `JSON.parse` can return: wrong types, empty and blank strings, `-0`, `1e308`, arrays of mixed types, wrong option-answer shapes, own `__proto__` / `constructor` keys (built with `JSON.parse`), a 10,000-deep nested array; every family test reuses it. `response.test.ts` rows: valid answer set returns the normalised set, three bad fields give three `fieldId` groups, inputs `null`, `[]`, `"x"`, `1` and the deep array give a whole-set `invalid` without throwing; a test-local plugin whose answer schema throws makes `validateResponse` throw that same exception (propagation, R8); a schema whose type is missing from the registry used for validation gives `unknown_field_type {type}` at `[]` in that field's group, answered or not, with `ok: false` and no throw (F28) (proves AC: AC12); absent and `null` give `required` when required and are omitted when optional, keys outside the schema including `__proto__` and `constructor` give `unknown_field` in the answer-set group and leave the other fields' results unchanged, a `fieldId` named `toString` does not read `Object.prototype`, an empty form validates `{}` (proves AC: AC13, absent / `null` / unknown-key rows); `acme/signature`'s `isUnanswered` is honoured (proves AC: AC14); a test-local plugin (public `defineField`) whose answer rule raises a code outside R4's catalogue, driven through `validateResponse`, comes out as `invalid` in that field's group, with `ok: false` and the issue passing strict `issueSchema` (proves AC: AC8, out-of-catalogue part); re-validating the normalised set returns it unchanged — `packages/schema/test/response.test.ts`, `packages/schema/test/fixtures/hostile-json.ts`
- [x] T015 [US3] Implement `validateResponse` (R8, R9): plain-object gate, schema-order loop with `Object.hasOwn` reads, registry miss to `unknown_field_type`, `isUnanswered` hook before the answer schema, `reportInput` mapping to catalogue issues, unknown own keys to `unknown_field`, results built only from schema `fieldId`s, never throws on JSON input (plugin exceptions propagate); export from `api.ts` and extend the pinned list — `packages/schema/src/core/response.ts`, `packages/schema/src/api.ts`, `packages/schema/test/public-api.test.ts`

## Phase 6 — Built-in text, textarea, number and rating fields (P2)

Goal (US4): the four scalar built-ins, defined only through the public API, validated identically
in Node and Chromium; first usable increment for 002's text, number and rating work.

- [x] T016 [US4] Write the text-family tests (`text` and `textarea`), before their implementation: trimming, grapheme counting with `maxLength` 1 and `minLength` 2 for `ที่`, `"  ที่  "`, `👍🏽`, `👨‍👩‍👧‍👦`, plus `สวัสดี` against `maxLength` 4 and 3, the flag `🇹🇭`, `กา` as 2, `textarea` counting `a\nb` and `a\r\nb` as 3, `toCell` returns trimmed text, a small canary corpus in `graphemes.test.ts`, identical expectations in Node and Chromium (proves AC: AC15); line terminators (trim first, so `"hi\n"` becomes `"hi"`): `text` refuses an inner LF, CR, CRLF, LS (U+2028) and PS (U+2029) as `invalid` and accepts and keeps an inner NEL (U+0085), VT and FF, `textarea` keeps all of them (proves AC: AC15, line-break part); analytics for both types: `storeAsOf` `text`, `summarize` `responses`, not groupable (proves AC: AC6, text family); stored values: the trimmed text as one value (proves AC: AC7, text family); config rows via `parseFormSchema` — `minLength` > `maxLength` gives `invalid_range`, `maxLength: 0` gives `too_small`, an unknown config key gives `unknown_property` at its path (proves AC: AC10, text config rows); blank and whitespace-only text is unanswered, required gives `required` (proves AC: AC13, blank-text row); the hostile corpus as answers and config for both types (proves AC: AC12, text family) — `packages/schema/test/graphemes.test.ts`, `packages/schema/test/fields/text.test.ts`
- [x] T017 [P] [US4] Write the number, rating and exit-check tests, before their implementation: `number` accepts `2.5` by default, `not_integer` with `integer`, inclusive bounds, `min` = `max` allowed, `min` > `max` gives `invalid_range`, `"5"` is `invalid`, `""` is `invalid` (not unanswered, also when optional); plain-decimal cells: `toCell(1234.5)` is `"1234.5"`, `-0.25` is `"-0.25"`, `1e21` is `"1000000000000000000000"`, `1e-7` is `"0.0000001"`, `-1.5e-10` is `"-0.00000000015"`, `1.2345e21` is `"1234500000000000000000"`, `-0` is `"0"`, `Number.MAX_VALUE` (309 digits) and `Number.MIN_VALUE` (`0.`, 323 zeros, `5`); a deterministic sweep over every power of ten from `1e-323` to `1e308` and a seeded sweep of 10,000 finite doubles from random bit patterns, each cell matching `^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$` and `Number(cell) === n` (proves AC: AC16); `rating` answer `0` gives `too_small` {min: 1}, `max + 1` gives `too_big` {max}, `3.5` gives `not_integer`, `""` is `invalid` (not unanswered, also when optional), `toCell(4)` is `"4"` (proves AC: AC17; the rating config errors are the AC10 rows below, which prove AC17 too); built-in defaults through `parseFormSchema` with no `config`: `rating` gets `max` 5 and `icon` `star`, `number` gets `integer` false, each written into the output, and parsing the output again gives an equal value (proves AC: AC9, number and rating; AC17 defaults); answer-compatibility rule (the call is direct, with no `?.`: the returned definition type of `defineField` keeps a provided `incompatibleChanges` non-optional, so it typechecks; the T008 type-test row; P03): `ratingField.incompatibleChanges({ max: 5, icon: "star" }, { max: 10, icon: "star" })` returns `["max"]`, and an `icon`-only change (`{ max: 5, icon: "star" }` to `{ max: 5, icon: "heart" }`) returns `[]` (proves AC: AC29 rating part; US4 independent test); analytics: `number` is `number` / `histogram+stats` / not groupable, `rating` is `number` / `distribution+avg` / groupable (proves AC: AC6, number and rating); stored values: the number, one `number` value each (proves AC: AC7, number and rating); config rows via `parseFormSchema`, each at its path under `["fields", 0, "config"]` — rating `max` 1 gives `too_small` {min: 2}, `max` 11 gives `too_big` {max: 10}, `max` 4.5 gives `not_integer`, each at `[…, "max"]`; rating `{ "max": 5, "color": "red" }` gives `unknown_property` {key: "color"} at `[…, "color"]`; a number unknown key gives `unknown_property` {key} at `[…, <key>]` (proves AC: AC10, number and rating config rows; AC17, rating config errors); the hostile corpus as answers and config for both types (proves AC: AC12, number and rating); type tests that the inferred config and answer types of `ratingField` equal the expected types (proves AC: AC3, rating part); `exit-check.test.ts` creates one `createFieldRegistry([ratingField, acmeSignature])` through the same public call, parses a Form Schema using both and validates a response (proves AC: AC1) — `packages/schema/test/fields/number.test.ts`, `packages/schema/test/fields/rating.test.ts`, `packages/schema/test/exit-check.test.ts`, `packages/schema/test/types/define-field.test-d.ts`
- [x] T018 [US4] Implement `countGraphemes` (lazy `Intl.Segmenter("en", { granularity: "grapheme" })`, no fallback) and export it from `api.ts` with the pinned list extended; implement the shared text builder and the `text` and `textarea` definitions (config strict, `invalid_range`, trim first then count only when a limit is set, `text` refuses LF, CR, LS and PS and accepts NEL, VT and FF, `isUnanswered` for blank text, analytics `text` / `responses` / not groupable); run `pnpm test` and `pnpm test:browser` (R10, R20) — `packages/schema/src/core/text.ts`, `packages/schema/src/fields/shared/text.ts`, `packages/schema/src/fields/text.ts`, `packages/schema/src/fields/textarea.ts`, `packages/schema/src/api.ts`, `packages/schema/test/public-api.test.ts`
- [x] T019 [P] [US4] Implement the plain-decimal helper `toPlainDecimal` (string-only point shift of `String(n)`, no `toFixed` / `Intl`, never an exponent) and the `number` and `rating` definitions (`number` and `rating` cells both use the helper; `rating` groupable, `incompatibleChanges` returning `["max"]` when `max` differs, the only built-in rule) (R11, R12) — `packages/schema/src/fields/shared/decimal.ts`, `packages/schema/src/fields/number.ts`, `packages/schema/src/fields/rating.ts`

## Phase 7 — Built-in choice, dropdown and checkbox fields with "Other" (P2)

Goal (US5): the three option fields with stable option IDs, optional "Other", checkbox min/max and
label-based cells.

- [x] T020 [US5] Write the option-field tests (`choice`, `dropdown`, `checkbox`), before their implementation; one file, rows in six groups, all config groups through `parseFormSchema` with the option built-ins. (a) Config (proves AC: AC18): no options gives `too_few` {min: 1}, missing `options` gives `required`, blank option label, `allowOther` without `otherLabel`, and `allowOther` with a blank `otherLabel` (`""` and `"  "`) each give `required` (the last at `[…, "otherLabel"]`), an unknown config key, an option entry with an extra key such as `value` gives `unknown_property` at `["fields", 0, "config", "options", j, "value"]`; checkbox `maxSelections: 0` gives `too_small` {min: 1}, `minSelections` > `maxSelections` and `minSelections` above the selectable count (options, plus 1 with "Other") give `invalid_range` {min, max} at `[…, "minSelections"]`, `minSelections` equal to options + 1 with "Other" is accepted, `maxSelections` above the selectable count is accepted, `otherLabel` kept while `allowOther` is false. (b) Option-ID rows (proves AC: AC10, AC18; option-ID rows, moved here from T012): a repeated option ID within a field gives `duplicate_option_id` at the repeat's `["id"]`, the same ID in two fields passes, option ID `other` gives `reserved_id` {id: "other"}, an option ID with a space gives `invalid`. (c) Answers (proves AC: AC19): two IDs on `choice` / `dropdown` give `too_many` {max: 1}, `other` while "Other" is off gives `unknown_option`, `other_text_required` for missing, `null`, `""` and `"  "` text (`{ "optionIds": ["other"], "other": null }` included), `other` text present without the selection (`""` and `null` included) is `invalid` at `["other"]`, and so is `{ "optionIds": [], "other": "x" }`, which is not unanswered (`invalid` at `["other"]`, not `required`, also on a required field), "Other" counted toward checkbox min / max, optional checkbox with `minSelections: 2` (none valid, one gives `too_few`), an unknown ID gives `unknown_option` {optionId} and a repeated ID `duplicate` {value} at the repeat (spec R14), a bare ID string, non-string `optionIds` and an extra property are `invalid`, `"  TikTok "` normalised to `"TikTok"`. (d) Unanswered (proves AC: AC13, empty-selection row): `{ "optionIds": [] }` is unanswered, required gives `required`; a required checkbox with `minSelections: 0` still needs a selection (`{ "optionIds": [] }` gives `required`). (e) Cells with the example form's config (proves AC: AC20): label, `อื่นๆ: TikTok`, `Facebook; เพื่อนแนะนำ` in config order, `เพื่อนแนะนำ; อื่นๆ: TikTok` with "Other" last, `["Rm0vedOpt123", "c9Rk_4NnYb1E", "other"]` gives `เพื่อนแนะนำ; Rm0vedOpt123; อื่นๆ: TikTok` (known options in config order, unknown IDs in answer order, "Other" last), unknown ID alone written as itself, `allowOther` false with `otherLabel` kept still writes `<otherLabel>: <text>`, no `otherLabel` writes `other: TikTok`. (f) Family rows: built-in default through `parseFormSchema` — each of `choice`, `dropdown` and `checkbox` without `allowOther` gets `allowOther` false written in, and parsing the output again gives an equal value (proves AC: AC9, option fields); analytics for all three are `text` / `counts` / groupable (proves AC: AC6, option fields); stored values in answer order — checkbox `["Qm2xT8aLp0vW", "other"]` without the text, `choice` with "Other" `["other"]` (proves AC: AC7, option fields); the hostile corpus as answers and config (proves AC: AC12, option fields) — `packages/schema/test/fields/options.test.ts`
- [x] T021 [US5] Implement the shared option builder (config strict; option IDs through the public `idSchema`; `duplicate_option_id` and `reserved_id` for `other`; `otherLabel` required when `allowOther`; checkbox limits with `maxSelections` ≥ 1 and the two `invalid_range` rules; strict `{ optionIds, other? }` answer with the R14 rules, limits applied only when answered; `isUnanswered` for an empty selection; cells by the config-order / answer-order / "Other"-last rule with the `otherLabel` fallback; stored values in answer order; analytics `text` / `counts` / groupable) and the `choice`, `dropdown` and `checkbox` definitions that differ only in `type`, `maxIds` and checkbox limits (R13, R14) — `packages/schema/src/fields/shared/options.ts`, `packages/schema/src/fields/choice.ts`, `packages/schema/src/fields/dropdown.ts`, `packages/schema/src/fields/checkbox.ts`

## Phase 8 — Built-in date and file fields (P2)

Goal (US6): date-only and date-time answers that mean the same in every time zone, cells in a chosen
zone, and a file field that references uploads by ID.

- [x] T022 [US6] Write the shared date case table and the date tests, before the implementation: date-only `2026-11-04` unchanged, `2026-02-29` is `invalid_date`, `2028-02-29` valid, `0000-01-01` is `invalid_date` and `0001-01-01` and `9999-12-31` are valid, date-time while `includeTime` is false is `invalid_date`, `""` is `invalid_date` with `includeTime` false and true (not unanswered, also when optional), `toCell` unchanged for no zone, `Pacific/Kiritimati` and `Pacific/Pago_Pago` (proves AC: AC21); `+07:00` conversions to UTC, `offset_required`, `T24:00` and `:60` give `invalid_date`, date-only while `includeTime` gives `invalid_date`, fraction digits 1–9 truncated to milliseconds never rounded (`.123456789Z` gives `.123Z`, `.9999` gives `.999`), UTC year range (`0001-01-01T00:30+01:00` and `9999-12-31T23:30-01:00` give `invalid_date`), `storeAs` `datetime` vs `date` (proves AC: AC22); cells `…Z` with no zone, `Asia/Bangkok`, `America/New_York` `-05:00` January and `-04:00` July, a historical instant in a zone whose local-mean-time offset has seconds gives a whole-minute offset and a cell that parses back to the same instant (the case is chosen so Node and Chromium agree), `invalid_time_zone` for `Mars/Base`, `+07:00` and `""` through `parseCellOptions` (proves AC: AC23, cell part); built-in default through `parseFormSchema`: a `date` field with no `config` gets `includeTime` false written in, and parsing the output again gives an equal value (proves AC: AC9, date); analytics: `storeAsOf` `date` with `includeTime` false and `datetime` with it true, `timeline`, not groupable (proves AC: AC6, date); stored values: date-only gives one `date` value, date-time one `datetime` value (proves AC: AC7, date); unknown config key gives `unknown_property` (proves AC: AC10, date); the hostile corpus as answers and config, with `includeTime` both ways (proves AC: AC12, date) — `packages/schema/test/fixtures/date-cases.ts`, `packages/schema/test/cell-options.test.ts`, `packages/schema/test/fields/date.test.ts`
- [x] T023 [US6] Write the Node-only time-zone independence test: flip `process.env.TZ` between two zones, re-run the date case table, assert identical outputs (proves AC: AC23, process-time-zone part; Chromium covers it under UTC+14 and `th-TH`) — `packages/schema/test/node/time-zone-independence.test.ts`
- [x] T024 [P] [US6] Write the file tests, before the implementation: `maxFiles: 0` gives `too_small` {min: 1} at `["fields", 0, "config", "maxFiles"]`, `maxSize: 0` gives `too_small` {min: 1} at `["fields", 0, "config", "maxSize"]` (both match the plan's mapping table, number origin, and spec R17, integers ≥ 1; P06), `allowedTypes: []` (`too_few` {min: 1}) and a malformed MIME entry refused, `image/*` accepted, `*/*` refused, too many IDs give `too_many`, a repeated ID gives `duplicate`, an empty ID is `invalid`, `toCell` joins IDs with `; ` (proves AC: AC24); the `maxFiles` 1 default is checked through `parseFormSchema` with no `config`, written into the output, and parsing the output again gives an equal value (proves AC: AC9, file; AC24 default); an empty file list is unanswered and required gives `required` (proves AC: AC13, empty-file-list row); analytics `text` / `count` / not groupable (proves AC: AC6, file); two IDs give two `text` stored values (proves AC: AC7, file); unknown config key gives `unknown_property` (proves AC: AC10, file); the hostile corpus as answers and config (proves AC: AC12, file) — `packages/schema/test/fields/file.test.ts`
- [x] T025 [US6] Add the time-zone refinement to the T010 `CellOptions` schema (`invalid_time_zone` for a `RangeError`, an empty string or an offset-style zone) and implement `parseCellOptions` in the existing `cell-options.ts`; export `parseCellOptions` from `api.ts` and extend the pinned list; its test rows stay in T022 and T023 (R1, R16; P02) — `packages/schema/src/core/cell-options.ts`, `packages/schema/src/api.ts`, `packages/schema/test/public-api.test.ts`
- [x] T026 [US6] Implement UTC-only calendar parsing and zoned cells (`Intl.DateTimeFormat` `longOffset`, formatters cached per zone, no local getters, no `Date.parse`, fractions truncated, years 0001–9999, whole-minute offsets) and the `date` definition with config-dependent `storeAs` (`kinds: ["date", "datetime"]`) (R15, R16) — `packages/schema/src/fields/shared/calendar.ts`, `packages/schema/src/fields/date.ts`
- [x] T027 [P] [US6] Implement the `file` definition (`maxFiles`, `maxSize`, `allowedTypes` with at least one entry, `isUnanswered` for an empty list, one `text` stored value per ID, `summarize: "count"`) (R17) — `packages/schema/src/fields/file.ts`

## Phase 9 — Keep a question's identity across versions (P3)

Goal (US7): generated IDs that are valid and unique in Node and Chromium, and a version-history
check that refuses a type, stored-kind or declared-incompatible config change under the same
`fieldId`.

- [x] T028 [P] [US7] Write the ID tests: 100,000 `generateId()` values all pass `idSchema`, have the same length (12, at least 11), contain no duplicate and are never reserved; shared test so it runs in Node and in Chromium (proves AC: AC25) — `packages/schema/test/ids.test.ts`
- [x] T029 [P] [US7] Write the version-history tests: `text` to `number` gives only `field_type_changed` {previousType, type, version}; accepted changes — label, help, required, order, kind-preserving config changes, removed field, removed field re-added compatibly (proves AC: AC26); history input — the highest `version` is the latest whatever the array order, a `version` of `0`, `-1` or `1.5` gives `invalid` and a repeated `version` gives `duplicate` {value} at `["earlier", k, "version"]`, returned alone with nothing compared, an empty `earlier` is ok, a type shared by the candidate and an earlier version but missing from the registry gives `unknown_field_type` at `["fields", i, "type"]` and that field is skipped, while an earlier type missing from the registry when the candidate's type differs gives `field_type_changed` (no lookup needed; P04) (proves AC: AC26, history-input rows); `date` `includeTime` false to true and back gives `field_kind_changed`, label-only change passes, `acme/measure` kind flip gives `field_kind_changed` (proves AC: AC27); `rating` `max` 5 to 10, 10 to 5, removal then return with another `max` give `field_config_incompatible` {properties: ["max"], version}, `icon`-only passes, compatible changes to `number`, `choice` / `dropdown` / `checkbox`, `text` / `textarea` and `file` pass, `acme/signature`'s own rule is honoured, a third-party definition registered as `rating` without a rule accepts the same `max` change (proves AC: AC29); one issue per conflicting `fieldId` — `packages/schema/test/version-history.test.ts`
- [x] T030 [US7] Implement `generateId` (9 bytes from `globalThis.crypto.getRandomValues`, 12 base64url characters, no Node import) in the existing ID module; export from `api.ts` and extend the pinned list (R18) — `packages/schema/src/core/ids.ts`, `packages/schema/src/api.ts`, `packages/schema/test/public-api.test.ts`
- [x] T031 [US7] Implement `checkVersionHistory` (history input first: each `version` a positive safe integer, else `invalid`, repeats `duplicate`, those issues returned alone; latest = highest `version`; walk earlier versions from the highest down and stop at the first conflict per `fieldId`; checks in order type, `storeAsOf`, `incompatibleChanges`; path `["fields", i]`; registry miss gives `unknown_field_type` and skips the field; reads only the registry's definitions, no built-in special case); export from `api.ts` and extend the pinned list (R19) — `packages/schema/src/core/version-history.ts`, `packages/schema/src/api.ts`, `packages/schema/test/public-api.test.ts`

## Phase 10 — Polish

- [x] T032 Write the final nine-field cross-check over `builtInFields` imported from the barrel (fails until T033): the array holds the nine types in brief §5 order, none repeated; `storeAs`, `summarize` and `groupable` equal the spec table, `date` both ways, `groupable` true for exactly `choice`, `dropdown`, `checkbox`, `rating` (proves AC: AC6, cross-check); stored values per built-in — checkbox "Other" gives `["Qm2xT8aLp0vW", "other"]` without the text, `choice` "Other" gives `["other"]`, two files give two `text` values, date-time gives one `datetime` (proves AC: AC7, cross-check); one loop over `builtInFields` that parses each type with no `config` (option fields with a minimal `options` list) and checks that the output re-parses to an equal value, a cross-check of the default rows each family test owns (T017, T020, T022, T024), not a second copy of them (proves AC: AC9, cross-check); one loop over the registry for the required-vs-optional unanswered rows (blank text, empty selection, empty file list) that does not repeat the family rows (proves AC: AC13, cross-check); an unknown config key and the full hostile corpus, as answers and as `config` through `parseFormSchema`, for all nine (proves AC: AC10 and AC12, cross-check) — `packages/schema/test/builtins.test.ts`
- [x] T033 Add `builtInFields` (readonly array of the nine in brief §5 order, not a registry), export the nine definitions and the array from the barrel, give every public export a TSDoc comment, and finalise the pinned list in `public-api.test.ts` (no registry among exports) (R3, R20; ADR 0007 layout) — `packages/schema/src/fields/index.ts`, `packages/schema/src/index.ts`, `packages/schema/test/public-api.test.ts`
- [x] T034 [P] Write and update the build-artifact tests, then fix `tsdown.config.ts` only if they fail: `manifest.test.ts` asserts no `react`, `react-dom` or other UI library in `dependencies`, `peerDependencies` or `optionalDependencies`, `zod` is the only name across them, and the `exports` keys are exactly `.` and `./package.json`; `build-output.test.ts` scans `dist/**/*.js` for imports other than `zod` and relative files, no Node built-in, no `process` / `Buffer` / `require`; `dist.test.ts` checks ESM and declarations (proves AC: AC2) — `packages/schema/test/node/manifest.test.ts`, `packages/schema/test/node/build-output.test.ts`, `packages/schema/test/node/dist.test.ts`, `packages/schema/tsdown.config.ts`
- [x] T035 [P] Write the Chromium dist smoke test: import the built `dist/index.js` in the browser project and run the AC1 flow (registry from `ratingField` and a fixture third-party field, parse a Form Schema, validate a response) so the published artifact itself is proven in Chromium; requires `pnpm build` first (Turbo `dependsOn` from T003) (proves AC: AC1, artifact part; AC28) — `packages/schema/test/browser/dist-smoke.test.ts`
- [x] T036 [P] Add the changeset (`@songnoi/schema` minor: Form Schema v1, field API, nine built-ins) and update the standards doc — Commands table and Testing section: `pnpm test:browser` and the browser parity rule (Node and Chromium) — `.changeset/field-core-schema-v1.md`, `docs/standards.md`
- [x] T037 [main session] Add `pnpm test:browser` to the Commands list (agents cannot write this file) — `CLAUDE.md`
- [x] T038 [main session] Add `pnpm test:browser` to the permission allow-list (agents cannot write this file) — `.claude/settings.json`
- [x] T039 Run the full proof and record the result in the commit message (proves AC: AC28; AC2): `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:browser` with `PLAYWRIGHT_CHROMIUM_PATH` set; every AC1–AC29 row of the plan's Proof table is green in the engines it names; set any ADR/plan divergence right in the same commit — repo root

## Coverage

N = Node project, C = Chromium project. Shared tests run in both.

| AC   | Tasks                                    |
| ---- | ---------------------------------------- |
| AC1  | T017, T035                               |
| AC2  | T034, T039                               |
| AC3  | T008, T017                               |
| AC4  | T009, T012                               |
| AC5  | T009                                     |
| AC6  | T009, T016, T017, T020, T022, T024, T032 |
| AC7  | T009, T016, T017, T020, T022, T024, T032 |
| AC8  | T005, T014, and every failure test       |
| AC9  | T012, T017, T020, T022, T024, T032       |
| AC10 | T012, T016, T017, T020, T022, T024, T032 |
| AC11 | T012                                     |
| AC12 | T014, T016, T017, T020, T022, T024, T032 |
| AC13 | T014, T016, T020, T024, T032             |
| AC14 | T014                                     |
| AC15 | T016                                     |
| AC16 | T017                                     |
| AC17 | T017                                     |
| AC18 | T020                                     |
| AC19 | T020                                     |
| AC20 | T020                                     |
| AC21 | T022                                     |
| AC22 | T022                                     |
| AC23 | T022, T023                               |
| AC24 | T024                                     |
| AC25 | T028                                     |
| AC26 | T029                                     |
| AC27 | T029                                     |
| AC28 | T002, T004, T035, T039                   |
| AC29 | T017, T029                               |

Where the rows are asserted (each assertion has one owner; no row is written twice):

- **AC1:** the registry flow in `exit-check.test.ts` (T017, N and C); the built artifact in Chromium
  (T035).
- **AC6, AC7:** the 35 pairs and the `none` fixture in T009; each built-in family in its own test
  task before its implementation (T016, T017, T020, T022, T024); T032 is the cross-check over
  `builtInFields` (order, the four groupable types, the stored-value list), not a second hand-written
  copy of the family rows.
- **AC8:** the catalogue, the Zod mapping and `customIssue` in T005; a plugin rule raising a code
  outside the catalogue, driven through `validateResponse`, in T014; every other failure test
  parses its issues with strict `issueSchema` through the T005 helper.
- **AC9:** fixture parse in T012; each built-in default and its re-parse-equal row is asserted once,
  by its family test (rating `max` / `icon` and number `integer` in T017, `allowOther` in T020,
  `includeTime` in T022, `maxFiles` in T024); T032 is the cross-check loop over all nine, not a
  second copy of those rows.
- **AC10:** `fieldId` and schema rows in T012; text, number and rating config rows in T016 and T017;
  option-ID rows and option config rows in T020 (moved from T012, F01); one unknown-config-key row per
  family in T016, T017, T020, T022, T024; T032 loops the same row over all nine.
- **AC12:** fixture rows, the throwing test-local plugin and the missing-registry-type row in T014;
  the hostile corpus once per family (T016, T017, T020, T022, T024); T032 runs it over all nine.
- **AC13:** absent, `null` and unknown keys in T014; blank text in T016, empty selection in T020,
  empty file list in T024; T032 is one loop over the nine, not a repeat of those rows.
- **AC16:** also the plain-decimal rows, the power-of-ten sweep and the seeded 10,000-double sweep
  (T017). **AC18:** option-entry extra key and checkbox limit rows (T020). **AC19:** the
  `"other": null` rows (T020). **AC20:** cell order and the "Other" cell rule (T020). **AC21:** the
  date-only year range (T022). **AC22:** fraction digits and the UTC year range (T022). **AC23:** the
  seconds-offset cell row (T022). **AC24:** `allowedTypes: []` (T024). **AC26:** the history-input
  rows (T029). **AC29:** the rating rule's direct rows (`max` change gives `["max"]`, `icon`-only
  gives `[]`) in T017 before T019 implements it; the version-history rows in T029.

Requirements: R1–R3 (T010, T011, T025), R4 (T006), R5–R7 (T013), R8–R9 (T015), R10 (T018), R11–R12
(T019), R13–R14 (T021), R15–R16 (T025, T026), R17 (T027), R18 (T030), R19 (T031), R20 (T001, T004,
T033, T034). Every requirement has an implementing task. Every implementing task in Phases 2–10 is
preceded by the test task that proves it (T005 before T006; T007–T009 before T010–T011; T012 before
T013; T014 before T015; T016 before T018; T017 before T019 (including the rating
answer-compatibility rule, AC29 rating part); T020 before T021; T022 before T025 and
T026; T024 before T027; T028 before T030; T029 before T031; T032 before T033); the Phase 1 tooling
tasks (T001, T003, T004) are proven by T002's exit check and by T039.

## Dependencies

Phase order: 1 Setup -> 2 Foundational -> 3 US1 -> 4 US2 -> 5 US3 -> 6 US4 -> 7 US5 -> 8 US6 ->
9 US7 -> 10 Polish. P1 stories (US1-US3) first, then P2 (US4-US6, US number order), then P3 (US7).

Notable edges:

- **T002 (spike) gates every browser proof.** Nothing from Phase 2 on may be merged until T002 shows
  the smoke test passing in both engines (or the plan's fallback has replaced it). T016, T028, T035
  and T039 depend on it for AC15, AC25 and AC28.
- T001 -> T002 (dependencies before configs) and T001 -> T003 (script name).
- T005 (helper) -> every later test task, because failure assertions use `expectIssues`. T005 -> T006.
  T005 also deletes T002's `smoke.test.ts`.
- T006 -> T010 -> T011 -> T013 -> T015: core types and issues, then definitions, registry, schema,
  response. T007 (fixtures) -> T008, T009, T012, T014, T029.
- **T014 creates `test/fixtures/hostile-json.ts`**, so T014 -> T016, T017, T020, T022, T024 and T032
  (each family test and the cross-check reuse the corpus).
- T020 needs `parseFormSchema` (T013) and `idSchema` (T013) for its option-ID rows; T021 imports
  `idSchema` through `src/api.ts`.
- T018 (adds `countGraphemes` and the shared text builder), T019, T021, T026, T027 each depend only
  on `src/api.ts` (T011, plus T013 for `parseFormSchema`-based tests) and `zod`, except T026, which
  also depends on T025 (`parseCellOptions`; T010 owns the `CellOptions` type); they do not depend on each other. T017's `exit-check.test.ts` goes green only after T019 (`ratingField`).
- T010 -> T025 (T010 creates `cell-options.ts` with the `CellOptions` type, T025 adds
  `parseCellOptions` to it); T025 -> T026 (`date` uses `parseCellOptions`); T022 -> T023 (shared case table).
- T028 -> T030; T029 -> T031. T029's rows need `ratingField`, `numberField`, option fields,
  `dateField`, `fileField` and the fixtures, so it needs T019, T021, T026, T027 and T007: US7 runs after
  US4-US6. (If the 40-task limit ever forces the 001b split, US7 runs right after US4 and these rows
  move to 001b with US5 and US6.)
- Edits to `src/api.ts` and `test/public-api.test.ts` are sequential by phase order, never parallel:
  T011, T013, T015, T018, T025, T030, T031, then T033 (`public-api.test.ts` only, plus the barrel).
- **T032 (test first) -> T033:** T032 imports `builtInFields` from the barrel and goes green only when
  T033 exists. T033 needs all nine definitions (T018, T019, T021, T026, T027). T034 and T035 need a
  build of T033's barrel. T039 needs everything, including T037 and T038 only for the Commands line,
  not for the proof itself.
- T037 and T038 are main-session tasks: the caller edits `CLAUDE.md` and `.claude/settings.json`;
  agents do not.

## Parallel opportunities

- Phase 1: T003 (root, Turbo, CI) and T004 (ESLint) run alongside T002 once T001 is done; they touch
  different files.
- Phase 3: T008 (type tests) and T009 (runtime tests) run in parallel after T007.
- Phase 6: T016 (text-family tests) and T017 (number, rating and exit-check tests) share no file and
  both need only T014's corpus, so they can be written in parallel (T017 carries `[P]`). Once their
  tests exist, T018 and T019 can be built in parallel (T019 carries `[P]`): different field files,
  both only on the public API. T018 edits `api.ts` and `public-api.test.ts`, which T019 does not touch.
- Phase 8: T022 and T024 (date and file tests) can be written in parallel; T027 (file implementation)
  follows T024 and is independent of the date work; T026 follows T025 and can be built in parallel with
  T027. T025 edits `api.ts`, so it is not parallel with another `api.ts` edit.
- Phase 9: T028 and T029 (tests) in parallel; T030 and T031 are not parallel (both edit `api.ts` and
  `public-api.test.ts`).
- Phase 10: T034, T035 and T036 in parallel after T033; T037 and T038 (main session) can happen at any
  point after the plan's approval, since they do not depend on code.
- Across stories: after Phase 5, US4, US5 and US6 are independent of each other and could be built in
  parallel by separate developers; only their `src/api.ts` / `fields/index.ts` and pinned-export
  edits must be merged in order.

## Convergence 1

Source: `/converge` audit at f30054f (2026-11-06): one MEDIUM finding (M1), no CRITICAL/HIGH.

- [x] T040 Write failing tests for the three misbehaving-plugin cases (an `incompatibleChanges` rule returning non-strings, a rule returning a non-array such as `"max"`, and a config-dependent `storeAs.pick` returning a kind outside its declared `kinds`), then make `checkVersionHistory` / `storeAsOf` refuse them so no non-catalogue or silently wrong result leaves the package; throw a `TypeError` like other plugin faults (R8: a broken plugin must be loud), record the rule in plan.md Revisions and close the "Open for review" note (closes: M1) — `packages/schema/src/core/version-history.ts`, `packages/schema/src/core/define-field.ts`, `packages/schema/test/version-history.test.ts`, `packages/schema/test/define-field.test.ts`, `docs/work/001-field-core/plan.md`

## Convergence 2

Source: `/converge` audit at 62a2451 (2026-11-06): M1 and L2–L4 resolved; one new MEDIUM (M2), no CRITICAL/HIGH.

- [x] T041 Write tests for the config-property rule of T040 in `checkVersionHistory`: a test-local plugin whose config has an optional key without a default (e.g. `z.strictObject({ max: z.int().default(5), limit: z.int().optional() })`), with a rule that names that key unconditionally while neither parsed config holds it, gives `field_config_incompatible` naming it and no `TypeError`; the same rule on a refined config (`.superRefine`) behaves the same; a plugin whose config schema has no `shape` (e.g. a `.transform` or `.pipe` config) accepts a name only when one of the two parsed configs holds it as an own key, and throws a `TypeError` otherwise; an inherited name (`toString`, `__proto__`) never counts. Each row must fail with the `isShapeKey` clause removed, as plan.md "convergence 1 — T040" states (closes: M2) — `packages/schema/test/version-history.test.ts`

## Convergence 3

Source: `/converge` audit at b894856 (2026-11-06): M2, L1, L5, L6 resolved; one new MEDIUM (M3: clauses the 2026-11-06 spec sync wrote into R14–R16 and R19 have no test), no CRITICAL/HIGH.

- [x] T042 Add tests for the option and date rules the 2026-11-06 spec sync wrote into R14–R16 and Limits: a checkbox with `maxSelections: 1` and the same option ID twice gives `duplicate` at the repeat and `too_many {max: 1}`; with "Other" off, `{ optionIds: ["other"] }` with no `other`, with `other: ""` and with `other: null` gives only `unknown_option {optionId: "other"}` for choice, dropdown and checkbox; the date-time answer `0000-12-31T23:30-01:00` normalises to `0001-01-01T00:30:00.000Z`; the cell for `9999-12-31T23:30:00.000Z` with `Asia/Bangkok` is `+010000-01-01T06:30:00.000+07:00` (closes: M3.1–M3.4) — `packages/schema/test/fields/options.test.ts`, `packages/schema/test/fixtures/date-cases.ts`
- [x] T043 Add version-history tests for when R19 looks up the registry: a candidate field whose `fieldId` is in no earlier version and whose type the registry lacks gives `{ ok: true }`; a field that has the candidate's unregistered type in v2 and a different type in v1 gives exactly one `unknown_field_type` at `["fields", i, "type"]` and no `field_type_changed` for v1 (closes: M3.5) — `packages/schema/test/version-history.test.ts`

## Convergence 4

Source: `/converge` audit at de87c22 (2026-11-06): M3 resolved; one new MEDIUM (M4: the Limits sentence "an expanded-year string is not a valid answer" has no date-time test), no CRITICAL/HIGH.

- [x] T044 Add date-time answer rows that `+010000-01-01T06:30:00.000+07:00` (the Bangkok expanded-year cell) and `+002026-11-04T10:30Z` give `invalid_date`; in the AC23 round-trip, replace the `continue` for expanded-year cells with an assertion that feeding the cell back gives `invalid_date` (closes: M4) — `packages/schema/test/fixtures/date-cases.ts`, `packages/schema/test/fields/date.test.ts`
