---
"@songnoi/schema": minor
---

Form Schema v1, the field API and nine built-in fields.

- Form Schema v1: `parseFormSchema` reads and migrates a stored schema against a field registry
  (`CURRENT_SCHEMA_VERSION`), `validateResponse` validates a whole response, and
  `checkVersionHistory` refuses changes that would make answers unmergeable across versions.
- Field API: `defineField` and `createFieldRegistry`, analytics metadata (`storeAs`, `summarize`,
  `storeAsOf`), the issue catalogue (`issueSchema`, `customIssue`, `FieldDefinitionError`), and
  helpers (`idSchema`, `generateId`, `countGraphemes`, `parseCellOptions`).
- Nine built-in fields defined with the public API: `textField`, `textareaField`, `numberField`,
  `choiceField`, `checkboxField`, `dropdownField`, `dateField`, `ratingField`, `fileField`, and
  `builtInFields` (a plain array of the nine, not a registry).
- Runs unchanged in Node and in the browser; `zod` is the only peer dependency.
