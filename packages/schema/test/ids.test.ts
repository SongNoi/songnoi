import { afterEach, describe, expect, it, vi } from "vitest"
import { generateId, idSchema } from "../src/api"
import { RESERVED_FIELD_IDS } from "../src/core/ids"

// T028 — the ID generator (spec US7, R18, R20; plan "IDs"; ADR 0012). Written before T030
// implements it. Proves:
//   AC25 — 100,000 generated IDs all pass the one ID rule (`idSchema`, R5), have the same length
//          (12, so at least 11 URL-safe characters), contain no duplicate and are never a reserved
//          value; this file is shared, so the same rows run in Node and in Chromium (a real
//          browser engine, `test/browser/engine.test.ts`);
//   R18  — the source is Web Crypto (`globalThis.crypto.getRandomValues`, available in Node and in
//          every browser; no `node:crypto`): 9 random bytes encoded as base64url, no padding, so
//          72 random bits and the whole URL-safe alphabet is used without bias.
//
// Contract assumed (plan "Public API surface", "IDs"): `generateId(): string`, exported from
// `src/api.ts` (and the barrel). Each call reads `globalThis.crypto.getRandomValues` at call time
// and passes it one `Uint8Array` of 9 bytes; the 9 bytes are encoded as 12 base64url characters
// (RFC 4648 §5: `A–Z a–z 0–9 - _`, no `=`), so known bytes give a known ID.
//
// Shared test: runs in Node and in Chromium. Reads no locale, time zone or environment.

const SAMPLE = 100_000
const ID_LENGTH = 12
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

// Reserved values anywhere an ID is used: the `fieldId`s refused with `reserved_id` (R5) and the
// option ID `other` that marks the "Other" selection (R14).
const RESERVED = ["__proto__", "constructor", "prototype", "other"] as const

describe("AC25 generateId: 100,000 IDs are valid, fixed-length, unique and never reserved", () => {
  // One sample shared by the rows below; generated once per engine.
  const ids: string[] = []
  for (let index = 0; index < SAMPLE; index += 1) ids.push(generateId())

  it("every ID is a string that passes idSchema (R5's one ID rule)", () => {
    const failing = ids.filter((id) => typeof id !== "string" || !idSchema.safeParse(id).success)
    expect(failing).toEqual([])
  })

  it(`every ID has the same length, ${ID_LENGTH} (at least 11) URL-safe characters`, () => {
    const lengths = new Set(ids.map((id) => id.length))
    expect([...lengths]).toEqual([ID_LENGTH])
    expect(ID_LENGTH).toBeGreaterThanOrEqual(11)
    const urlSafe = /^[A-Za-z0-9_-]+$/
    expect(ids.filter((id) => !urlSafe.test(id))).toEqual([])
  })

  it("no ID repeats over the sample", () => {
    expect(new Set(ids).size).toBe(SAMPLE)
  })

  it("no ID is a reserved value (fieldId reserved keys, option ID `other`)", () => {
    for (const reserved of RESERVED) expect(ids).not.toContain(reserved)
    expect(ids.filter((id) => RESERVED_FIELD_IDS.has(id))).toEqual([])
  })

  it("the whole base64url alphabet is used, each character close to 1/64 of the time", () => {
    const counts = new Map<string, number>()
    for (const id of ids) {
      for (const character of id) counts.set(character, (counts.get(character) ?? 0) + 1)
    }
    expect(counts.size).toBe(ALPHABET.length)
    for (const character of counts.keys()) expect(ALPHABET, character).toContain(character)
    // 1,200,000 characters: 18,750 expected per character, standard deviation about 135. A 10 %
    // band is about 14 standard deviations wide, so a fair source never fails it, while a
    // modulo-biased or partial alphabet does.
    const expected = (SAMPLE * ID_LENGTH) / ALPHABET.length
    for (const [character, count] of counts) {
      expect(Math.abs(count - expected), character).toBeLessThan(expected * 0.1)
    }
  })
})

describe("R18 generateId draws from Web Crypto and encodes base64url", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Replaces `globalThis.crypto.getRandomValues` for one call with fixed bytes. */
  function withBytes(bytes: readonly number[]): { id: string; requested: number[] } {
    const requested: number[] = []
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(
      <T extends ArrayBufferView>(array: T): T => {
        expect(array).toBeInstanceOf(Uint8Array)
        const target = array as unknown as Uint8Array
        requested.push(target.length)
        target.set(bytes.slice(0, target.length))
        return array
      },
    )
    return { id: generateId(), requested }
  }

  it("asks globalThis.crypto.getRandomValues for exactly 9 bytes, once per ID", () => {
    const { requested } = withBytes([0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(requested).toEqual([9])
  })

  it.each([
    { name: "all zero bits", bytes: [0, 0, 0, 0, 0, 0, 0, 0, 0], id: "AAAAAAAAAAAA" },
    { name: "bytes 0 to 8", bytes: [0, 1, 2, 3, 4, 5, 6, 7, 8], id: "AAECAwQFBgcI" },
    // Base64 "+" (62) and "/" (63) become "-" and "_" in base64url; no "=" padding.
    {
      name: "all 62s",
      bytes: [0xfb, 0xef, 0xbe, 0xfb, 0xef, 0xbe, 0xfb, 0xef, 0xbe],
      id: "------------",
    },
    {
      name: "all one bits",
      bytes: [255, 255, 255, 255, 255, 255, 255, 255, 255],
      id: "____________",
    },
  ])("$name encode to $id", ({ bytes, id }) => {
    const generated = withBytes(bytes).id
    expect(generated).toBe(id)
    expect(idSchema.safeParse(generated).success).toBe(true)
  })

  it("the ID changes with the random bytes (nothing else feeds it)", () => {
    const first = withBytes([1, 2, 3, 4, 5, 6, 7, 8, 9]).id
    vi.restoreAllMocks()
    const again = withBytes([1, 2, 3, 4, 5, 6, 7, 8, 9]).id
    vi.restoreAllMocks()
    const other = withBytes([9, 8, 7, 6, 5, 4, 3, 2, 1]).id
    expect(again).toBe(first)
    expect(other).not.toBe(first)
  })
})
