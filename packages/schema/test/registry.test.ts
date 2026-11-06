import { describe, expect, it } from "vitest"
import * as z from "zod"
import {
  createFieldRegistry,
  defineField,
  type FieldDefinition,
  FieldDefinitionError,
} from "../src/api"
import type { Issue } from "../src/core/issues"
import { acmeMeasure, acmeNote, acmeSignature } from "./fixtures/third-party"
import { expectIssues } from "./helpers/issues"

// T009 — `createFieldRegistry` (spec R3; AC4 registry part, AC5, AC8 for registry errors). Only the
// public API (`src/api.ts`) is used and no built-in is loaded, so every registry here is built
// "without built-ins". Shared test: runs in Node and in Chromium; reads no locale, time zone or
// environment.

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

/**
 * A hand-built copy of a definition with some members replaced: what a JavaScript caller could pass
 * without going through `defineField`, so only the registry's own checks can catch it.
 */
function handBuilt(overrides: Record<string, unknown>): FieldDefinition {
  const definition: unknown = { ...acmeSignature, ...overrides }
  return definition as FieldDefinition
}

// A third party's own `text`, defined through the public call like any plugin (AC4).
const acmeText = defineField({
  type: "text",
  config: z.strictObject({ placeholder: z.string().default("") }),
  answer: () => z.string().trim().min(1),
  toCell: (answer) => answer,
  storedValues: (answer) => [answer],
  analytics: { storeAs: "text", summarize: "responses", groupable: false },
})

describe("R3: lookup by type", () => {
  it("returns the registered definitions by type and lists their types", () => {
    const registry = createFieldRegistry([acmeSignature, acmeMeasure, acmeNote])
    expect(registry.get("acme/signature")).toBe(acmeSignature)
    expect(registry.get("acme/measure")).toBe(acmeMeasure)
    expect(registry.get("acme/note")).toBe(acmeNote)
    expect([...registry.types].sort()).toEqual(["acme/measure", "acme/note", "acme/signature"])
  })

  it.each(["text", "rating", "acme/unknown", "", "toString", "__proto__", "constructor"])(
    "returns undefined for the unregistered type %j (no inherited keys)",
    (type) => {
      const registry = createFieldRegistry([acmeSignature])
      expect(registry.get(type)).toBeUndefined()
    },
  )

  it("an empty list gives an empty registry", () => {
    const registry = createFieldRegistry([])
    expect(registry.types).toEqual([])
    expect(registry.get("text")).toBeUndefined()
  })

  it("has no global or implicit registry: each registry holds only its own list", () => {
    const first = createFieldRegistry([acmeSignature])
    const second = createFieldRegistry([acmeMeasure])
    expect(first).not.toBe(second)
    expect(first.get("acme/measure")).toBeUndefined()
    expect(second.get("acme/signature")).toBeUndefined()
    // Defining a field registers nothing anywhere.
    const unregistered = defineField({
      type: "acme/unregistered",
      config: z.strictObject({}),
      answer: () => z.string(),
      toCell: (answer) => answer,
      storedValues: (answer) => [answer],
      analytics: { storeAs: "text", summarize: "responses", groupable: false },
    })
    expect(createFieldRegistry([acmeSignature]).get(unregistered.type)).toBeUndefined()
  })
})

describe("AC4: registry without built-ins (registry part)", () => {
  it("AC4 a registry built without built-ins holds no text and no other built-in type", () => {
    const registry = createFieldRegistry([acmeSignature])
    for (const type of [
      "text",
      "textarea",
      "number",
      "choice",
      "dropdown",
      "checkbox",
      "date",
      "rating",
      "file",
    ]) {
      expect(registry.get(type)).toBeUndefined()
    }
    expect(registry.types).toEqual(["acme/signature"])
  })

  it("AC4 accepts a third-party definition with type text in place of the built-in", () => {
    const registry = createFieldRegistry([acmeText, acmeSignature])
    expect(registry.get("text")).toBe(acmeText)
    expect([...registry.types].sort()).toEqual(["acme/signature", "text"])
  })
})

describe("AC5: type rules at registry creation", () => {
  it("AC5 accepts acme/signature", () => {
    expect(createFieldRegistry([acmeSignature]).get("acme/signature")).toBe(acmeSignature)
  })

  it("AC5 refuses a duplicate type with duplicate_field_type at the repeat's index", () => {
    expectIssues(
      thrownIssues(() => createFieldRegistry([acmeSignature, acmeMeasure, acmeSignature])),
      [
        {
          code: "duplicate_field_type",
          params: { type: "acme/signature" },
          path: [2, "type"],
        },
      ],
    )
  })

  it("AC5 reports each repeat of a type", () => {
    expectIssues(
      thrownIssues(() => createFieldRegistry([acmeNote, acmeNote, acmeNote])),
      [
        { code: "duplicate_field_type", params: { type: "acme/note" }, path: [1, "type"] },
        { code: "duplicate_field_type", params: { type: "acme/note" }, path: [2, "type"] },
      ],
    )
  })

  it("AC5 refuses two distinct definitions that share a type (third-party text twice)", () => {
    const otherText = handBuilt({ type: "text" })
    expectIssues(
      thrownIssues(() => createFieldRegistry([acmeText, otherText])),
      [{ code: "duplicate_field_type", params: { type: "text" }, path: [1, "type"] }],
    )
  })

  it.each(["Text", "my type", "a/b/c"])(
    "AC5 refuses the malformed type %j with invalid_field_type at [index, type]",
    (type) => {
      expectIssues(
        thrownIssues(() => createFieldRegistry([acmeMeasure, handBuilt({ type })])),
        [{ code: "invalid_field_type", params: { type }, path: [1, "type"] }],
      )
    },
  )
})

describe("R3: the registry re-runs the definition checks on hand-built definitions", () => {
  it("refuses incompatible analytics with incompatible_analytics at [index, analytics]", () => {
    const misfit = handBuilt({
      analytics: { storeAs: "none", summarize: "responses", groupable: false },
    })
    expectIssues(
      thrownIssues(() => createFieldRegistry([misfit])),
      [
        {
          code: "incompatible_analytics",
          params: { storeAs: "none", summarize: "responses" },
          path: [0, "analytics"],
        },
      ],
    )
  })

  it("refuses malformed members with invalid at [index, ...member path]", () => {
    expectIssues(
      thrownIssues(() =>
        createFieldRegistry([
          acmeNote,
          handBuilt({ toCell: undefined }),
          handBuilt({
            type: "acme/other",
            analytics: { storeAs: "text", summarize: "pie", groupable: false },
          }),
        ]),
      ),
      [
        { code: "invalid", params: {}, path: [1, "toCell"] },
        { code: "invalid", params: {}, path: [2, "analytics", "summarize"] },
      ],
    )
  })

  it("refuses an entry that is not an object with invalid at [index]", () => {
    const list = [acmeSignature, null] as unknown as FieldDefinition[]
    expectIssues(
      thrownIssues(() => createFieldRegistry(list)),
      [{ code: "invalid", params: {}, path: [1] }],
    )
  })

  it("throws once with every issue of the list", () => {
    expectIssues(
      thrownIssues(() =>
        createFieldRegistry([
          acmeSignature,
          handBuilt({ type: "Text" }),
          acmeSignature,
          handBuilt({
            type: "acme/other",
            analytics: { storeAs: "text", summarize: "pie", groupable: false },
          }),
        ]),
      ),
      [
        { code: "invalid_field_type", params: { type: "Text" }, path: [1, "type"] },
        { code: "duplicate_field_type", params: { type: "acme/signature" }, path: [2, "type"] },
        { code: "invalid", params: {}, path: [3, "analytics", "summarize"] },
      ],
    )
  })

  it("accepts a structurally valid hand-built definition (no private marker or instanceof)", () => {
    const registry = createFieldRegistry([handBuilt({ type: "acme/hand-built" })])
    expect(registry.get("acme/hand-built")?.type).toBe("acme/hand-built")
  })
})
