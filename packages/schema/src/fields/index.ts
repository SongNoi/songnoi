// The built-in field types (spec R3, R10–R17; ADR 0007): nine plain `defineField` definitions, each
// in its own module, collected here in brief §5 order. This is an array, not a registry: consumers
// pass it (or any subset, plus their plugins) to `createFieldRegistry` themselves.

import { checkboxField } from "./checkbox"
import { choiceField } from "./choice"
import { dateField } from "./date"
import { dropdownField } from "./dropdown"
import { fileField } from "./file"
import { numberField } from "./number"
import { ratingField } from "./rating"
import { textField } from "./text"
import { textareaField } from "./textarea"

export {
  checkboxField,
  choiceField,
  dateField,
  dropdownField,
  fileField,
  numberField,
  ratingField,
  textareaField,
  textField,
}

/**
 * The nine built-in field definitions in brief §5 order: `text`, `textarea`, `number`, `choice`,
 * `checkbox`, `dropdown`, `date`, `rating`, `file`. A frozen array, not a registry: pass it to
 * `createFieldRegistry` (alone or spread with plugins), e.g.
 * `createFieldRegistry([...builtInFields, myField])`. Each element is the same object as its named
 * export.
 */
export const builtInFields = Object.freeze([
  textField,
  textareaField,
  numberField,
  choiceField,
  checkboxField,
  dropdownField,
  dateField,
  ratingField,
  fileField,
] as const)
