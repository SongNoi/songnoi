import { describe, expect, it } from "vitest"
import en from "../../messages/en.json"
import th from "../../messages/th.json"

// Spec R27: a message added in one language must exist in the other.
const keys = (obj: object, prefix = ""): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  )

describe("message catalogues", () => {
  it("en and th have exactly the same keys", () => {
    expect(keys(th).sort()).toEqual(keys(en).sort())
  })

  it("no message is empty", () => {
    for (const [name, catalogue] of Object.entries({ en, th })) {
      const empty = keys(catalogue).filter((k) => {
        const value = k
          .split(".")
          .reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], catalogue)
        return typeof value !== "string" || value.trim() === ""
      })
      expect(empty, name).toEqual([])
    }
  })
})
