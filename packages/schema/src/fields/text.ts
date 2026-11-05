import { defineField } from "../api"
import { isBlankText, textAnswerSchema, textConfigSchema } from "./shared/text"

/**
 * `text`: a single line of text (spec R10). Trimmed; an inner LF, CR, LS or PS is `invalid`;
 * `minLength` / `maxLength` count user-perceived characters. Blank text is unanswered.
 */
export const textField = defineField({
  type: "text",
  config: textConfigSchema,
  answer: (config) => textAnswerSchema(config, true),
  isUnanswered: (value) => isBlankText(value),
  toCell: (answer) => answer,
  storedValues: (answer) => [answer],
  analytics: { storeAs: "text", summarize: "responses", groupable: false },
})
