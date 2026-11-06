import { describe, expect, it } from "vitest"
import * as z from "zod"
import type * as Barrel from "../../src/index"

// T035 — the published artifact runs the AC1 flow in Chromium (spec AC1 artifact part, AC28; plan
// "Running the same tests in Node and in Chromium", Proof AC1). This file imports the **built**
// `dist/index.js` — never `src` — and repeats `test/exit-check.test.ts` against it: one registry
// from the built `ratingField` and a third-party field defined right here with the built
// `defineField` and `zod`, a Form Schema using both, and a response to it. Requires
// `pnpm --filter @songnoi/schema build` first (Turbo: `test:browser` depends on the package's own
// `build`). Chromium-only: lives in `test/browser/`.
//
// The module is loaded with a dynamic `import()` of a URL computed from this file, so Vite serves
// the real build output (rewriting only its bare `zod` import), and `pnpm typecheck` does not need
// a build to exist. The `import type` of the barrel only borrows its types for `Built`; it is
// erased at runtime and loads no `src` code. The fixture field cannot reuse
// `test/fixtures/third-party.ts` or `test/helpers/issues.ts`, since both import `src`; issues are
// checked with the built strict `issueSchema` instead.

type Built = typeof Barrel

const distUrl = new URL("../../dist/index.js", import.meta.url)

async function loadDist(): Promise<Built> {
  return (await import(/* @vite-ignore */ distUrl.href)) as Built
}

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

// `acme/signature` (scoped type), defined in test code with the built public API only.
async function setUp() {
  const dist = await loadDist()
  const acmeSignature = dist.defineField({
    type: "acme/signature",
    config: z.strictObject({
      format: z.enum(["svg", "png"]).default("svg"),
      maxStrokes: z.int().min(1).max(500).default(50),
    }),
    answer: (config) =>
      z.strictObject({ strokes: z.array(z.string().min(1)).min(1).max(config.maxStrokes) }),
    isUnanswered: (value) =>
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.keys(value).length === 1 &&
      Array.isArray((value as { strokes?: unknown }).strokes) &&
      (value as { strokes: unknown[] }).strokes.length === 0,
    toCell: (answer, config) => `${config.format}: ${answer.strokes.length}`,
    storedValues: (answer) => [answer.strokes.join(" ")],
    analytics: { storeAs: "text", summarize: "count", groupable: false },
  })
  const registry = dist.createFieldRegistry([dist.ratingField, acmeSignature])
  return { dist, acmeSignature, registry }
}

/** Every issue parses with the built strict catalogue schema and carries no message. */
function expectCatalogue(dist: Built, issues: readonly unknown[]): void {
  for (const issue of issues) {
    expect(dist.issueSchema.parse(issue)).toStrictEqual(issue)
  }
}

describe("AC1 the built dist/index.js runs the exit check in Chromium", () => {
  it("is loaded from the build output, in a real browser", async () => {
    expect(distUrl.pathname).toMatch(/\/dist\/index\.js$/)
    expect(navigator.userAgent).toMatch(/Chrome|HeadlessChrome/)
    expect(typeof (await loadDist()).defineField).toBe("function")
  })

  it("AC1 one registry holds the built rating and the fixture third-party field", async () => {
    const { dist, acmeSignature, registry } = await setUp()
    expect([...registry.types].sort()).toEqual(["acme/signature", "rating"])
    expect(registry.get("rating")).toBe(dist.ratingField)
    expect(registry.get("acme/signature")).toBe(acmeSignature)
  })

  it("AC1 a Form Schema using both parses with defaults written in, and re-parses equal", async () => {
    const { dist, registry } = await setUp()
    const result = dist.parseFormSchema(candidate, registry)
    if (!result.ok) return expect.fail(`expected a valid schema, got ${JSON.stringify(result)}`)
    expect(result.schema.fields.map(({ type }) => type)).toEqual(["rating", "acme/signature"])
    expect(result.schema.fields[0]?.config).toStrictEqual({ max: 5, icon: "star" })
    expect(result.schema.fields[1]?.config).toStrictEqual({ format: "svg", maxStrokes: 50 })
    expect(dist.parseFormSchema(result.schema, registry)).toStrictEqual(result)
  })

  it("AC1 a response to it validates, and both fields give their cells", async () => {
    const { dist, registry } = await setUp()
    const parsed = dist.parseFormSchema(candidate, registry)
    if (!parsed.ok) return expect.fail("the exit-check schema must parse")
    const answers = { [RATING_ID]: 4, [SIGNATURE_ID]: { strokes: ["M0 0 L10 10"] } }

    const result = dist.validateResponse(parsed.schema, answers, registry)
    if (!result.ok) return expect.fail(`expected ok, got ${JSON.stringify(result)}`)
    expect(result.answers).toStrictEqual(answers)

    const cells = parsed.schema.fields.map((field) => {
      const definition = registry.get(field.type)
      if (definition === undefined) return expect.fail(`${field.type} is registered`)
      return definition.toCell(result.answers[field.fieldId], field.config)
    })
    expect(cells).toEqual(["4", "svg: 1"])
  })

  it("AC1 a bad response is refused per field with catalogue issues", async () => {
    const { dist, registry } = await setUp()
    const parsed = dist.parseFormSchema(candidate, registry)
    if (!parsed.ok) return expect.fail("the exit-check schema must parse")
    const result = dist.validateResponse(
      parsed.schema,
      { [RATING_ID]: 6, [SIGNATURE_ID]: { strokes: [] } },
      registry,
    )
    if (result.ok) return expect.fail("expected a failure")
    expect(result.answerSet).toEqual([])
    expect(result.fields).toStrictEqual({
      [RATING_ID]: [{ code: "too_big", params: { max: 5 }, path: [] }],
      [SIGNATURE_ID]: [{ code: "required", params: {}, path: [] }],
    })
    expectCatalogue(dist, [
      ...(result.fields[RATING_ID] ?? []),
      ...(result.fields[SIGNATURE_ID] ?? []),
    ])
  })
})
