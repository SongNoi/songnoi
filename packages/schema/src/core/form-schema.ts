import * as z from "zod"
import { idSchema, RESERVED_FIELD_IDS } from "./ids"
import {
  customIssue,
  type Failure,
  failure,
  type Issue,
  type IssuePath,
  prefixIssues,
  toIssues,
} from "./issues"
import { describeValue, hasOwnKey, isPlainObject, readOwn } from "./json"
import type { FieldRegistry } from "./registry"

// Form Schema v1 and its read entry point (spec R5–R7; ADR 0012 decision 1; plan "Form Schema v1
// and the read entry point"). The shapes are static strict Zod objects; `parseFormSchema` is plain
// orchestration over them so it can report every problem at once: version gate, migration, then
// meta, form keys and each field entry (shape, type lookup, config, repeated `fieldId`).

/** The current stored format. Every change to the stored format bumps it and adds a step (R7). */
export const CURRENT_SCHEMA_VERSION = 1

// --- language (R5; plan "Rules on values", Language) ---------------------------------------------

// The 26 grandfathered tags of the IANA language subtag registry (BCP 47 §2.2.8), lower case.
// Regular ones such as `art-lojban` are well-formed Unicode locale identifiers that engines map
// through CLDR aliases instead of refusing, so they must be refused before `Intl` sees them.
const GRANDFATHERED_TAGS: ReadonlySet<string> = new Set([
  // irregular
  "en-gb-oed",
  "i-ami",
  "i-bnn",
  "i-default",
  "i-enochian",
  "i-hak",
  "i-klingon",
  "i-lux",
  "i-mingo",
  "i-navajo",
  "i-pwn",
  "i-tao",
  "i-tay",
  "i-tsu",
  "sgn-be-fr",
  "sgn-be-nl",
  "sgn-ch-de",
  // regular
  "art-lojban",
  "cel-gaulish",
  "no-bok",
  "no-nyn",
  "zh-guoyu",
  "zh-hakka",
  "zh-min",
  "zh-min-nan",
  "zh-xiang",
])

// A 2–3-letter language followed by a 3-letter subtag: an extended language subtag (`zh-cmn-Hans`,
// `zh-yue`). Never valid in a Unicode locale identifier (a 3-letter second subtag is neither a
// script, a region nor a variant).
const EXTLANG = /^[a-z]{2,3}-[a-z]{3}(?:-|$)/i

// A one-character first subtag: private-use-only (`x-private`) and irregular grandfathered (`i-…`)
// tags. Unicode locale identifiers start with a 2–3 or 5–8-letter language subtag.
const ONE_CHARACTER_PREFIX = /^[^-](?:-|$)/

/**
 * The canonical form of a language tag, or `undefined` when it is refused. The structural
 * pre-check runs before any `Intl` call, so these refusals never depend on the engine's ICU/CLDR
 * data; `Intl.getCanonicalLocales` then refuses malformed tags (`en_US`, empty) with a
 * `RangeError` and normalises case and deprecated aliases (`th-th` → `th-TH`, `iw` → `he`).
 */
function canonicalLanguage(tag: string): string | undefined {
  if (
    GRANDFATHERED_TAGS.has(tag.toLowerCase()) ||
    EXTLANG.test(tag) ||
    ONE_CHARACTER_PREFIX.test(tag)
  ) {
    return undefined
  }
  try {
    return Intl.getCanonicalLocales(tag)[0]
  } catch (error) {
    if (error instanceof RangeError) return undefined
    throw error
  }
}

// --- shapes ----------------------------------------------------------------------------------------

/** A string that is not blank after `trim()`; stored verbatim (no trimming, no normalisation). */
const nonBlank = z.string().refine((text) => text.trim() !== "", customIssue("required", {}))

const languageSchema = z.string().transform((tag, ctx) => {
  const canonical = canonicalLanguage(tag)
  if (canonical === undefined) {
    ctx.issues.push({ code: "custom", input: tag, ...customIssue("invalid", {}) })
    return z.NEVER
  }
  return canonical
})

/** `fieldId`: the public ID rule, plus the reserved values (`reserved_id {id}`). */
const fieldIdSchema = idSchema.check((ctx) => {
  if (RESERVED_FIELD_IDS.has(ctx.value)) {
    ctx.issues.push({
      code: "custom",
      input: ctx.value,
      ...customIssue("reserved_id", { id: ctx.value }),
    })
  }
})

const formMetaSchema = z.strictObject({
  title: nonBlank,
  description: z.string().optional(),
  language: languageSchema,
})

const fieldEntryMembers = {
  fieldId: fieldIdSchema,
  type: z.string(),
  label: nonBlank,
  help: z.string().optional(),
  required: z.boolean().default(false),
}

// The entry as read: `config` is checked separately, by the schema of the entry's type.
const fieldEntryInputSchema = z.strictObject({
  ...fieldEntryMembers,
  config: z.unknown().optional(),
})

// The entry as returned: `config` is the type's parsed config, defaults written in.
const fieldEntrySchema = z.strictObject({
  ...fieldEntryMembers,
  config: z.record(z.string(), z.unknown()),
})

const formSchemaSchema = z.strictObject({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  meta: formMetaSchema,
  fields: z.array(fieldEntrySchema),
})

/** A parsed Form Schema: the current format, language canonicalised, config defaults written in. */
export type FormSchema = z.output<typeof formSchemaSchema>

/** The `meta` of a parsed Form Schema. */
export type FormMeta = z.output<typeof formMetaSchema>

/** One field entry of a parsed Form Schema. */
export type FieldEntry = z.output<typeof fieldEntrySchema>

// --- migration (R7) --------------------------------------------------------------------------------

/**
 * One migration step: takes a stored schema of one version to the next. It must not mutate its
 * input (stored versions are migrated in memory, never rewritten).
 */
export type MigrationStep = (input: Readonly<Record<string, unknown>>) => Record<string, unknown>

// Step `i` takes version `i + 1` to `i + 2`, so the list always has `CURRENT_SCHEMA_VERSION - 1`
// entries. Empty while the current format is the first one.
const MIGRATION_STEPS: readonly MigrationStep[] = []

/**
 * Brings `input` from its `schemaVersion` to the latest version of `steps` (default: the package's
 * own steps) by running step `i` (version `i + 1` → `i + 2`) from the found version on, in order.
 * Never mutates `input`; returns it unchanged when no step applies.
 *
 * Precondition: `schemaVersion` passed the version gate (a positive integer).
 */
export function migrateFormSchema(
  input: Readonly<Record<string, unknown>>,
  steps: readonly MigrationStep[] = MIGRATION_STEPS,
): Record<string, unknown> {
  const version = readOwn(input, "schemaVersion")
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new RangeError("migrateFormSchema needs a gate-checked schemaVersion")
  }
  let current: Record<string, unknown> = input
  for (const step of steps.slice(version - 1)) current = step(current)
  return current
}

// --- the read entry point (R6, R7) -----------------------------------------------------------------

/**
 * Reads a stored or candidate Form Schema against `registry` (R5–R7). Input that is not a plain
 * object gives only `invalid` at `[]`; a missing, non-integer or unknown `schemaVersion` gives only
 * `unsupported_schema_version`. Otherwise the input is migrated to the current format and every
 * problem is reported with its path. On success the schema is a fresh object with the language
 * canonicalised, `required` and every config default written in; parsing it again gives an equal
 * value. The input is never changed.
 *
 * @throws TypeError when a registered field type's config schema returns something other than a
 *   plain object (R8: a broken plugin is loud), with or without an explicit `config`.
 */
export function parseFormSchema(
  input: unknown,
  registry: FieldRegistry,
): { readonly ok: true; readonly schema: FormSchema } | Failure {
  if (!isPlainObject(input)) return failure([invalidAt([])])
  const versionIssue = checkVersion(readOwn(input, "schemaVersion"))
  if (versionIssue !== undefined) return failure([versionIssue])

  const current = migrateFormSchema(input)
  const issues: Issue[] = unknownProperties(current, formSchemaSchema.shape, [])
  const meta = parseRequired(current, "meta", issues, (value) =>
    parseObject(value, formMetaSchema, ["meta"], issues),
  )
  const fields = parseRequired(current, "fields", issues, (value) =>
    parseFields(value, registry, issues),
  )

  if (issues.length > 0 || meta === undefined || fields === undefined) return failure(issues)
  return { ok: true, schema: { schemaVersion: CURRENT_SCHEMA_VERSION, meta, fields } }
}

function checkVersion(found: unknown): Issue | undefined {
  if (
    typeof found === "number" &&
    Number.isInteger(found) &&
    found >= 1 &&
    found <= CURRENT_SCHEMA_VERSION
  ) {
    return undefined
  }
  // `found` reports the number or string given; anything else (or a non-finite number from a
  // JavaScript caller, which the catalogue cannot carry) is `null`.
  const reported =
    typeof found === "string" || (typeof found === "number" && Number.isFinite(found))
      ? found
      : null
  return {
    code: "unsupported_schema_version",
    params: { found: reported },
    path: ["schemaVersion"],
  }
}

function parseFields(
  value: unknown,
  registry: FieldRegistry,
  issues: Issue[],
): FieldEntry[] | undefined {
  if (!Array.isArray(value)) {
    issues.push(invalidAt(["fields"]))
    return undefined
  }
  const entries: readonly unknown[] = value
  const parsedEntries: FieldEntry[] = []
  const seen = new Set<string>()
  let complete = true
  for (const [index, entry] of entries.entries()) {
    const parsed = parseFieldEntry(entry, index, registry, issues)
    if (parsed === undefined) complete = false
    else parsedEntries.push(parsed)
    // Only a valid, non-reserved fieldId counts for repeats; a broken one is already reported.
    const fieldId = isPlainObject(entry) ? readOwn(entry, "fieldId") : undefined
    if (typeof fieldId !== "string" || !fieldIdSchema.safeParse(fieldId).success) continue
    if (seen.has(fieldId)) {
      issues.push({
        code: "duplicate_field_id",
        params: { fieldId },
        path: ["fields", index, "fieldId"],
      })
    }
    seen.add(fieldId)
  }
  return complete ? parsedEntries : undefined
}

// The entry checks always run; the config is parsed only when the type is registered.
function parseFieldEntry(
  entry: unknown,
  index: number,
  registry: FieldRegistry,
  issues: Issue[],
): FieldEntry | undefined {
  const path: IssuePath = ["fields", index]
  const parsed = parseObject(entry, fieldEntryInputSchema, path, issues)
  if (!isPlainObject(entry)) return undefined
  const type = readOwn(entry, "type")
  if (typeof type !== "string") return undefined // reported by the entry shape

  const definition = registry.get(type)
  if (definition === undefined) {
    issues.push({ code: "unknown_field_type", params: { type }, path: [...path, "type"] })
    return undefined
  }
  // A field without `config` gets every default.
  const rawConfig = readOwn(entry, "config")
  const config = definition.config.safeParse(rawConfig === undefined ? {} : rawConfig, {
    reportInput: true,
  })
  if (!config.success) {
    issues.push(...prefixIssues([...path, "config"], toIssues(config.error.issues, "schema")))
    return undefined
  }
  // A JavaScript plugin (or a cast) may output anything; a config must be a plain object (R8).
  const output: unknown = config.data
  if (!isPlainObject(output)) {
    throw new TypeError(
      `Field type "${type}": the config schema returned ${describeValue(output)}, not a plain object.`,
    )
  }
  return parsed === undefined ? undefined : { ...parsed, config: config.data }
}

/**
 * Parses one object level with its strict shape. Unknown keys come from the object's own keys
 * (an own `__proto__` from `JSON.parse` included); only the shape's own keys are copied into the
 * object Zod parses, so nothing is read through the prototype chain and no key is lost.
 */
function parseObject<S extends z.ZodObject>(
  value: unknown,
  schema: S,
  path: IssuePath,
  issues: Issue[],
): z.output<S> | undefined {
  if (!isPlainObject(value)) {
    issues.push(invalidAt(path))
    return undefined
  }
  issues.push(...unknownProperties(value, schema.shape, path))
  const known: Record<string, unknown> = {}
  for (const key of Object.keys(schema.shape)) {
    if (hasOwnKey(value, key)) known[key] = value[key]
  }
  const result = schema.safeParse(known, { reportInput: true })
  if (!result.success) {
    issues.push(...prefixIssues(path, toIssues(result.error.issues, "schema")))
    return undefined
  }
  return result.data
}

function unknownProperties(
  value: Readonly<Record<string, unknown>>,
  shape: object,
  path: IssuePath,
): Issue[] {
  return Object.keys(value)
    .filter((key) => !hasOwnKey(shape, key))
    .map((key) => ({ code: "unknown_property", params: { key }, path: [...path, key] }))
}

// A required form-level key: missing gives `required` at `[key]`, otherwise `parse` reads it.
function parseRequired<T>(
  object: Readonly<Record<string, unknown>>,
  key: string,
  issues: Issue[],
  parse: (value: unknown) => T | undefined,
): T | undefined {
  if (hasOwnKey(object, key)) return parse(object[key])
  issues.push({ code: "required", params: {}, path: [key] })
  return undefined
}

function invalidAt(path: IssuePath): Issue {
  return { code: "invalid", params: {}, path }
}
