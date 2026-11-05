import { checkDefinition, type FieldDefinition } from "./define-field"
import { FieldDefinitionError, type Issue, prefixIssues } from "./issues"
import { readOwn } from "./json"

// The public registry (spec R3; ADR 0007 point 3). Built from a plain list of definitions by one
// public call; built-ins are passed in exactly like plugins. There is no global, implicit or
// pre-filled registry: each call returns a new, independent lookup.

/** A lookup of field definitions by `type`, created by `createFieldRegistry`. */
export interface FieldRegistry {
  /** The definition registered for `type`, or `undefined` (never an inherited key). */
  get(type: string): FieldDefinition | undefined
  /** The registered types, in list order. */
  readonly types: readonly string[]
}

/**
 * Creates a registry from `definitions` (R3). Re-runs the definition checks on every entry (a
 * JavaScript caller can hand-build one), with the list index in front of each path, and refuses a
 * repeated `type` (`duplicate_field_type` at `[index, "type"]` of each repeat).
 *
 * @throws FieldDefinitionError once, with every issue of the list.
 */
export function createFieldRegistry(definitions: readonly FieldDefinition[]): FieldRegistry {
  // A JavaScript caller may pass something that is not a list at all.
  const list: unknown = definitions
  if (!Array.isArray(list)) {
    throw new FieldDefinitionError([{ code: "invalid", params: {}, path: [] }])
  }
  const entries: readonly unknown[] = list

  const issues: Issue[] = []
  const seen = new Set<string>()
  const byType = new Map<string, FieldDefinition>()
  entries.forEach((entry, index) => {
    const problems = checkDefinition(entry)
    issues.push(...prefixIssues([index], problems))
    // A well-formed type counts for duplicates even when other members are broken; a broken type
    // is already reported.
    if (problems.some((issue) => issue.path.length === 0 || issue.path[0] === "type")) return
    const type = readOwn(entry as object, "type") as string // checked by checkDefinition
    if (seen.has(type)) {
      issues.push({ code: "duplicate_field_type", params: { type }, path: [index, "type"] })
      return
    }
    seen.add(type)
    // Only reached for valid entries when the list as a whole is valid (otherwise we throw).
    if (problems.length === 0) byType.set(type, entry as FieldDefinition)
  })
  if (issues.length > 0) throw new FieldDefinitionError(issues)

  const types = Object.freeze([...byType.keys()])
  return Object.freeze({
    get(type: string): FieldDefinition | undefined {
      return byType.get(type)
    },
    types,
  })
}
