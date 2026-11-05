import * as z from "zod"
import { defineField } from "../../src/api"

// T007 — fixture third-party plugins (spec US1; support for AC1, AC3, AC7, AC12, AC14, AC27,
// AC29). They live in test code, outside the built-ins, and use only the public `defineField` and
// `zod`, exactly as a plugin package would. Nothing here imports a built-in or `src/core`.

/**
 * `acme/signature`: a signature pad. Declares its own "unanswered" rule (an untouched pad sends
 * `{ "strokes": [] }`, AC14) and its own answer-compatibility rule (a `format` change makes stored
 * signatures incomparable, AC29). Config `{ format, maxStrokes }` with defaults; answer
 * `{ strokes: string[] }` with 1 … `maxStrokes` non-empty strokes.
 */
export const acmeSignature = defineField({
  type: "acme/signature",
  config: z.strictObject({
    format: z.enum(["svg", "png"]).default("svg"),
    maxStrokes: z.int().min(1).max(500).default(50),
  }),
  answer: (config) =>
    z.strictObject({ strokes: z.array(z.string().min(1)).min(1).max(config.maxStrokes) }),
  isUnanswered: (value) => isUntouchedPad(value),
  toCell: (answer, config) => `${config.format}: ${answer.strokes.length}`,
  storedValues: (answer) => [answer.strokes.join(" ")],
  incompatibleChanges: (previous, next) => (previous.format === next.format ? [] : ["format"]),
  analytics: { storeAs: "text", summarize: "count", groupable: false },
})

/**
 * `acme/measure`: a config-dependent stored kind with its `kinds` declared up front (R2, AC27).
 * `mode: "exact"` stores a number, `mode: "band"` stores a band name as text. No compatibility rule
 * and no "unanswered" rule.
 */
export const acmeMeasure = defineField({
  type: "acme/measure",
  config: z.strictObject({ mode: z.enum(["exact", "band"]).default("exact") }),
  answer: (config) =>
    config.mode === "exact" ? z.number().min(0) : z.enum(["small", "medium", "large"]),
  toCell: (answer) => String(answer),
  storedValues: (answer) => [answer],
  analytics: {
    storeAs: {
      kinds: ["number", "text"],
      pick: (config) => (config.mode === "exact" ? "number" : "text"),
    },
    summarize: "count",
    groupable: false,
  },
})

/**
 * `acme/note`: a notice the respondent acknowledges. `storeAs: "none"`, so it has no stored values
 * (AC7, `none` fixture) and `summarize: "none"`.
 */
export const acmeNote = defineField({
  type: "acme/note",
  config: z.strictObject({ text: z.string().default("") }),
  answer: () => z.boolean(),
  toCell: (answer) => (answer ? "seen" : "not seen"),
  storedValues: () => [],
  analytics: { storeAs: "none", summarize: "none", groupable: false },
})

// Untouched pad: a plain object whose only own key is `strokes` and that is an empty array. Reads
// own keys only and never throws, whatever JSON value it gets.
function isUntouchedPad(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value)
  if (keys.length !== 1 || keys[0] !== "strokes") return false
  const strokes: unknown = (value as Record<string, unknown>).strokes
  return Array.isArray(strokes) && strokes.length === 0
}
