import { defineField } from "../api"
import {
  isEmptySelection,
  optionAnswerSchema,
  optionCell,
  optionConfigSchema,
  optionStoredValues,
} from "./shared/options"

/**
 * `choice`: one option out of a list, optionally "Other" with free text (spec R13, R14). The
 * answer is `{ optionIds, other? }` with at most one ID; `{ optionIds: [] }` is unanswered.
 * Same rules as `dropdown`; the two differ only in how they are rendered (002).
 */
export const choiceField = defineField({
  type: "choice",
  config: optionConfigSchema,
  answer: (config) => optionAnswerSchema(config, { max: 1 }),
  isUnanswered: (value) => isEmptySelection(value),
  toCell: (answer, config) => optionCell(answer, config),
  storedValues: (answer) => optionStoredValues(answer),
  analytics: { storeAs: "text", summarize: "counts", groupable: true },
})
