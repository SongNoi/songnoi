import * as z from "zod"
import type { FormSchema } from "./form-schema"
import { type Issue, toIssues } from "./issues"
import { isPlainObject, readOwn } from "./json"
import type { FieldRegistry } from "./registry"

// Whole-response validation (spec R8, R9; plan "Whole-response validation"). One call checks every
// answer of a response against a parsed Form Schema and its registry, and returns either the
// normalised answer set or every problem grouped by `fieldId`. For any JSON input it never throws;
// an exception from a plugin's own code (answer-schema factory, rules, `isUnanswered`) is a bug and
// propagates unchanged, so nothing here catches.

/** Zod schema of a normalised answer set; internal (only its output type is public). */
export const answerSetSchema = z.record(z.string(), z.json())

/** A normalised answer set: `fieldId` → the Zod output of that field's answer schema. */
export type AnswerSet = z.output<typeof answerSetSchema>

type AnswerValue = AnswerSet[string]

/**
 * Validates a whole response (R8, R9). `schema` is a `parseFormSchema` output; its configs are not
 * re-parsed, so `registry` must hold the definitions the schema was read with (a missing type gives
 * `unknown_field_type` in that field's group and the result is never ok).
 *
 * On success, `answers` holds only the answered fields, each as its answer schema's output; absent,
 * `null` and field-specific unanswered values are left out. On failure, `answerSet` holds the issues
 * of the set as a whole (`invalid` when `answers` is not a JSON object, `unknown_field` per own key
 * outside the schema) and `fields` holds a non-empty issue list per `fieldId` that has problems.
 * Every field is always checked. The input is never changed.
 */
export function validateResponse(
  schema: FormSchema,
  answers: unknown,
  registry: FieldRegistry,
):
  | { readonly ok: true; readonly answers: AnswerSet }
  | {
      readonly ok: false
      readonly answerSet: readonly Issue[]
      readonly fields: Readonly<Record<string, readonly Issue[]>>
    } {
  if (!isPlainObject(answers)) {
    return { ok: false, answerSet: [{ code: "invalid", params: {}, path: [] }], fields: {} }
  }

  // Both records are built only from schema `fieldId`s, written as own data properties, so no key
  // (an inherited name such as `toString` included) can reach a prototype.
  const normalised: AnswerSet = {}
  const fields: Record<string, readonly Issue[]> = {}
  const fieldIds = new Set<string>()

  for (const field of schema.fields) {
    fieldIds.add(field.fieldId)
    const issues = validateField(field, answers, registry, normalised)
    if (issues.length > 0) setOwn(fields, field.fieldId, issues)
  }

  const answerSet: Issue[] = []
  for (const key of Object.keys(answers)) {
    if (!fieldIds.has(key)) {
      answerSet.push({ code: "unknown_field", params: { fieldId: key }, path: [] })
    }
  }

  if (answerSet.length > 0 || Object.keys(fields).length > 0) {
    return { ok: false, answerSet, fields }
  }
  return { ok: true, answers: normalised }
}

// One field: registry miss → absent / `null` → the type's "unanswered" rule → the answer schema.
// Writes the normalised answer into `normalised` and returns the field's issues.
function validateField(
  field: FormSchema["fields"][number],
  answers: Readonly<Record<string, unknown>>,
  registry: FieldRegistry,
  normalised: AnswerSet,
): Issue[] {
  const definition = registry.get(field.type)
  if (definition === undefined) {
    return [{ code: "unknown_field_type", params: { type: field.type }, path: [] }]
  }

  const value = readOwn(answers, field.fieldId)
  if (value === undefined || value === null || definition.isUnanswered?.(value, field.config)) {
    return field.required ? [{ code: "required", params: {}, path: [] }] : []
  }

  const result = definition.answer(field.config).safeParse(value, { reportInput: true })
  if (!result.success) return toIssues(result.error.issues, "answer")
  // Answer schemas output JSON values by contract (the normalised set is stored); the definition
  // type cannot say so, hence the cast.
  setOwn(normalised, field.fieldId, result.data as AnswerValue)
  return []
}

function setOwn<T>(record: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}
