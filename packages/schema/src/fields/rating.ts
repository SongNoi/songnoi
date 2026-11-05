import * as z from "zod"
import { customIssue, defineField } from "../api"
import { toPlainDecimal } from "./shared/decimal"

/**
 * `rating`: an integer from 1 to `max` (spec R12). Config `max` 2–10 (default 5) and `icon`
 * `star` | `heart` (default `star`). Groupable (owner decision 2026-11-05). A change of `max` makes
 * answers incomparable (R19): the only built-in compatibility rule.
 */
export const ratingField = defineField({
  type: "rating",
  config: z.strictObject({
    max: z.int().min(2).max(10).default(5),
    icon: z.enum(["star", "heart"]).default("star"),
  }),
  // `not_integer` aborts, so `5.5` with `max` 5 gives only `not_integer`; not `z.int()`, whose
  // safe-integer bounds would add a second `too_big` for a huge number.
  answer: (config) =>
    z
      .number()
      .refine(Number.isInteger, { ...customIssue("not_integer", {}), abort: true })
      .min(1)
      .max(config.max),
  toCell: (answer) => toPlainDecimal(answer),
  storedValues: (answer) => [answer],
  incompatibleChanges: (previous, next) => (previous.max === next.max ? [] : ["max"]),
  analytics: { storeAs: "number", summarize: "distribution+avg", groupable: true },
})
