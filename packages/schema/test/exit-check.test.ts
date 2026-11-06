import { describe, expect, it } from "vitest"
import { createFieldRegistry, parseFormSchema, ratingField, validateResponse } from "../src/index"
import { acmeSignature } from "./fixtures/third-party"
import { expectIssues } from "./helpers/issues"

// T017 — the ADR 0006 exit check of 001 (spec AC1; R1, R3, R6, R8; plan Proof AC1). One registry is
// created from the built-in `rating` and the fixture third-party `acme/signature` (scoped type,
// defined in test code with the public `defineField`) through the same public call; a Form Schema
// using both is read and a response to it is validated. The calls come from the package barrel
// (`src/index.ts`), the published entry point; `test/browser/dist-smoke.test.ts` (T035) repeats
// this flow against the built `dist/index.js`.
//
// Shared test: runs in Node and in Chromium. Reads no locale, time zone or environment.

const RATING_ID = "k3Jx9aQ2mTzL"
const SIGNATURE_ID = "Sg9-xQ2mLp0T"

const candidate = {
  schemaVersion: 1,
  meta: { title: "แบบสอบถามความพึงพอใจ", language: "th" },
  fields: [
    {
      fieldId: RATING_ID,
      type: "rating",
      label: "ให้คะแนนบริการ",
      required: true,
      config: { max: 5, icon: "star" },
    },
    { fieldId: SIGNATURE_ID, type: "acme/signature", label: "ลายเซ็นผู้ตอบ", required: true },
  ],
}

describe("AC1 exit check: a built-in and a third-party field through the same public calls", () => {
  const registry = createFieldRegistry([ratingField, acmeSignature])

  it("one registry holds both definitions, looked up by type", () => {
    expect([...registry.types].sort()).toEqual(["acme/signature", "rating"])
    expect(registry.get("rating")).toBe(ratingField)
    expect(registry.get("acme/signature")).toBe(acmeSignature)
  })

  it("a Form Schema using both parses, with every default written in", () => {
    const result = parseFormSchema(candidate, registry)
    if (!result.ok) return expect.fail(`expected a valid schema, got ${JSON.stringify(result)}`)
    expect(result.schema.fields.map(({ type }) => type)).toEqual(["rating", "acme/signature"])
    expect(result.schema.fields[0]?.config).toStrictEqual({ max: 5, icon: "star" })
    expect(result.schema.fields[1]?.config).toStrictEqual({ format: "svg", maxStrokes: 50 })
    expect(parseFormSchema(result.schema, registry)).toStrictEqual(result)
  })

  it("a response to it validates, and both fields give their cells", () => {
    const parsed = parseFormSchema(candidate, registry)
    if (!parsed.ok) return expect.fail("the exit-check schema must parse")
    const answers = { [RATING_ID]: 4, [SIGNATURE_ID]: { strokes: ["M0 0 L10 10"] } }

    const result = validateResponse(parsed.schema, answers, registry)
    if (!result.ok) return expect.fail(`expected ok, got ${JSON.stringify(result)}`)
    expect(result.answers).toStrictEqual(answers)

    const cells = parsed.schema.fields.map((field) => {
      const definition = registry.get(field.type)
      if (definition === undefined) return expect.fail(`${field.type} is registered`)
      return definition.toCell(result.answers[field.fieldId], field.config)
    })
    expect(cells).toEqual(["4", "svg: 1"])
  })

  it("a bad response is refused per field: the rating's range and the plugin's own rule", () => {
    const parsed = parseFormSchema(candidate, registry)
    if (!parsed.ok) return expect.fail("the exit-check schema must parse")
    // 6 is above max 5; an untouched pad is unanswered by acme/signature's own rule (AC14).
    const result = validateResponse(
      parsed.schema,
      { [RATING_ID]: 6, [SIGNATURE_ID]: { strokes: [] } },
      registry,
    )
    if (result.ok) return expect.fail("expected a failure")
    expectIssues(result.answerSet, [])
    expect(Object.keys(result.fields).sort()).toEqual([RATING_ID, SIGNATURE_ID].sort())
    expectIssues(result.fields[RATING_ID], [{ code: "too_big", params: { max: 5 }, path: [] }])
    expectIssues(result.fields[SIGNATURE_ID], [{ code: "required", params: {}, path: [] }])
  })
})
