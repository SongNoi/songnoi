import { defineField } from "../api"
import { isBlankText, textAnswerSchema, textConfigSchema } from "./shared/text"

/**
 * `textarea`: multi-line text (spec R10). Trimmed; inner line breaks are kept verbatim (`\r\n`
 * stays `\r\n` and counts 1); `minLength` / `maxLength` count user-perceived characters. Blank
 * text is unanswered.
 */
export const textareaField = defineField({
  type: "textarea",
  config: textConfigSchema,
  answer: (config) => textAnswerSchema(config, false),
  isUnanswered: (value) => isBlankText(value),
  toCell: (answer) => answer,
  storedValues: (answer) => [answer],
  analytics: { storeAs: "text", summarize: "responses", groupable: false },
})
