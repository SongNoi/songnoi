import { describe, expectTypeOf, it } from "vitest"
import * as z from "zod"
import {
  type CellOptions,
  createFieldRegistry,
  defineField,
  type FieldAnswer,
  type FieldConfig,
  type FieldDefinition,
  type FieldRegistry,
  type Issue,
  type IssueCode,
  type StoreAs,
  storeAsOf,
  type Summarize,
} from "../../src/api"
import { acmeMeasure, acmeNote, acmeSignature } from "../fixtures/third-party"

// T008 — type tests for `defineField` (AC3, R1; plan "defineField", P03).
// Proven by `pnpm typecheck` (`tsc --noEmit`; the package tsconfig includes `test`, so this file
// is compiled). Vitest does not run `*.test-d.ts` files (its include is `test/**/*.test.ts` and
// typecheck mode is off), so nothing here executes: every assertion is a compile-time check, and a
// `@ts-expect-error` that no longer has an error fails the typecheck too.
//
// The expected types are written out by hand on purpose: they are the oracle the inferred types
// are compared against, not types used by the package.

declare const unknownValue: unknown

const signatureConfig = { format: "svg", maxStrokes: 50 } as const satisfies FieldConfig<
  typeof acmeSignature
>

describe("AC3: inferred config and answer types of the fixture field", () => {
  it("acme/signature: config and answer types equal the expected types", () => {
    expectTypeOf<FieldConfig<typeof acmeSignature>>().toEqualTypeOf<{
      format: "svg" | "png"
      maxStrokes: number
    }>()
    expectTypeOf<FieldAnswer<typeof acmeSignature>>().toEqualTypeOf<{ strokes: string[] }>()
  })

  it("acme/signature keeps its literal type string (const generic)", () => {
    expectTypeOf(acmeSignature.type).toEqualTypeOf<"acme/signature">()
  })

  it("acme/measure: an answer schema chosen by config gives the union of both answers", () => {
    expectTypeOf<FieldConfig<typeof acmeMeasure>>().toEqualTypeOf<{ mode: "exact" | "band" }>()
    expectTypeOf<FieldAnswer<typeof acmeMeasure>>().toEqualTypeOf<
      number | "small" | "medium" | "large"
    >()
  })

  it("acme/note: config and answer types equal the expected types", () => {
    expectTypeOf<FieldConfig<typeof acmeNote>>().toEqualTypeOf<{ text: string }>()
    expectTypeOf<FieldAnswer<typeof acmeNote>>().toEqualTypeOf<boolean>()
  })
})

describe("AC3: every other member receives the inferred types", () => {
  type Signature = typeof acmeSignature
  type SignatureConfig = FieldConfig<Signature>
  type SignatureAnswer = FieldAnswer<Signature>

  it("answer(config) receives the parsed config", () => {
    expectTypeOf<Signature["answer"]>().parameter(0).toEqualTypeOf<SignatureConfig>()
  })

  it("toCell(answer, config, options?) receives the answer, the config and CellOptions", () => {
    expectTypeOf<Signature["toCell"]>().parameter(0).toEqualTypeOf<SignatureAnswer>()
    expectTypeOf<Signature["toCell"]>().parameter(1).toEqualTypeOf<SignatureConfig>()
    expectTypeOf<Signature["toCell"]>().parameter(2).toEqualTypeOf<CellOptions | undefined>()
    expectTypeOf<Signature["toCell"]>().returns.toEqualTypeOf<string>()
  })

  it("storedValues(answer, config) returns values of the stored kind", () => {
    expectTypeOf<Signature["storedValues"]>().parameter(0).toEqualTypeOf<SignatureAnswer>()
    expectTypeOf<Signature["storedValues"]>().parameter(1).toEqualTypeOf<SignatureConfig>()
    expectTypeOf<Signature["storedValues"]>().returns.toEqualTypeOf<readonly string[]>()
    // `acme/measure` may store `number` or `text`; `none` stores nothing.
    expectTypeOf<(typeof acmeMeasure)["storedValues"]>().returns.toEqualTypeOf<
      readonly (string | number)[]
    >()
    expectTypeOf<(typeof acmeNote)["storedValues"]>().returns.toEqualTypeOf<readonly never[]>()
  })

  it("incompatibleChanges(previous, next) receives two configs and names config properties", () => {
    expectTypeOf<Signature["incompatibleChanges"]>().parameter(0).toEqualTypeOf<SignatureConfig>()
    expectTypeOf<Signature["incompatibleChanges"]>().parameter(1).toEqualTypeOf<SignatureConfig>()
    expectTypeOf<Signature["incompatibleChanges"]>().returns.toEqualTypeOf<
      readonly ("format" | "maxStrokes")[]
    >()
  })

  it("isUnanswered(value, config) receives the raw value and the config", () => {
    expectTypeOf<Signature["isUnanswered"]>().parameter(0).toEqualTypeOf<unknown>()
    expectTypeOf<Signature["isUnanswered"]>().parameter(1).toEqualTypeOf<SignatureConfig>()
    expectTypeOf<Signature["isUnanswered"]>().returns.toEqualTypeOf<boolean>()
  })
})

describe("P03: provided optional members are non-optional on the returned definition", () => {
  it("incompatibleChanges and isUnanswered, when provided, can be called without ?. or !", () => {
    expectTypeOf<(typeof acmeSignature)["incompatibleChanges"]>().not.toBeNullable()
    expectTypeOf<(typeof acmeSignature)["isUnanswered"]>().not.toBeNullable()
    // Direct calls: these lines compile only if both members are required on the type.
    const changed = acmeSignature.incompatibleChanges(signatureConfig, {
      ...signatureConfig,
      format: "png",
    })
    expectTypeOf(changed).toEqualTypeOf<readonly ("format" | "maxStrokes")[]>()
    const blank = acmeSignature.isUnanswered(unknownValue, signatureConfig)
    expectTypeOf(blank).toEqualTypeOf<boolean>()
  })

  it("an optional member that was not provided is not on the returned definition's type", () => {
    expectTypeOf(acmeMeasure).not.toHaveProperty("incompatibleChanges")
    expectTypeOf(acmeMeasure).not.toHaveProperty("isUnanswered")
    expectTypeOf(acmeNote).not.toHaveProperty("incompatibleChanges")
    expectTypeOf(acmeNote).not.toHaveProperty("isUnanswered")
  })

  it("the widened FieldDefinition keeps both members optional, so generic code uses ?.", () => {
    const widened: FieldDefinition = acmeSignature
    expectTypeOf(widened.incompatibleChanges?.({}, {})).toEqualTypeOf<
      readonly string[] | undefined
    >()
    // @ts-expect-error -- optional on the widened type: a direct call may hit `undefined`
    widened.incompatibleChanges({}, {})
    // @ts-expect-error -- optional on the widened type: a direct call may hit `undefined`
    widened.isUnanswered(unknownValue, {})
  })
})

describe("AC3: typed definitions widen to FieldDefinition and register without casts", () => {
  it("each fixture is assignable to FieldDefinition", () => {
    expectTypeOf(acmeSignature).toExtend<FieldDefinition>()
    expectTypeOf(acmeMeasure).toExtend<FieldDefinition>()
    expectTypeOf(acmeNote).toExtend<FieldDefinition>()
  })

  it("a registry hands back widened definitions whose members accept unknown answers", () => {
    const registry = createFieldRegistry([acmeSignature, acmeMeasure, acmeNote])
    expectTypeOf(registry).toEqualTypeOf<FieldRegistry>()
    expectTypeOf(registry.types).toEqualTypeOf<readonly string[]>()
    const definition = registry.get("acme/signature")
    expectTypeOf(definition).toEqualTypeOf<FieldDefinition | undefined>()
    if (definition !== undefined) {
      expectTypeOf(definition.toCell(unknownValue, {})).toEqualTypeOf<string>()
      expectTypeOf(storeAsOf(definition, {})).toEqualTypeOf<StoreAs>()
    }
  })
})

describe("R2: StoreAs, Summarize and CellOptions", () => {
  it("StoreAs and Summarize are exactly R2's closed sets", () => {
    expectTypeOf<StoreAs>().toEqualTypeOf<"text" | "number" | "date" | "datetime" | "none">()
    expectTypeOf<Summarize>().toEqualTypeOf<
      | "responses"
      | "counts"
      | "histogram+stats"
      | "distribution+avg"
      | "timeline"
      | "count"
      | "none"
    >()
  })

  it("storeAsOf returns a StoreAs, also for a config-dependent storeAs", () => {
    expectTypeOf(storeAsOf(acmeMeasure, { mode: "band" })).toEqualTypeOf<StoreAs>()
  })

  it("CellOptions is branded: a plain object literal is not CellOptions (only validated ones)", () => {
    expectTypeOf<CellOptions>().toHaveProperty("timeZone")
    expectTypeOf<{ timeZone: string }>().not.toExtend<CellOptions>()
  })

  it("Issue and IssueCode are public types", () => {
    expectTypeOf<Issue["code"]>().toEqualTypeOf<IssueCode>()
  })
})

// AC3: a member written for the wrong type fails to compile.
//
// Positive control first: the same call shape as the negative rows, with the members annotated
// with the right types, compiles. That rules out a negative row passing only because `Answer` or
// `Config` came out as `unknown`.
//
// In each negative row the marked line must be the only error. When a call fails, TypeScript
// re-resolves the other context-sensitive members with the generics at their constraints, so those
// members are written so they compile whatever the answer type is (`() => ""`, `() => []`).
// If a wrong-typed member were accepted, the `@ts-expect-error` would be unused and the typecheck
// would fail. (These rows prove the AC3 behaviour; they do not detect whether `NoInfer` is used.)
describe("AC3: members written for the wrong type fail to compile", () => {
  const scaleConfig = z.strictObject({ max: z.int().min(2).max(10).default(5) })
  const scaleAnalytics = {
    storeAs: "number",
    summarize: "distribution+avg",
    groupable: true,
  } as const

  it("positive control: members annotated with the inferred types compile", () => {
    const scale = defineField({
      type: "acme/right-types",
      config: scaleConfig,
      answer: () => z.int().min(1),
      toCell: (answer: number, config: { max: number }) => `${answer}/${config.max}`,
      storedValues: (answer: number) => [answer],
      incompatibleChanges: (previous: { max: number }, next: { max: number }) =>
        previous.max === next.max ? [] : ["max"],
      analytics: scaleAnalytics,
    })
    expectTypeOf(scale).toExtend<FieldDefinition>()
    expectTypeOf<FieldConfig<typeof scale>>().toEqualTypeOf<{ max: number }>()
    expectTypeOf<FieldAnswer<typeof scale>>().toEqualTypeOf<number>()
  })

  it("toCell written for the wrong answer type", () => {
    defineField({
      type: "acme/wrong-cell",
      config: scaleConfig,
      answer: () => z.int().min(1),
      // @ts-expect-error -- the answer is a number; this toCell is written for a string
      toCell: (answer: string) => answer,
      storedValues: () => [],
      analytics: scaleAnalytics,
    })
  })

  it("storedValues written for the wrong answer type", () => {
    defineField({
      type: "acme/wrong-stored-answer",
      config: scaleConfig,
      answer: () => z.int().min(1),
      toCell: () => "",
      // @ts-expect-error -- the answer is a number; this rule is written for a string
      storedValues: (answer: string) => [answer.length],
      analytics: scaleAnalytics,
    })
  })

  it("storedValues returning values of the wrong stored kind", () => {
    defineField({
      type: "acme/wrong-stored-kind",
      config: scaleConfig,
      answer: () => z.int().min(1),
      toCell: () => "",
      // @ts-expect-error -- storeAs is number, so stored values must be numbers
      storedValues: () => ["5"],
      analytics: scaleAnalytics,
    })
  })

  it("storedValues returning a value for storeAs none (only [] type-checks)", () => {
    defineField({
      type: "acme/wrong-stored-none",
      config: z.strictObject({}),
      answer: () => z.boolean(),
      toCell: () => "",
      // @ts-expect-error -- storeAs none stores nothing
      storedValues: () => [true],
      analytics: { storeAs: "none", summarize: "none", groupable: false },
    })
  })

  it("incompatibleChanges written for the wrong config type", () => {
    defineField({
      type: "acme/wrong-rule-config",
      config: scaleConfig,
      answer: () => z.int().min(1),
      toCell: () => "",
      storedValues: () => [],
      // @ts-expect-error -- the config is { max }; this rule is written for { size }
      incompatibleChanges: (_previous: { size: number }, _next: { size: number }) => [],
      analytics: scaleAnalytics,
    })
  })

  it("incompatibleChanges naming a property the config does not have", () => {
    defineField({
      type: "acme/wrong-rule-key",
      config: scaleConfig,
      answer: () => z.int().min(1),
      toCell: () => "",
      storedValues: () => [],
      // @ts-expect-error -- "colour" is not a config property
      incompatibleChanges: () => ["colour"],
      analytics: scaleAnalytics,
    })
  })
})
