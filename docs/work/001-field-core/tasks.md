# 001 — Field core: tasks

Inputs: [spec.md](./spec.md) (US1–US7, R1–R20, AC1–AC29), [plan.md](./plan.md) (approved
2026-11-05, incl. Zod as a peer dependency, ADR 0012, `pnpm test:browser` and the CI reorder).
All paths are relative to the repo root. 39 tasks (limit 40, ADR 0006).

Conventions for every task:

- Tests are written first and must fail for the right reason before the implementation task that
  follows them. A test task names the criterion it proves.
- Shared tests (`test/**/*.test.ts` outside `test/node/` and `test/browser/`) run in both engines:
  `pnpm test` (Node) and `pnpm test:browser` (Chromium, with `PLAYWRIGHT_CHROMIUM_PATH`
  set). They must not skip by environment.
- Every failure assertion goes through `test/helpers/issues.ts` (T005), which also parses the issues
  with the strict `issueSchema`; that is how each test task also serves AC8 for its own failure
  cases.
- Every implementation task that adds a runtime export to `src/api.ts` or `src/fields/index.ts`
  extends the pinned list in `test/public-api.test.ts` (created in T009) in the same commit.
- Fields in `src/fields/**` import only `src/api.ts` and `zod` (constitution 2, ESLint from T004).
- Each phase ends green on `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm test:browser`; if the build diverges from `plan.md` or this file, update them in the same
  commit (constitution 18).

## Phase 1 — Setup

- [ ] T001 Add the dependencies and scripts: `zod` as peer dependency `^4.6.0` plus pinned devDependency `4.6.7`; devDependencies `@vitest/browser-playwright` 5.1.0 and `playwright` 1.64.1; script `test:browser` = `vitest run --config vitest.browser.config.ts`; regenerate the lockfile — `packages/schema/package.json`, `pnpm-lock.yaml`
- [ ] T002 SPIKE, gates every browser proof (AC15, AC25, AC28; plan Order step 1, Risk 2). Test first: write `test/browser/engine.test.ts` (asserts a real Chromium user agent and no Node `process`) and a trivial shared `test/smoke.test.ts`; `git mv` `test/dist.test.ts` to `test/node/dist.test.ts` and `test/no-react.test.ts` to `test/node/manifest.test.ts`. Then write the Node project (`env.TZ = "Pacific/Pago_Pago"`, shared plus `test/node/**`) and the Chromium project (Playwright provider, `executablePath` from `PLAYWRIGHT_CHROMIUM_PATH`, context `locale: "th-TH"`, `timezoneId: "Pacific/Kiritimati"`, shared plus `test/browser/**`). Exit: the smoke test passes under `pnpm test` and under `pnpm test:browser` with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`, and `engine.test.ts` proves real Chromium. If Vitest browser mode cannot be made to run, STOP: take the plan's Playwright-bundle fallback and update `plan.md` in the same commit before any feature code (proves AC: AC28, engine part) — `packages/schema/vitest.config.ts`, `packages/schema/vitest.browser.config.ts`, `packages/schema/test/browser/engine.test.ts`, `packages/schema/test/smoke.test.ts`, `packages/schema/test/node/dist.test.ts`, `packages/schema/test/node/manifest.test.ts`
- [ ] T003 [P] Wire the command and CI: root script `test:browser` = `turbo run test:browser`; Turbo task `test:browser` (`dependsOn: ["^build"]`) with `PLAYWRIGHT_CHROMIUM_PATH` and `PLAYWRIGHT_BROWSERS_PATH` in `globalPassThroughEnv`; package `turbo.json` makes `test:browser` also depend on the package's own `build` (dist smoke); in CI move "Install Playwright browser" before "Unit tests" and add a "Browser parity tests" step running `pnpm test:browser` — `package.json`, `turbo.json`, `packages/schema/turbo.json`, `.github/workflows/ci.yml`
- [ ] T004 [P] Add the R20 guard rails to ESLint for `packages/schema/src/**`: `no-restricted-imports` (every `node:*` and bare Node built-in, `react*`), `no-restricted-globals` (`process`, `Buffer`, `require`, `global`, `__dirname`, `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator`, `window`, `document`, `localStorage`), `no-restricted-properties` (local-time and locale APIs, `Date.parse`); a second block for `src/fields/**` repeating those patterns and adding `**/core/**` (constitution 2); require TSDoc on public exports where the rule set allows (proves AC: AC28, lint part; R20) — `eslint.config.mjs`

## Phase 2 — Foundational

- [ ] T005 Write the error-catalogue tests and the assertion helper: `expectIssues(...)` that checks code, params and path and also parses every issue with strict `issueSchema` (no `message` key); `issues.test.ts` asserts the catalogue equals R4's 29 codes with their params, every row of the Zod-to-catalogue mapping table in both the `schema` and `answer` contexts (including `reportInput` missing-vs-wrong-type), `customIssue` (unknown or malformed code becomes `invalid`), and `FieldDefinitionError.issues` with a code-only `message` (proves AC: AC8) — `packages/schema/test/helpers/issues.ts`, `packages/schema/test/issues.test.ts`
- [ ] T006 Implement `issueSchema` (discriminated union, strict `{ code, params, path }`), `Issue`, `IssueCode`, `customIssue`, the `toIssues(zodIssues, context)` mapping and result helpers (R4), plus `isPlainObject` and own-key reads with `Object.hasOwn` — `packages/schema/src/core/issues.ts`, `packages/schema/src/core/json.ts`

## Phase 3 — Define and register a field type through the public API (P1)

Goal (US1): with no built-in loaded, a fixture third-party field is defined and registered through
the public calls, its types are inferred, and bad definitions are refused.

- [ ] T007 [US1] Write the fixture plugins: `acme/signature` (own `isUnanswered`, own `incompatibleChanges` returning a named property), `acme/measure` (config-dependent `storeAs` with declared `kinds`), `acme/note` (`storeAs: "none"`); defined with the public `defineField` only (support for AC1, AC3, AC7, AC12, AC14, AC27, AC29) — `packages/schema/test/fixtures/third-party.ts`
- [ ] T008 [P] [US1] Write the type tests with `expectTypeOf`: inferred config and answer types of `acme/signature` equal the expected types (the built-in `rating` types are asserted in T017); `@ts-expect-error` on a `toCell`, a `storedValues` and an `incompatibleChanges` written for the wrong type; confirm the package `tsconfig.json` includes `test/types/*.test-d.ts` so `pnpm typecheck` checks them (proves AC: AC3) — `packages/schema/test/types/define-field.test-d.ts`, `packages/schema/tsconfig.json`
- [ ] T009 [P] [US1] Write the definition and registry tests: all 35 `summarize` x `storeAs` pairs (each misfit refused with `incompatible_analytics`, fits accepted) (proves AC: AC6, pairs part); `acme/note` gives an empty stored-value list (proves AC: AC7, `none` fixture); a registry built without built-ins accepts a third-party definition with type `text` and exports no pre-filled registry (proves AC: AC4, registry part); `duplicate_field_type`, `Text` / `my type` / `a/b/c` give `invalid_field_type`, `acme/signature` accepted (proves AC: AC5); malformed hand-built definitions give `invalid`; `public-api.test.ts` pins the runtime exports of this phase and asserts no registry object is among them (proves AC: AC4, no pre-filled registry; AC8 for definition errors) — `packages/schema/test/define-field.test.ts`, `packages/schema/test/registry.test.ts`, `packages/schema/test/public-api.test.ts`
- [ ] T010 [US1] Implement `defineField` (const-generic `type`, `NoInfer` on dependent members, frozen result with method-signature members), `storeAsOf`, `StoreAs` / `Summarize`, the fit table, the structural definition checks, `StoredValueOf`, `FieldConfig<D>` / `FieldAnswer<D>`, and `FieldDefinitionError` (R1, R2) — `packages/schema/src/core/define-field.ts`
- [ ] T011 [US1] Implement `createFieldRegistry` (re-runs the definition checks with list-index paths, `duplicate_field_type`, throws once with all issues, `get` / `types`, no global registry); add `src/api.ts` (public API without built-ins) and replace the `VERSION` placeholder in `src/index.ts` with the barrel `export * from "./api"` (R3); update `test/node/dist.test.ts` to check `defineField` instead of `VERSION` — `packages/schema/src/core/registry.ts`, `packages/schema/src/api.ts`, `packages/schema/src/index.ts`, `packages/schema/test/node/dist.test.ts`

## Phase 4 — Store a form as a validated Form Schema (P1)

Goal (US2): any stored form JSON is read through one entry point with every problem reported as a
code with a path; testable with a fixture-only registry.

- [ ] T012 [US2] Write the Form Schema tests with a fixture-only registry: valid schema parses with defaults written in (`required` false) and re-parses to an equal value, `meta.language` `TH` returns `th` (proves AC: AC9, fixture part); invalid cases with code and path — repeated `fieldId`, repeated option ID in one field (the same ID in two fields passes), option ID `other` and `fieldId` `__proto__` as `reserved_id`, `fieldId` with a space or 65 characters, unknown type, unknown property at form, meta and field level, blank title or label, language `en_US` or empty (proves AC: AC10, non-config rows); `schemaVersion` `1` accepted, missing, `0`, `2`, `"1"` give only `unsupported_schema_version` (proves AC: AC11); a registry without built-ins refuses `text` with `unknown_field_type` (proves AC: AC4, unknown-`text` part); internal migration loop driven by a fake step; non-object input gives `invalid` at `[]` — `packages/schema/test/form-schema.test.ts`
- [ ] T013 [US2] Implement the ID rules (pattern `^[A-Za-z0-9_-]{1,64}$`, reserved sets) and Form Schema v1: strict shapes, `FormSchema` types, version gate, migration loop (empty step list), `parseFormSchema` orchestration reporting every problem (unknown type skips config, config issues prefixed with `["fields", i, "config"]`, `duplicate_field_id`), language canonicalised with `Intl.getCanonicalLocales`, defaults written into the output; export `CURRENT_SCHEMA_VERSION` and `parseFormSchema` from `api.ts` (R5, R6, R7) — `packages/schema/src/core/ids.ts`, `packages/schema/src/core/form-schema.ts`, `packages/schema/src/api.ts`

## Phase 5 — Validate a whole response in one call (P1)

Goal (US3): the server decides on its own, getting normalised answers or every error grouped by
`fieldId`; testable with fixture fields only.

- [ ] T014 [US3] Write the response tests with fixture fields: valid answer set returns the normalised set, three bad fields give three `fieldId` groups, inputs `null`, `[]`, `"x"`, `1` and deeply nested garbage give a whole-set `invalid` without throwing (proves AC: AC12); absent and `null` give `required` when required and are omitted when optional, keys outside the schema including `__proto__` and `constructor` give `unknown_field` in the answer-set group and leave the other fields' results unchanged, a `fieldId` named `toString` does not read `Object.prototype`, an empty form validates `{}` (proves AC: AC13, absent / `null` / unknown-key rows); `acme/signature`'s `isUnanswered` is honoured (proves AC: AC14); re-validating the normalised set returns it unchanged — `packages/schema/test/response.test.ts`
- [ ] T015 [US3] Implement `validateResponse` (R8, R9): plain-object gate, schema-order loop with `Object.hasOwn` reads, `isUnanswered` hook before the answer schema, `reportInput` mapping to catalogue issues, unknown own keys to `unknown_field`, results built only from schema `fieldId`s, never throws on JSON input; export from `api.ts` — `packages/schema/src/core/response.ts`, `packages/schema/src/api.ts`

## Phase 6 — Built-in text, textarea, number and rating fields (P2)

Goal (US4): the four scalar built-ins, defined only through the public API, validated identically
in Node and Chromium; first usable increment for 002's text, number and rating work.

- [ ] T016 [US4] Write the text-family tests: trimming, grapheme counting with `maxLength` 1 and `minLength` 2 for `ที่`, `"  ที่  "`, `👍🏽`, `👨‍👩‍👧‍👦`, plus `สวัสดี` against `maxLength` 4 and 3, the flag `🇹🇭`, `กา` as 2, `textarea` counting `a\nb` and `a\r\nb` as 3, `text` refusing line breaks (`\n`, `\r`, U+2028, U+2029) while `textarea` keeps them, `toCell` returns trimmed text, a small canary corpus in `graphemes.test.ts`, identical expectations in Node and Chromium (proves AC: AC15); config rows via `parseFormSchema` — `minLength` > `maxLength` gives `invalid_range`, `maxLength: 0` gives `too_small` (proves AC: AC10, text config row); blank and whitespace-only text is unanswered, required gives `required` (proves AC: AC13, blank-text row) — `packages/schema/test/graphemes.test.ts`, `packages/schema/test/fields/text.test.ts`
- [ ] T017 [P] [US4] Write the number, rating and exit-check tests: `number` accepts `2.5` by default, `not_integer` with `integer`, inclusive bounds, `min` = `max` allowed, `"5"` is `invalid`, `toCell(1234.5)` is `"1234.5"` and `toCell(-0.25)` is `"-0.25"` (proves AC: AC16); `rating` defaults (`max` 5, `icon` `star`), config `max` of 1, 11 or 4.5 refused (proves AC: AC10, rating config row), answer `0`, `max + 1`, `3.5`, `toCell(4)` is `"4"` (proves AC: AC17); type tests that the inferred config and answer types of `ratingField` equal the expected types (proves AC: AC3, rating part); `exit-check.test.ts` creates one `createFieldRegistry([ratingField, acmeSignature])` through the same public call, parses a Form Schema using both and validates a response (proves AC: AC1) — `packages/schema/test/fields/number.test.ts`, `packages/schema/test/fields/rating.test.ts`, `packages/schema/test/exit-check.test.ts`, `packages/schema/test/types/define-field.test-d.ts`
- [ ] T018 [US4] Implement `countGraphemes` (lazy `Intl.Segmenter("en", { granularity: "grapheme" })`, no fallback) and export it from `api.ts`; implement the shared text builder and the `text` and `textarea` definitions (config strict, `invalid_range`, trim then count only when a limit is set, `isUnanswered` for blank text, analytics `text` / `responses` / not groupable); run `pnpm test` and `pnpm test:browser` (R10, R20) — `packages/schema/src/core/text.ts`, `packages/schema/src/fields/shared/text.ts`, `packages/schema/src/fields/text.ts`, `packages/schema/src/fields/textarea.ts`, `packages/schema/src/api.ts`
- [ ] T019 [P] [US4] Implement the `number` and `rating` definitions (`rating` groupable, `incompatibleChanges` returning `["max"]` when `max` differs, the only built-in rule) (R11, R12) — `packages/schema/src/fields/number.ts`, `packages/schema/src/fields/rating.ts`

## Phase 7 — Built-in choice, dropdown and checkbox fields with "Other" (P2)

Goal (US5): the three option fields with stable option IDs, optional "Other", checkbox min/max and
label-based cells.

- [ ] T020 [US5] Write the option-field tests: config cases — no options, blank option label, repeated option IDs, option ID `other`, `allowOther` without `otherLabel`, checkbox `minSelections` > `maxSelections` or above the selectable count, option field without `options` gives `required` (proves AC: AC18); answer cases — two IDs on `choice` / `dropdown` give `too_many` {max: 1}, `other` while "Other" is off gives `unknown_option`, `other_text_required` for missing / `""` / `"  "`, `other` text present (including `""` and `null`) without the selection is `invalid`, "Other" counted toward checkbox min / max, optional checkbox with `minSelections: 2`, unknown and repeated IDs, bare ID string / non-string `optionIds` / extra property are `invalid`, `"  TikTok "` normalised to `"TikTok"` (proves AC: AC19); empty selection `{ "optionIds": [] }` is unanswered, required gives `required` (proves AC: AC13, empty-selection row); cells with the example form's config — label, `อื่นๆ: TikTok`, `Facebook; เพื่อนแนะนำ` in config order, `เพื่อนแนะนำ; อื่นๆ: TikTok` with "Other" last, unknown ID written as itself (proves AC: AC20) — `packages/schema/test/fields/options.test.ts`
- [ ] T021 [US5] Implement the shared option builder (config with `duplicate_option_id` and `reserved_id`, strict `{ optionIds, other? }` answer with the R14 rules, `isUnanswered` for an empty selection, cells, stored values in answer order, analytics `text` / `counts` / groupable) and the `choice`, `dropdown` and `checkbox` definitions that differ only in `type`, `maxIds` and checkbox limits (R13, R14) — `packages/schema/src/fields/shared/options.ts`, `packages/schema/src/fields/choice.ts`, `packages/schema/src/fields/dropdown.ts`, `packages/schema/src/fields/checkbox.ts`

## Phase 8 — Built-in date and file fields (P2)

Goal (US6): date-only and date-time answers that mean the same in every time zone, cells in a chosen
zone, and a file field that references uploads by ID.

- [ ] T022 [US6] Write the shared date case table and the date tests: date-only `2026-11-04` unchanged, `2026-02-29` is `invalid_date`, `2028-02-29` valid, date-time while `includeTime` is false is `invalid_date`, `toCell` unchanged for no zone, `Pacific/Kiritimati` and `Pacific/Pago_Pago` (proves AC: AC21); `+07:00` conversions to UTC, `offset_required`, `T24:00` and `:60` give `invalid_date`, date-only while `includeTime` gives `invalid_date`, `storeAs` `datetime` vs `date` (proves AC: AC22); cells `…Z` with no zone, `Asia/Bangkok`, `America/New_York` `-05:00` January and `-04:00` July, `invalid_time_zone` for `Mars/Base` through `parseCellOptions`, and an offset-style zone refused (proves AC: AC23, cell part) — `packages/schema/test/fixtures/date-cases.ts`, `packages/schema/test/cell-options.test.ts`, `packages/schema/test/fields/date.test.ts`
- [ ] T023 [US6] Write the Node-only time-zone independence test: flip `process.env.TZ` between two zones, re-run the date case table, assert identical outputs (proves AC: AC23, process-time-zone part; Chromium covers it under UTC+14 and `th-TH`) — `packages/schema/test/node/time-zone-independence.test.ts`
- [ ] T024 [P] [US6] Write the file tests: defaults `maxFiles` 1, `maxFiles` 0 and a malformed MIME entry refused, `image/*` accepted, `*/*` refused, too many IDs give `too_many`, a repeated ID gives `duplicate`, an empty ID is `invalid`, `toCell` joins IDs with `; ` (proves AC: AC24); an empty file list is unanswered and required gives `required` (proves AC: AC13, empty-file-list row) — `packages/schema/test/fields/file.test.ts`
- [ ] T025 [US6] Implement `CellOptions` (branded) and `parseCellOptions` (`invalid_time_zone` for a `RangeError`, an empty string or an offset-style zone); export from `api.ts` (R1, R16) — `packages/schema/src/core/cell-options.ts`, `packages/schema/src/api.ts`
- [ ] T026 [US6] Implement UTC-only calendar parsing and zoned cells (`Intl.DateTimeFormat` `longOffset`, formatters cached per zone, no local getters, no `Date.parse`) and the `date` definition with config-dependent `storeAs` (`kinds: ["date", "datetime"]`) (R15, R16) — `packages/schema/src/fields/shared/calendar.ts`, `packages/schema/src/fields/date.ts`
- [ ] T027 [P] [US6] Implement the `file` definition (`maxFiles`, `maxSize`, `allowedTypes`, `isUnanswered` for an empty list, one `text` stored value per ID, `summarize: "count"`) (R17) — `packages/schema/src/fields/file.ts`

## Phase 9 — Keep a question's identity across versions (P3)

Goal (US7): generated IDs that are valid and unique in Node and Chromium, and a version-history
check that refuses a type, stored-kind or declared-incompatible config change under the same
`fieldId`.

- [ ] T028 [P] [US7] Write the ID tests: 100,000 `generateId()` values all match the ID rules, have the same length (12, at least 11), contain no duplicate and are never reserved; shared test so it runs in Node and in Chromium (proves AC: AC25) — `packages/schema/test/ids.test.ts`
- [ ] T029 [P] [US7] Write the version-history tests: `text` to `number` gives only `field_type_changed` {previousType, type, version}; accepted changes — label, help, required, order, kind-preserving config changes, removed field, removed field re-added compatibly (proves AC: AC26); `date` `includeTime` false to true and back gives `field_kind_changed`, label-only change passes, `acme/measure` kind flip gives `field_kind_changed` (proves AC: AC27); `rating` `max` 5 to 10, 10 to 5, removal then return with another `max` give `field_config_incompatible` {properties: ["max"], version}, `icon`-only passes, compatible changes to `number`, `choice` / `dropdown` / `checkbox`, `text` / `textarea` and `file` pass, `acme/signature`'s own rule is honoured, a third-party definition registered as `rating` without a rule accepts the same `max` change (proves AC: AC29); one issue per conflicting `fieldId`, earlier type missing from the registry gives `unknown_field_type` — `packages/schema/test/version-history.test.ts`
- [ ] T030 [US7] Implement `generateId` (9 bytes from `globalThis.crypto.getRandomValues`, 12 base64url characters, no Node import) in the existing ID module; export from `api.ts` (R18) — `packages/schema/src/core/ids.ts`, `packages/schema/src/api.ts`
- [ ] T031 [US7] Implement `checkVersionHistory` (walk earlier versions latest first, stop at the first conflict per `fieldId`; checks in order type, `storeAsOf`, `incompatibleChanges`; path `["fields", i]`; reads only the registry's definitions, no built-in special case); export from `api.ts` (R19) — `packages/schema/src/core/version-history.ts`, `packages/schema/src/api.ts`

## Phase 10 — Polish

- [ ] T032 Write the built-in table tests over all nine fields: `storeAs`, `summarize` and `groupable` equal the spec table, `date` both ways, `groupable` true for exactly `choice`, `dropdown`, `checkbox`, `rating` (proves AC: AC6, built-in part); stored values per built-in — checkbox "Other" gives `["Qm2xT8aLp0vW", "other"]` without the text, `choice` "Other" gives `["other"]`, two files give two `text` values, date-time gives one `datetime` (proves AC: AC7, built-in part); config defaults written in for rating, number, option fields, date and file and re-parse equal (proves AC: AC9, built-in part); required vs optional unanswered rows for blank text, empty selection and empty file list across the registry (proves AC: AC13, table check) — `packages/schema/test/builtins.test.ts`
- [ ] T033 Add `builtInFields` (readonly array of the nine in brief §5 order, not a registry), export the nine definitions and the array from the barrel, give every public export a TSDoc comment, and finalise the pinned list in `public-api.test.ts` (no registry among exports) (R3, R20; ADR 0007 layout) — `packages/schema/src/fields/index.ts`, `packages/schema/src/index.ts`, `packages/schema/test/public-api.test.ts`
- [ ] T034 [P] Write and update the build-artifact tests, then fix `tsdown.config.ts` only if they fail: `manifest.test.ts` asserts no `react`, `react-dom` or other UI library in `dependencies`, `peerDependencies` or `optionalDependencies`, `zod` is the only name across them, `exports` has only `.`; `build-output.test.ts` scans `dist/**/*.js` for imports other than `zod` and relative files, no Node built-in, no `process` / `Buffer` / `require`; `dist.test.ts` checks ESM and declarations (proves AC: AC2) — `packages/schema/test/node/manifest.test.ts`, `packages/schema/test/node/build-output.test.ts`, `packages/schema/test/node/dist.test.ts`, `packages/schema/tsdown.config.ts`
- [ ] T035 [P] Write the Chromium dist smoke test: import the built `dist/index.js` in the browser project and run the AC1 flow (registry from `ratingField` and a fixture third-party field, parse a Form Schema, validate a response) so the published artifact itself is proven in Chromium; requires `pnpm build` first (Turbo `dependsOn` from T003) (proves AC: AC1, artifact part; AC28) — `packages/schema/test/browser/dist-smoke.test.ts`
- [ ] T036 [P] Add the changeset (`@songnoi/schema` minor: Form Schema v1, field API, nine built-ins) and update the standards doc — Commands table and Testing section: `pnpm test:browser` and the browser parity rule (Node and Chromium) — `.changeset/field-core-schema-v1.md`, `docs/standards.md`
- [ ] T037 [main session] Add `pnpm test:browser` to the Commands list (agents cannot write this file) — `CLAUDE.md`
- [ ] T038 [main session] Add `pnpm test:browser` to the permission allow-list (agents cannot write this file) — `.claude/settings.json`
- [ ] T039 Run the full proof and record the result in the commit message (proves AC: AC28; AC2): `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:browser` with `PLAYWRIGHT_CHROMIUM_PATH` set; every AC1–AC29 row of the plan's Proof table is green in the engines it names; set any ADR/plan divergence right in the same commit — repo root

## Coverage

| AC   | Tasks                                                | AC   | Tasks                  |
| ---- | ---------------------------------------------------- | ---- | ---------------------- |
| AC1  | T017 (N, C), T035 (built artifact in C)              | AC16 | T017                   |
| AC2  | T034, T039                                           | AC17 | T017                   |
| AC3  | T008, T017                                           | AC18 | T020                   |
| AC4  | T009, T012                                           | AC19 | T020                   |
| AC5  | T009                                                 | AC20 | T020                   |
| AC6  | T009 (pairs), T032 (built-ins)                       | AC21 | T022                   |
| AC7  | T009 (`none`), T032 (built-ins)                      | AC22 | T022                   |
| AC8  | T005 (helper, catalogue), used by every failure test | AC23 | T022, T023             |
| AC9  | T012 (fixture), T032 (built-ins)                     | AC24 | T024                   |
| AC10 | T012 (schema rows), T016 and T017 (config rows)      | AC25 | T028                   |
| AC11 | T012                                                 | AC26 | T029                   |
| AC12 | T014                                                 | AC27 | T029                   |
| AC13 | T014, T016, T020, T024, T032                         | AC28 | T002, T004, T035, T039 |
| AC14 | T014                                                 | AC29 | T029                   |
| AC15 | T016                                                 |      |                        |

Requirements: R1–R3 (T010, T011, T025), R4 (T006), R5–R7 (T013), R8–R9 (T015), R10 (T018), R11–R12
(T019), R13–R14 (T021), R15–R16 (T025, T026), R17 (T027), R18 (T030), R19 (T031), R20 (T001, T004,
T033, T034). Every requirement has an implementing task and every implementing task is preceded by
the test task that proves it.

## Dependencies

Phase order: 1 Setup -> 2 Foundational -> 3 US1 -> 4 US2 -> 5 US3 -> 6 US4 -> 7 US5 -> 8 US6 ->
9 US7 -> 10 Polish. P1 stories (US1-US3) first, then P2 (US4-US6, US number order), then P3 (US7).

Notable edges:

- **T002 (spike) gates every browser proof.** Nothing from Phase 2 on may be merged until T002 shows
  the smoke test passing in both engines (or the plan's fallback has replaced it). T016, T028, T035
  and T039 depend on it for AC15, AC25 and AC28.
- T001 -> T002 (dependencies before configs) and T001 -> T003 (script name).
- T005 (helper) -> every later test task, because failure assertions use `expectIssues`. T005 -> T006.
- T006 -> T010 -> T011 -> T013 -> T015: core types and issues, then definitions, registry, schema,
  response. T007 (fixtures) -> T008, T009, T012, T014, T029.
- T018 (adds `countGraphemes` and the shared text builder), T019, T021, T026, T027 each depend only
  on `src/api.ts` (T011, plus T013 for `parseFormSchema`-based tests) and `zod`; they do not depend on
  each other. T017's `exit-check.test.ts` goes green only after T019 (`ratingField`).
- T025 -> T026 (`date` uses the `CellOptions` type); T022 -> T023 (shared case table).
- T028 -> T030; T029 -> T031. T029's rows need `ratingField`, `numberField`, option fields,
  `dateField`, `fileField` and the fixtures, so it needs T019, T021, T026, T027 and T007: US7 runs after
  US4-US6. (If the 40-task limit ever forces the 001b split, US7 runs right after US4 and these rows
  move to 001b with US5 and US6.)
- T030 and T031 both edit `src/api.ts`; T018, T015, T013 and T025 do too: edits to `api.ts` are
  sequential by phase order, not parallel.
- T033 needs all nine definitions (T018, T019, T021, T026, T027); T032 needs only the individual
  definitions. T034 and T035 need a build of T033's barrel. T039 needs everything, including T037 and
  T038 only for the Commands line, not for the proof itself.
- T037 and T038 are main-session tasks: the caller edits `CLAUDE.md` and `.claude/settings.json`;
  agents do not.

## Parallel opportunities

- Phase 1: T003 (root, Turbo, CI) and T004 (ESLint) run alongside T002 once T001 is done; they touch
  different files.
- Phase 3: T008 (type tests) and T009 (runtime tests) run in parallel after T007.
- Phase 6: T016 and T017 are independent test files, but T017 is marked parallel because it shares no
  file with T016; T018 and T019 run in parallel (different fields, both only on the public API).
- Phase 8: T024 (file tests) and T027 (file implementation) are independent of the date work; T022 and
  T024 can be written in parallel, and T026 and T027 can be built in parallel after T025.
- Phase 9: T028 and T029 (tests) in parallel; T030 and T031 are not parallel (both edit `api.ts`).
- Phase 10: T034, T035 and T036 in parallel; T037 and T038 (main session) can happen at any point
  after the plan's approval, since they do not depend on code.
- Across stories: after Phase 5, US4, US5 and US6 are independent of each other and could be built in
  parallel by separate developers; only their `src/api.ts` / `fields/index.ts` and pinned-export
  edits must be merged in order.
