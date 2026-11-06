import { defineField } from "../api"
import {
  checkboxConfigSchema,
  isEmptySelection,
  optionAnswerSchema,
  optionCell,
  optionStoredValues,
} from "./shared/options"

/**
 * `checkbox`: any number of options, optionally "Other" with free text (spec R13, R14). Optional
 * `minSelections` / `maxSelections` apply only when something is selected, "Other" counting as
 * one; `{ optionIds: [] }` is unanswered. Cells list known options in config order, then unknown
 * IDs in answer order, then "Other".
 */
export const checkboxField = defineField({
  type: "checkbox",
  config: checkboxConfigSchema,
  answer: (config) =>
    optionAnswerSchema(config, { min: config.minSelections, max: config.maxSelections }),
  isUnanswered: (value) => isEmptySelection(value),
  toCell: (answer, config) => optionCell(answer, config),
  storedValues: (answer) => optionStoredValues(answer),
  analytics: { storeAs: "text", summarize: "counts", groupable: true },
})
