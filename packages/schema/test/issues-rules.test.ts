import { describe, expect, it } from "vitest"
import * as z from "zod"
import {
  failure,
  FieldDefinitionError,
  type Issue,
  prefixIssues,
  toIssues,
} from "../src/core/issues"
import { hasOwnKey, isPlainObject, readOwn } from "../src/core/json"
import { expectIssues } from "./helpers/issues"

// T006 — rules the T005 tests left open, decided in implementation and recorded in plan.md
// ("Zod → catalogue mapping", implementation rules), plus the small json and result helpers.
// Shared test: runs in Node and in Chromium.

function zodIssues(schema: z.ZodType, input: unknown, reportInput: boolean) {
  const result = schema.safeParse(input, { reportInput })
  expect(result.success).toBe(false)
  return result.success ? [] : result.error.issues
}

describe("AC8: mapping rules decided in T006", () => {
  it("AC8: a missing value for an int schema follows the missing rule", () => {
    const issues = zodIssues(z.strictObject({ max: z.int() }), {}, true)
    expectIssues(toIssues(issues, "schema"), [{ code: "required", params: {}, path: ["max"] }])
    expectIssues(toIssues(issues, "answer"), [{ code: "invalid", params: {}, path: ["max"] }])
  })

  it("AC8: an exclusive bound maps to `invalid` (catalogue limits are inclusive)", () => {
    for (const schema of [z.number().gt(0), z.number().positive(), z.number().lt(0)]) {
      for (const input of [0, -1, 1]) {
        const result = schema.safeParse(input, { reportInput: true })
        if (result.success) continue
        expectIssues(toIssues(result.error.issues, "schema"), [
          { code: "invalid", params: {}, path: [] },
        ])
      }
    }
  })

  it("AC8: an inclusive bound on another origin (bigint, date) maps to `invalid`", () => {
    const bigint = zodIssues(z.bigint().min(2n), 1n, true)
    expectIssues(toIssues(bigint, "answer"), [{ code: "invalid", params: {}, path: [] }])
    const date = zodIssues(z.date().max(new Date(0)), new Date(1), true)
    expectIssues(toIssues(date, "answer"), [{ code: "invalid", params: {}, path: [] }])
  })

  it("AC8: without `reportInput`, a missing value is never `required` (falls back to `invalid`)", () => {
    const issues = zodIssues(z.strictObject({ title: z.string() }), {}, false)
    expectIssues(toIssues(issues, "schema"), [{ code: "invalid", params: {}, path: ["title"] }])
  })
})

describe("AC8: FieldDefinitionError message format", () => {
  it('AC8: joins codes with ", " and keeps repeats', () => {
    const issue: Issue = {
      code: "duplicate_field_type",
      params: { type: "text" },
      path: [1, "type"],
    }
    const error = new FieldDefinitionError([
      issue,
      issue,
      { code: "invalid", params: {}, path: [] },
    ])
    expect(error.message).toBe("duplicate_field_type, duplicate_field_type, invalid")
    expect(error.name).toBe("FieldDefinitionError")
  })
})

describe("result helpers", () => {
  it("prefixIssues puts the prefix in front of every path without touching the input", () => {
    const issues: Issue[] = [{ code: "too_small", params: { min: 2 }, path: ["max"] }]
    expectIssues(prefixIssues(["fields", 0, "config"], issues), [
      { code: "too_small", params: { min: 2 }, path: ["fields", 0, "config", "max"] },
    ])
    expect(issues[0]?.path).toStrictEqual(["max"])
  })

  it("failure wraps issues in the `ok: false` branch", () => {
    const issues: Issue[] = [{ code: "invalid", params: {}, path: [] }]
    expect(failure(issues)).toStrictEqual({ ok: false, issues })
  })
})

describe("json helpers", () => {
  it("isPlainObject accepts JSON objects only", () => {
    for (const value of [{}, { a: 1 }, JSON.parse('{"__proto__":1}'), Object.create(null)]) {
      expect(isPlainObject(value)).toBe(true)
    }
    for (const value of [null, undefined, [], "x", 1, true, new Map(), new Date(0), () => 1]) {
      expect(isPlainObject(value)).toBe(false)
    }
    class Thing {
      readonly a = 1
    }
    expect(isPlainObject(new Thing())).toBe(false)
  })

  it("own-key reads never see Object.prototype", () => {
    const value = JSON.parse('{"a":1,"__proto__":{"x":1}}') as object
    expect(readOwn(value, "a")).toBe(1)
    expect(readOwn(value, "__proto__")).toStrictEqual({ x: 1 })
    expect(readOwn(value, "toString")).toBeUndefined()
    expect(readOwn(value, "x")).toBeUndefined()
    expect(hasOwnKey(value, "toString")).toBe(false)
    expect(hasOwnKey(value, "__proto__")).toBe(true)
  })
})
