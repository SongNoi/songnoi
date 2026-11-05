import * as z from "zod"
import { customIssue, defineField } from "../api"

// RFC 6838 `restricted-name`: a letter or digit, then up to 126 of letters, digits and
// `! # $ & - ^ _ . +`. The subtype may be `*` (`image/*`); the type may not (`*/*`, `*/png`).
const RESTRICTED_NAME = "[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}"
const MIME_TYPE = new RegExp(`^${RESTRICTED_NAME}/(?:\\*|${RESTRICTED_NAME})$`)

/**
 * `file`: a list of opaque file IDs (spec R17; ADR 0011 as amended). Config `maxFiles` (int ≥ 1,
 * default 1), optional `maxSize` in bytes (int ≥ 1) and `allowedTypes` (≥ 1 MIME type). The answer
 * holds references only: `maxSize` and `allowedTypes` are enforced on upload (item 006), never
 * here. A non-empty string per entry (`invalid` at `[i]`), no repeat (`duplicate {value}` at the
 * repeat), at most `maxFiles` (`too_many {max}`). The empty list is unanswered.
 */
export const fileField = defineField({
  type: "file",
  config: z.strictObject({
    maxFiles: z.int().min(1).default(1),
    maxSize: z.int().min(1).optional(),
    // Not `.min(1)`: like `.max`, it also measures a string, so `""` would add `too_few`.
    allowedTypes: z
      .array(z.string().regex(MIME_TYPE))
      .refine((types) => types.length > 0, customIssue("too_few", { min: 1 }))
      .optional(),
  }),
  // One refinement for the list rules: Zod 4 runs a length check (`.max`) even on a non-array and
  // a failed one skips later refinements, so `too_many` is raised here next to `duplicate`.
  answer: (config) =>
    z
      .array(z.string().refine((id) => id !== "", customIssue("invalid", {})))
      .superRefine((ids, ctx) => {
        if (ids.length > config.maxFiles) {
          ctx.addIssue({
            code: "custom",
            input: ids,
            ...customIssue("too_many", { max: config.maxFiles }),
          })
        }
        const seen = new Set<string>()
        ids.forEach((id, index) => {
          if (!seen.has(id)) {
            seen.add(id)
            return
          }
          ctx.addIssue({
            code: "custom",
            input: id,
            path: [index],
            ...customIssue("duplicate", { value: id }),
          })
        })
      }),
  isUnanswered: (value) => Array.isArray(value) && value.length === 0,
  toCell: (answer) => answer.join("; "),
  storedValues: (answer) => [...answer],
  analytics: { storeAs: "text", summarize: "count", groupable: false },
})
