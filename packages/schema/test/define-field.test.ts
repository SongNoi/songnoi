import { describe, expect, it } from "vitest"
import * as z from "zod"
import {
  defineField,
  type FieldDefinition,
  FieldDefinitionError,
  type StoreAs,
  storeAsOf,
  type Summarize,
} from "../src/api"
import type { Issue } from "../src/core/issues"
import { acmeMeasure, acmeNote, acmeSignature } from "./fixtures/third-party"
import { expectIssues, parseIssues } from "./helpers/issues"

// T009 — `defineField` checks and analytics data (spec R1–R3; AC5, AC6 pairs part, AC7 `none`
// fixture, AC8 for definition errors). Only the public API (`src/api.ts`) is used; no built-in is
// loaded. Shared test: runs in Node and in Chromium; reads no locale, time zone or environment.

// R2's closed sets and fit rule, written out as the oracle (not imported from the package).
const STORE_AS = ["text", "number", "date", "datetime", "none"] as const satisfies StoreAs[]
const SUMMARIZE = [
  "responses",
  "counts",
  "histogram+stats",
  "distribution+avg",
  "timeline",
  "count",
  "none",
] as const satisfies Summarize[]
type StoreAsName = (typeof STORE_AS)[number]
type SummarizeName = (typeof SUMMARIZE)[number]

const FITS: Record<SummarizeName, readonly StoreAsName[]> = {
  responses: ["text"],
  counts: ["text"],
  "histogram+stats": ["number"],
  "distribution+avg": ["number"],
  timeline: ["date", "datetime"],
  count: ["text", "number", "date", "datetime"],
  none: ["none"],
}

const PAIRS = SUMMARIZE.flatMap((summarize) =>
  STORE_AS.map((storeAs) => ({ summarize, storeAs, fits: FITS[summarize].includes(storeAs) })),
)

/** Runs `run`, asserts it throws a `FieldDefinitionError`, and returns its issues. */
function thrownIssues(run: () => unknown): readonly Issue[] {
  let thrown: unknown
  try {
    run()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(FieldDefinitionError)
  return (thrown as FieldDefinitionError).issues
}

function pairDefinition(storeAs: StoreAsName, summarize: SummarizeName) {
  return defineField({
    type: "acme/pair",
    config: z.strictObject({}),
    answer: () => z.string(),
    toCell: (answer) => answer,
    storedValues: () => [],
    analytics: { storeAs, summarize, groupable: false },
  })
}

// A JavaScript caller can pass anything; these tests do, on purpose.
const defineUntyped = defineField as unknown as (input: unknown) => FieldDefinition

/** A structurally valid plain input, rebuilt for each row so rows cannot affect each other. */
function validInput(): Record<string, unknown> {
  return {
    type: "acme/probe",
    config: z.strictObject({}),
    answer: () => z.string(),
    toCell: (answer: string) => answer,
    storedValues: (answer: string) => [answer],
    analytics: { storeAs: "text", summarize: "responses", groupable: false },
  }
}

function withAnalytics(analytics: Record<string, unknown>): Record<string, unknown> {
  return {
    ...validInput(),
    analytics: { storeAs: "text", summarize: "responses", groupable: false, ...analytics },
  }
}

function without(key: string): Record<string, unknown> {
  const input = validInput()
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- builds a malformed input
  delete input[key]
  return input
}

describe("AC6: summarize x storeAs pairs (R2 fit rule)", () => {
  it("the oracle covers all 35 pairs, 11 of which fit", () => {
    expect(PAIRS).toHaveLength(35)
    expect(PAIRS.filter((pair) => pair.fits)).toHaveLength(11)
  })

  it.each(PAIRS.filter((pair) => !pair.fits))(
    "AC6 refuses summarize $summarize with storeAs $storeAs (incompatible_analytics)",
    ({ summarize, storeAs }) => {
      expectIssues(
        thrownIssues(() => pairDefinition(storeAs, summarize)),
        [{ code: "incompatible_analytics", params: { storeAs, summarize }, path: ["analytics"] }],
      )
    },
  )

  it.each(PAIRS.filter((pair) => pair.fits))(
    "AC6 accepts summarize $summarize with storeAs $storeAs",
    ({ summarize, storeAs }) => {
      const definition = pairDefinition(storeAs, summarize)
      expect(storeAsOf(definition, {})).toBe(storeAs)
      expect(definition.analytics.summarize).toBe(summarize)
    },
  )
})

describe("AC6: a config-dependent storeAs is checked against every declared kind", () => {
  function chosenBy(kinds: readonly StoreAsName[], summarize: SummarizeName) {
    return defineField({
      type: "acme/chosen",
      config: z.strictObject({ index: z.int().min(0).default(0) }),
      answer: () => z.string(),
      toCell: (answer) => answer,
      storedValues: () => [],
      analytics: {
        storeAs: { kinds, pick: (config) => kinds[config.index] ?? "text" },
        summarize,
        groupable: false,
      },
    })
  }

  it("accepts kinds that all fit (number and text with count, as acme/measure)", () => {
    expect(() => chosenBy(["number", "text"], "count")).not.toThrow()
    expect(() => chosenBy(["date", "datetime"], "timeline")).not.toThrow()
  })

  it("refuses with one incompatible_analytics for the one misfit kind", () => {
    expectIssues(
      thrownIssues(() => chosenBy(["number", "text"], "histogram+stats")),
      [
        {
          code: "incompatible_analytics",
          params: { storeAs: "text", summarize: "histogram+stats" },
          path: ["analytics"],
        },
      ],
    )
  })

  it("refuses with one incompatible_analytics per misfit kind", () => {
    expectIssues(
      thrownIssues(() => chosenBy(["text", "number", "date", "none"], "timeline")),
      [
        {
          code: "incompatible_analytics",
          params: { storeAs: "text", summarize: "timeline" },
          path: ["analytics"],
        },
        {
          code: "incompatible_analytics",
          params: { storeAs: "number", summarize: "timeline" },
          path: ["analytics"],
        },
        {
          code: "incompatible_analytics",
          params: { storeAs: "none", summarize: "timeline" },
          path: ["analytics"],
        },
      ],
    )
  })

  it("refuses count with a kind list that includes none", () => {
    expectIssues(
      thrownIssues(() => chosenBy(["text", "none"], "count")),
      [
        {
          code: "incompatible_analytics",
          params: { storeAs: "none", summarize: "count" },
          path: ["analytics"],
        },
      ],
    )
  })
})

describe("R2: storeAsOf", () => {
  it("returns a fixed storeAs whatever the config", () => {
    expect(storeAsOf(acmeSignature, { format: "svg", maxStrokes: 50 })).toBe("text")
    expect(storeAsOf(acmeSignature, { format: "png", maxStrokes: 1 })).toBe("text")
  })

  it("returns the kind a config-dependent storeAs picks for the parsed config (acme/measure)", () => {
    expect(storeAsOf(acmeMeasure, { mode: "exact" })).toBe("number")
    expect(storeAsOf(acmeMeasure, { mode: "band" })).toBe("text")
  })

  it("returns none for a storeAs none fixture", () => {
    expect(storeAsOf(acmeNote, { text: "" })).toBe("none")
  })
})

describe("AC7: stored values", () => {
  it("AC7 a storeAs none fixture (acme/note) gives an empty stored-value list", () => {
    expect(acmeNote.storedValues(true, { text: "Please read" })).toEqual([])
    expect(acmeNote.storedValues(false, { text: "" })).toEqual([])
  })

  it("a fixture's stored values are what its storedValues rule returns", () => {
    expect(
      acmeSignature.storedValues({ strokes: ["M0 0", "L1 1"] }, { format: "svg", maxStrokes: 50 }),
    ).toEqual(["M0 0 L1 1"])
    expect(acmeMeasure.storedValues(12.5, { mode: "exact" })).toEqual([12.5])
    expect(acmeMeasure.storedValues("small", { mode: "band" })).toEqual(["small"])
  })
})

describe("R1: the returned definition", () => {
  it("is frozen", () => {
    expect(Object.isFrozen(acmeSignature)).toBe(true)
    expect(Object.isFrozen(acmeMeasure)).toBe(true)
    expect(Object.isFrozen(acmeNote)).toBe(true)
  })

  it("keeps the type, the config schema and the analytics data it was given", () => {
    expect(acmeSignature.type).toBe("acme/signature")
    expect(acmeSignature.analytics).toEqual({
      storeAs: "text",
      summarize: "count",
      groupable: false,
    })
    expect(acmeSignature.config.safeParse({})).toEqual({
      success: true,
      data: { format: "svg", maxStrokes: 50 },
    })
  })

  it("keeps every member callable with the inferred types", () => {
    const config = { format: "svg", maxStrokes: 2 } as const
    expect(acmeSignature.answer(config).safeParse({ strokes: ["a", "b"] }).success).toBe(true)
    expect(acmeSignature.answer(config).safeParse({ strokes: ["a", "b", "c"] }).success).toBe(false)
    expect(acmeSignature.toCell({ strokes: ["a", "b"] }, config)).toBe("svg: 2")
    expect(acmeSignature.isUnanswered({ strokes: [] }, config)).toBe(true)
    expect(acmeSignature.isUnanswered({ strokes: ["a"] }, config)).toBe(false)
  })

  it("P03 a provided incompatibleChanges is called directly and names the changed property", () => {
    const svg = { format: "svg", maxStrokes: 50 } as const
    expect(acmeSignature.incompatibleChanges(svg, { format: "png", maxStrokes: 50 })).toEqual([
      "format",
    ])
    expect(acmeSignature.incompatibleChanges(svg, { format: "svg", maxStrokes: 10 })).toEqual([])
  })

  it("has no compatibility or unanswered rule when none was provided", () => {
    const widened: FieldDefinition = acmeNote
    // Read through Reflect so the methods are not detached from the object (unbound-method).
    expect(Reflect.get(widened, "incompatibleChanges")).toBeUndefined()
    expect(Reflect.get(widened, "isUnanswered")).toBeUndefined()
  })
})

describe("R3: type grammar (lowercase ASCII, digits and -, one optional scope)", () => {
  it.each(["text", "rating", "my-type", "acme/signature", "a1/b-2", "x", "acme-co/sig-2"])(
    "accepts %j",
    (type) => {
      expect(defineUntyped({ ...validInput(), type }).type).toBe(type)
    },
  )

  it.each([
    "Text",
    "my type",
    "a/b/c",
    "",
    "acme/",
    "/sig",
    "a_b",
    "acme/Sig",
    "ACME/sig",
    " text",
    "text\n",
    "ที่",
    "acme.sig",
  ])("refuses %j with invalid_field_type at [type]", (type) => {
    expectIssues(
      thrownIssues(() => defineUntyped({ ...validInput(), type })),
      [{ code: "invalid_field_type", params: { type }, path: ["type"] }],
    )
  })
})

describe("AC8: malformed definitions (structural checks) give invalid at the member's path", () => {
  const rows: { name: string; input: () => Record<string, unknown>; path: Issue["path"] }[] = [
    {
      name: "config without safeParse",
      input: () => ({ ...validInput(), config: {} }),
      path: ["config"],
    },
    { name: "config null", input: () => ({ ...validInput(), config: null }), path: ["config"] },
    { name: "config missing", input: () => without("config"), path: ["config"] },
    {
      name: "answer not a function",
      input: () => ({ ...validInput(), answer: "x" }),
      path: ["answer"],
    },
    { name: "answer missing", input: () => without("answer"), path: ["answer"] },
    {
      name: "toCell not a function",
      input: () => ({ ...validInput(), toCell: null }),
      path: ["toCell"],
    },
    { name: "toCell missing", input: () => without("toCell"), path: ["toCell"] },
    {
      name: "storedValues not a function",
      input: () => ({ ...validInput(), storedValues: [] }),
      path: ["storedValues"],
    },
    { name: "storedValues missing", input: () => without("storedValues"), path: ["storedValues"] },
    {
      name: "isUnanswered given but not a function",
      input: () => ({ ...validInput(), isUnanswered: true }),
      path: ["isUnanswered"],
    },
    {
      name: "incompatibleChanges given but not a function",
      input: () => ({ ...validInput(), incompatibleChanges: ["format"] }),
      path: ["incompatibleChanges"],
    },
    { name: "analytics missing", input: () => without("analytics"), path: ["analytics"] },
    {
      name: "analytics not an object",
      input: () => ({ ...validInput(), analytics: "text" }),
      path: ["analytics"],
    },
    {
      name: "storeAs outside the closed set",
      input: () => withAnalytics({ storeAs: "boolean" }),
      path: ["analytics", "storeAs"],
    },
    {
      name: "storeAs undefined",
      input: () => withAnalytics({ storeAs: undefined }),
      path: ["analytics", "storeAs"],
    },
    {
      name: "config-dependent storeAs with empty kinds",
      input: () => withAnalytics({ storeAs: { kinds: [], pick: () => "text" } }),
      path: ["analytics", "storeAs", "kinds"],
    },
    {
      name: "config-dependent storeAs with kinds not an array",
      input: () => withAnalytics({ storeAs: { kinds: "text", pick: () => "text" } }),
      path: ["analytics", "storeAs", "kinds"],
    },
    {
      name: "config-dependent storeAs with pick not a function",
      input: () => withAnalytics({ storeAs: { kinds: ["text"], pick: "text" } }),
      path: ["analytics", "storeAs", "pick"],
    },
    {
      name: "summarize outside the closed set",
      input: () => withAnalytics({ summarize: "pie" }),
      path: ["analytics", "summarize"],
    },
    {
      name: "summarize undefined",
      input: () => withAnalytics({ summarize: undefined }),
      path: ["analytics", "summarize"],
    },
    {
      name: "groupable not a boolean",
      input: () => withAnalytics({ groupable: "yes" }),
      path: ["analytics", "groupable"],
    },
    {
      name: "groupable undefined",
      input: () => withAnalytics({ groupable: undefined }),
      path: ["analytics", "groupable"],
    },
  ]

  it.each(rows)("refuses $name with invalid", ({ input, path }) => {
    expectIssues(
      thrownIssues(() => defineUntyped(input())),
      [{ code: "invalid", params: {}, path }],
    )
  })

  it("refuses a kinds entry outside the closed set with invalid inside analytics.storeAs.kinds", () => {
    const issues = parseIssues(
      thrownIssues(() =>
        defineUntyped(withAnalytics({ storeAs: { kinds: ["text", "json"], pick: () => "text" } })),
      ),
    )
    expect(issues.length).toBeGreaterThan(0)
    for (const issue of issues) {
      expect(issue.code).toBe("invalid")
      expect(issue.path.slice(0, 3)).toEqual(["analytics", "storeAs", "kinds"])
    }
  })

  it("reports every structural problem at once", () => {
    expectIssues(
      thrownIssues(() =>
        defineUntyped({
          ...withAnalytics({ summarize: "pie" }),
          type: "Bad Type",
          toCell: null,
        }),
      ),
      [
        { code: "invalid_field_type", params: { type: "Bad Type" }, path: ["type"] },
        { code: "invalid", params: {}, path: ["toCell"] },
        { code: "invalid", params: {}, path: ["analytics", "summarize"] },
      ],
    )
  })

  it("throws a FieldDefinitionError whose message holds only the codes", () => {
    let thrown: unknown
    try {
      defineUntyped({ ...validInput(), type: "Text" })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(FieldDefinitionError)
    expect((thrown as FieldDefinitionError).message).toBe("invalid_field_type")
  })

  it("accepts any config with a safeParse method (structural check, no instanceof)", () => {
    const foreignConfig = {
      safeParse: (input: unknown) => ({ success: true as const, data: input }),
    }
    expect(() => defineUntyped({ ...validInput(), config: foreignConfig })).not.toThrow()
  })
})
