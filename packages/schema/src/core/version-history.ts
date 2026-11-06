import { type FieldDefinition, storeAsOf } from "./define-field"
import type { FieldEntry, FormSchema } from "./form-schema"
import { type Failure, failure, type Issue } from "./issues"
import type { FieldRegistry } from "./registry"

// The version-history check (spec R19, US7; ADR 0009 as amended; plan "Version history"). A
// `fieldId` that appears in an earlier version must keep answers that can be merged: same `type`,
// same stored kind, and no config change the definition's own rule refuses. Everything is read from
// the registry's definitions; no built-in is special-cased.

/** One earlier, published version of a form: its parsed schema and its stored version number. */
export interface EarlierVersion {
  /** The stored version number: a positive safe integer, unique in the history. */
  readonly version: number
  /** The schema of that version, read with `parseFormSchema`. */
  readonly schema: FormSchema
}

/** An earlier version with its fields indexed by `fieldId`. */
interface IndexedVersion {
  readonly version: number
  readonly fields: ReadonlyMap<string, FieldEntry>
}

/**
 * Refuses `candidate` when a `fieldId` it shares with an earlier version would give answers that
 * cannot be merged (R19). `earlier` may come in any order; the most recent is the highest
 * `version`.
 *
 * History input is checked first: a `version` that is not a positive safe integer gives `invalid`,
 * a repeated one `duplicate {value}`, both at `["earlier", k, "version"]`; if any exists only those
 * issues are returned. Then each candidate field is compared with the earlier versions from the
 * most recent down, stopping at the first conflict: `field_type_changed`, else
 * `field_kind_changed`, else `field_config_incompatible` (the definition's `incompatibleChanges`),
 * at `["fields", i]`. When the kind or config check needs a definition the registry does not hold,
 * the field gets `unknown_field_type` at `["fields", i, "type"]` and is skipped. Never throws for
 * that; an exception thrown by a plugin's own rule propagates.
 */
export function checkVersionHistory(
  earlier: readonly EarlierVersion[],
  candidate: FormSchema,
  registry: FieldRegistry,
): { readonly ok: true } | Failure {
  const versionIssues = checkVersions(earlier)
  if (versionIssues.length > 0) return failure(versionIssues)

  const history: IndexedVersion[] = earlier
    .map(({ version, schema }) => ({
      version,
      fields: new Map(schema.fields.map((entry) => [entry.fieldId, entry] as const)),
    }))
    .sort((left, right) => right.version - left.version)

  const issues: Issue[] = []
  candidate.fields.forEach((field, index) => {
    const issue = checkField(field, index, history, registry)
    if (issue !== undefined) issues.push(issue)
  })
  return issues.length > 0 ? failure(issues) : { ok: true }
}

/** `invalid` for a version that is not a positive safe integer, `duplicate` for each repeat. */
function checkVersions(earlier: readonly EarlierVersion[]): Issue[] {
  const issues: Issue[] = []
  const seen = new Set<number>()
  earlier.forEach((entry, k) => {
    // A JavaScript caller may pass anything here.
    const version: unknown = entry.version
    const path = ["earlier", k, "version"]
    if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) {
      issues.push({ code: "invalid", params: {}, path })
      return
    }
    if (seen.has(version)) {
      issues.push({ code: "duplicate", params: { value: version }, path })
      return
    }
    seen.add(version)
  })
  return issues
}

/** The first conflict of one candidate field, walking `history` (most recent first). */
function checkField(
  field: FieldEntry,
  index: number,
  history: readonly IndexedVersion[],
  registry: FieldRegistry,
): Issue | undefined {
  const { fieldId, type, config } = field
  const path = ["fields", index]
  // Looked up only when a check needs it (a shared `type`), then reused for older versions.
  let definition: FieldDefinition | undefined
  let storeAs: string | undefined

  for (const { version, fields } of history) {
    const previous = fields.get(fieldId)
    if (previous === undefined) continue

    // 1. Type: compares strings, needs no definition.
    if (previous.type !== type) {
      return {
        code: "field_type_changed",
        params: { fieldId, previousType: previous.type, type, version },
        path,
      }
    }

    definition ??= registry.get(type)
    if (definition === undefined) {
      return { code: "unknown_field_type", params: { type }, path: [...path, "type"] }
    }

    // 2. Stored kind under each version's parsed config.
    storeAs ??= storeAsOf(definition, config)
    const previousStoreAs = storeAsOf(definition, previous.config)
    if (previousStoreAs !== storeAs) {
      return {
        code: "field_kind_changed",
        params: { fieldId, type, previousStoreAs, storeAs, version },
        path,
      }
    }

    // 3. The definition's own answer-compatibility rule (absent = accepts every change).
    const properties = definition.incompatibleChanges?.(previous.config, config) ?? []
    if (properties.length > 0) {
      return {
        code: "field_config_incompatible",
        params: { fieldId, type, properties: [...properties], version },
        path,
      }
    }
  }
  return undefined
}
