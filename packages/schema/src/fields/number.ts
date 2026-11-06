import * as z from "zod"
import { customIssue, defineField } from "../api"
import { toPlainDecimal } from "./shared/decimal"

/**
 * `number`: a finite JSON number (spec R11). Optional inclusive `min` / `max` (`too_small` /
 * `too_big`), decimals allowed unless `integer` (`not_integer`). A numeric string such as `"5"`,
 * and `""`, is `invalid`. Cells are plain decimal, never an exponent.
 */
export const numberField = defineField({
  type: "number",
  config: z
    .strictObject({
      min: z.number().optional(),
      max: z.number().optional(),
      integer: z.boolean().default(false),
    })
    .superRefine((config, ctx) => {
      const { min, max } = config
      if (min === undefined || max === undefined || min <= max) return
      ctx.addIssue({
        code: "custom",
        input: config,
        path: ["min"],
        ...customIssue("invalid_range", { min, max }),
      })
    }),
  answer: (config) => {
    // `not_integer` aborts, so a fraction outside the bounds gives only `not_integer` (as `rating`).
    // Not `z.int()`: it would also refuse integers beyond the safe-integer range.
    let schema = config.integer
      ? z.number().refine(Number.isInteger, { ...customIssue("not_integer", {}), abort: true })
      : z.number()
    if (config.min !== undefined) schema = schema.min(config.min)
    if (config.max !== undefined) schema = schema.max(config.max)
    return schema
  },
  toCell: (answer) => toPlainDecimal(answer),
  storedValues: (answer) => [answer],
  analytics: { storeAs: "number", summarize: "histogram+stats", groupable: false },
})
