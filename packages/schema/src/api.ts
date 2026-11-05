// The public API of @songnoi/schema without the built-in fields (plan "Public API surface"). This is
// the only module `src/fields/**` may import (constitution 2): built-ins use exactly what a plugin
// can use. Everything not exported here is internal.

export type { CellOptions } from "./core/cell-options"
export {
  defineField,
  type FieldAnswer,
  type FieldConfig,
  type FieldDefinition,
  type StoreAs,
  storeAsOf,
  type Summarize,
} from "./core/define-field"
export {
  customIssue,
  FieldDefinitionError,
  type Issue,
  type IssueCode,
  issueSchema,
} from "./core/issues"
export { createFieldRegistry, type FieldRegistry } from "./core/registry"
