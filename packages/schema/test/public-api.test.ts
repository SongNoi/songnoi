import { describe, expect, it } from "vitest"
import * as api from "../src/index"

// T009 — the pinned runtime exports of `@songnoi/schema` (plan "Public API surface"; AC4 "no
// pre-filled registry"; R3). The surface must not grow silently: every task that adds a runtime
// export (T013, T015, T018, T025, T030, T031, T033) extends this list in the same commit. Types are
// not runtime exports; `test/types/define-field.test-d.ts` checks the public type names.
// Shared test: runs in Node and in Chromium.

// Export name -> `typeof` of its value. Phase 3 (US1): the field API without built-ins. Phase 4
// (US2, T013): `CURRENT_SCHEMA_VERSION`, `parseFormSchema`, `idSchema`. Phase 5 (US3, T015):
// `validateResponse`. Phase 6 (US4, T018): `countGraphemes` (the built-in definitions themselves
// join the barrel in T033).
const PINNED_EXPORTS: Readonly<Record<string, string>> = {
  CURRENT_SCHEMA_VERSION: "number",
  FieldDefinitionError: "function",
  countGraphemes: "function",
  createFieldRegistry: "function",
  customIssue: "function",
  defineField: "function",
  idSchema: "object",
  issueSchema: "object",
  parseFormSchema: "function",
  storeAsOf: "function",
  validateResponse: "function",
}

const exported: Readonly<Record<string, unknown>> = api

// Anything shaped like a registry (a lookup with `get` / `types`, or a Map).
function looksLikeRegistry(value: unknown): boolean {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false
  if (value instanceof Map) return true
  return "get" in value || "types" in value
}

describe("public API (src/index.ts)", () => {
  it("exports exactly the pinned runtime names", () => {
    expect(Object.keys(exported).sort()).toEqual(Object.keys(PINNED_EXPORTS).sort())
  })

  it.each(Object.entries(PINNED_EXPORTS))("%s has typeof %s", (name, kind) => {
    expect(typeof exported[name]).toBe(kind)
  })

  it("FieldDefinitionError is an Error class", () => {
    expect(new api.FieldDefinitionError([])).toBeInstanceOf(Error)
  })

  it("AC4 exports no pre-filled registry", () => {
    for (const [name, value] of Object.entries(exported)) {
      expect(looksLikeRegistry(value), name).toBe(false)
    }
  })
})
