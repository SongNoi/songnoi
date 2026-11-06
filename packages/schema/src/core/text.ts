// Text length (spec R10, R20; ADR 0012 decision 3; plan "Text length: grapheme clusters without a
// dependency"). A length is the number of extended grapheme clusters (UAX #29), counted by the
// engine's `Intl.Segmenter`, so Node and the browser accept exactly the same answers.

// Created on first use, so importing the package never fails on an engine without
// `Intl.Segmenter`. The locale is explicit, never the environment's (R20); ICU's grapheme rules
// have no locale tailoring, so it does not change counts. There is deliberately no fallback: a
// different counter would make browser and server disagree.
let segmenter: Intl.Segmenter | undefined

/**
 * The number of user-perceived characters (extended grapheme clusters, UAX #29) in `text`, counted
 * exactly as given (no trimming). `ที่`, `👍🏽`, `👨‍👩‍👧‍👦`, `🇹🇭` and `\r\n` each count 1.
 *
 * @throws when the engine has no `Intl.Segmenter` (the package's baseline requires it).
 */
export function countGraphemes(text: string): number {
  segmenter ??= new Intl.Segmenter("en", { granularity: "grapheme" })
  let count = 0
  const segments = segmenter.segment(text)[Symbol.iterator]()
  while (segments.next().done !== true) count += 1
  return count
}
