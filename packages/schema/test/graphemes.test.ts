import { describe, expect, it } from "vitest"
import { countGraphemes } from "../src/api"

// T016 — `countGraphemes`, the public length rule of `text` and `textarea` (spec R10, R20, i18n
// edge cases; plan "Text length: grapheme clusters without a dependency"; ADR 0012 decision 3).
// Proves AC15 (counting part): a length is the number of extended grapheme clusters (UAX #29), not
// code points or UTF-16 units. The field rows (trimming, limits, line breaks) live in
// `test/fields/text.test.ts`.
//
// Shared test: runs in Node and in Chromium with identical expectations, which is the parity proof
// (AC15: a simulated browser inside Node does not count). Reads no locale, time zone or environment.
//
// Contract pinned here: `countGraphemes(text)` counts the string exactly as given — it does not
// trim (trimming is the field's job, before counting).

describe("AC15: countGraphemes counts user-perceived characters", () => {
  // Every case spec R10 / the i18n edge cases / AC15 name, with its code-point count for contrast.
  const rows: readonly { name: string; text: string; codePoints: number; count: number }[] = [
    { name: "Thai consonant + vowel above + tone mark ที่", text: "ที่", codePoints: 3, count: 1 },
    { name: "Thai greeting สวัสดี", text: "สวัสดี", codePoints: 6, count: 4 },
    { name: "Thai vowel beside the consonant กา", text: "กา", codePoints: 2, count: 2 },
    { name: "thumbs up + skin-tone modifier 👍🏽", text: "👍🏽", codePoints: 2, count: 1 },
    {
      name: "family emoji, four people joined by three ZWJ 👨‍👩‍👧‍👦",
      text: "👨‍👩‍👧‍👦",
      codePoints: 7,
      count: 1,
    },
    { name: "flag of Thailand 🇹🇭 (two regional indicators)", text: "🇹🇭", codePoints: 2, count: 1 },
    { name: "CRLF", text: "\r\n", codePoints: 2, count: 1 },
    { name: "a LF b", text: "a\nb", codePoints: 3, count: 3 },
    { name: "a CRLF b", text: "a\r\nb", codePoints: 4, count: 3 },
  ]

  it.each(rows)("$name counts $count", ({ text, codePoints, count }) => {
    expect(Array.from(text)).toHaveLength(codePoints)
    expect(countGraphemes(text)).toBe(count)
  })

  it("the empty string counts 0", () => {
    expect(countGraphemes("")).toBe(0)
  })

  it("counts the string as given, without trimming", () => {
    expect(countGraphemes("  ที่  ")).toBe(5)
    expect(countGraphemes("\nhi\n")).toBe(4)
  })

  it("several clusters in a row are counted one by one", () => {
    expect(countGraphemes("ที่👍🏽🇹🇭👨‍👩‍👧‍👦")).toBe(4)
    expect(countGraphemes("ที่".repeat(1000))).toBe(1000)
  })
})

// A small canary corpus (plan Risk 1): stable UAX #29 cases beyond the AC15 list. If an engine's
// Unicode data drifts, this fails in that engine first. Deliberately no Indic conjuncts (Unicode
// 15.1 changed them) and nothing whose segmentation differs between recent Unicode versions.
describe("AC15 canary corpus: stable grapheme cluster cases", () => {
  const canary: readonly { name: string; text: string; count: number }[] = [
    { name: "ASCII word", text: "hello", count: 5 },
    { name: "Thai SARA AM is a spacing mark: น้ำ", text: "น้ำ", count: 1 },
    { name: "Thai tone mark + SARA AM: ก่ำ", text: "ก่ำ", count: 1 },
    { name: "Thai leading vowel is its own character: เก", text: "เก", count: 2 },
    { name: "Thai word ภาษาไทย (no combining marks)", text: "ภาษาไทย", count: 7 },
    { name: "e + combining acute (decomposed é)", text: "e\u0301", count: 1 },
    { name: "precomposed é", text: "é", count: 1 },
    { name: "Hangul syllable from conjoining jamo", text: "\u1112\u1161\u11ab", count: 1 },
    { name: "ZWJ profession emoji with skin tone 👩🏽‍💻", text: "👩🏽‍💻", count: 1 },
    { name: "two flags 🇹🇭🇯🇵", text: "🇹🇭🇯🇵", count: 2 },
    { name: "keycap 1\ufe0f\u20e3", text: "1\ufe0f\u20e3", count: 1 },
    { name: "LF CR (not a CRLF pair)", text: "\n\r", count: 2 },
    { name: "tab", text: "\t", count: 1 },
    { name: "NEL, VT and FF are one each", text: "\u0085\u000b\u000c", count: 3 },
    { name: "LS and PS are one each", text: "\u2028\u2029", count: 2 },
    { name: "a lone surrogate counts 1", text: "\ud800", count: 1 },
  ]

  it.each(canary)("$name counts $count", ({ text, count }) => {
    expect(countGraphemes(text)).toBe(count)
  })
})
