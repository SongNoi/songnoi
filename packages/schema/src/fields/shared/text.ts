import * as z from "zod"
import { countGraphemes, customIssue } from "../../api"

// The shared builder of the `text` / `textarea` pair (spec R10; plan "Built-in fields", "Line
// breaks in `text`", "Text length"). Not a field type: `fields/text.ts` and `fields/textarea.ts`
// each make one `defineField` call from these parts. Uses only the public API and `zod`.

/**
 * Config of both text types: optional limits in user-perceived characters, no defaults.
 * `minLength` > `maxLength` gives `invalid_range { min, max }` at `["minLength"]`.
 */
export const textConfigSchema = z
  .strictObject({
    minLength: z.int().min(0).optional(),
    maxLength: z.int().min(1).optional(),
  })
  .superRefine((config, ctx) => {
    const { minLength, maxLength } = config
    if (minLength === undefined || maxLength === undefined || minLength <= maxLength) return
    ctx.addIssue({
      code: "custom",
      input: config,
      path: ["minLength"],
      ...customIssue("invalid_range", { min: minLength, max: maxLength }),
    })
  })

export type TextConfig = z.output<typeof textConfigSchema>

// The four ECMAScript LineTerminators: LF, CR (so CRLF too), LS U+2028 and PS U+2029. NEL, VT and
// FF are not line terminators and stay accepted (R10).
const LINE_TERMINATOR = /[\n\r\u2028\u2029]/u

/**
 * The answer schema: a string, trimmed (`String.prototype.trim`); then, for single-line `text`, an
 * inner line terminator is one `invalid`; then the limits, counted with `countGraphemes` only when
 * one is set (`too_short` / `too_long`). The output is the trimmed text, otherwise verbatim.
 */
export function textAnswerSchema(config: TextConfig, singleLine: boolean): z.ZodType<string> {
  const { minLength, maxLength } = config
  return z
    .string()
    .trim()
    .superRefine((text, ctx) => {
      if (singleLine && LINE_TERMINATOR.test(text)) {
        ctx.addIssue({ code: "custom", input: text, ...customIssue("invalid", {}) })
        return
      }
      if (minLength === undefined && maxLength === undefined) return
      const length = countGraphemes(text)
      if (minLength !== undefined && length < minLength) {
        ctx.addIssue({
          code: "custom",
          input: text,
          ...customIssue("too_short", { min: minLength }),
        })
      }
      if (maxLength !== undefined && length > maxLength) {
        ctx.addIssue({
          code: "custom",
          input: text,
          ...customIssue("too_long", { max: maxLength }),
        })
      }
    })
}

/** Text that is blank after `trim()` is unanswered (R9), so it is never `too_short`. */
export function isBlankText(value: unknown): boolean {
  return typeof value === "string" && value.trim() === ""
}
