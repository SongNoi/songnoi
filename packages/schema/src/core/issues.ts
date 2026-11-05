import * as z from "zod"
import { isPlainObject, readOwn } from "./json"

// The error catalogue (spec R4, ADR 0012 decision 2): every failure the package reports is
// `{ code, params, path }` from this closed list. There is no message text anywhere; the UI maps
// codes to `messages/{en,th}.json`.

const pathSchema = z.array(z.union([z.string(), z.number()]))

function entry<const C extends string, S extends z.core.$ZodShape>(code: C, params: S) {
  return z.strictObject({ code: z.literal(code), params: z.strictObject(params), path: pathSchema })
}

const limitMin = { min: z.number() }
const limitMax = { max: z.number() }

/** Zod schema of one catalogue issue: a discriminated union of R4's 29 codes, all strict. */
export const issueSchema = z.discriminatedUnion("code", [
  // values and config
  entry("required", {}),
  entry("invalid", {}),
  entry("too_short", limitMin),
  entry("too_long", limitMax),
  entry("too_small", limitMin),
  entry("too_big", limitMax),
  entry("not_integer", {}),
  entry("too_few", limitMin),
  entry("too_many", limitMax),
  entry("invalid_range", { ...limitMin, ...limitMax }),
  entry("duplicate", { value: z.union([z.string(), z.number()]) }),
  entry("unknown_option", { optionId: z.string() }),
  entry("other_text_required", {}),
  entry("invalid_date", {}),
  entry("offset_required", {}),
  // answer set
  entry("unknown_field", { fieldId: z.string() }),
  // Form Schema
  entry("unsupported_schema_version", { found: z.union([z.number(), z.string(), z.null()]) }),
  entry("unknown_property", { key: z.string() }),
  entry("unknown_field_type", { type: z.string() }),
  entry("duplicate_field_id", { fieldId: z.string() }),
  entry("duplicate_option_id", { optionId: z.string() }),
  entry("reserved_id", { id: z.string() }),
  // version history
  entry("field_type_changed", {
    fieldId: z.string(),
    previousType: z.string(),
    type: z.string(),
    version: z.int(),
  }),
  entry("field_kind_changed", {
    fieldId: z.string(),
    type: z.string(),
    previousStoreAs: z.string(),
    storeAs: z.string(),
    version: z.int(),
  }),
  entry("field_config_incompatible", {
    fieldId: z.string(),
    type: z.string(),
    properties: z.array(z.string()),
    version: z.int(),
  }),
  // definitions, registry and export
  entry("invalid_field_type", { type: z.string() }),
  entry("duplicate_field_type", { type: z.string() }),
  entry("incompatible_analytics", { storeAs: z.string(), summarize: z.string() }),
  entry("invalid_time_zone", { timeZone: z.string() }),
])

export type Issue = z.output<typeof issueSchema>
export type IssueCode = Issue["code"]
export type IssuePath = Issue["path"]
type ParamsOf<C extends IssueCode> = Extract<Issue, { code: C }>["params"]

/** Where Zod issues come from: the schema side (form, config, cell options) or an answer. */
export type IssueContext = "schema" | "answer"

// --- customIssue -------------------------------------------------------------------------------

/** What `customIssue` puts into Zod's custom-issue `params`. */
interface CatalogueParams<C extends IssueCode> {
  readonly code: C
  readonly params: ParamsOf<C>
}

/**
 * Zod custom-issue params that carry a catalogue code, for `.refine(check, customIssue(…))` or
 * `ctx.addIssue({ code: "custom", input, path, ...customIssue(…) })`. `toIssues` turns the issue
 * into exactly that code and params; an unknown code or malformed params become `invalid`.
 */
export function customIssue<C extends IssueCode>(
  code: C,
  params: ParamsOf<C>,
): { readonly params: CatalogueParams<C> } {
  return { params: { code, params } }
}

// --- Zod issues -> catalogue ---------------------------------------------------------------------

/**
 * Maps Zod issues to catalogue issues (plan "Zod → catalogue mapping"). Every Zod issue yields at
 * least one catalogue issue; Zod's `message` and `input` are dropped.
 *
 * Precondition: the parse ran with `{ reportInput: true }`. Only then can a missing value (Zod sets
 * an own `input` key equal to `undefined`) be told apart from a wrong type. Without it, no issue
 * counts as missing, so a missing value maps to `invalid`, never to `required`.
 */
export function toIssues(zodIssues: readonly z.core.$ZodIssue[], context: IssueContext): Issue[] {
  return zodIssues.flatMap((zodIssue) => mapIssue(zodIssue, context))
}

function mapIssue(zodIssue: z.core.$ZodIssue, context: IssueContext): Issue[] {
  const path = toPath(zodIssue.path)
  switch (zodIssue.code) {
    case "invalid_type":
      // The missing rule wins over `expected: "int"`.
      if (isMissing(zodIssue))
        return [checked(context === "schema" ? "required" : "invalid", {}, path)]
      return [checked(zodIssue.expected === "int" ? "not_integer" : "invalid", {}, path)]
    case "too_small":
      return [mapBound(zodIssue.origin, zodIssue.minimum, zodIssue.inclusive, "min", path)]
    case "too_big":
      return [mapBound(zodIssue.origin, zodIssue.maximum, zodIssue.inclusive, "max", path)]
    case "unrecognized_keys":
      if (context === "answer") return [invalidAt(path)]
      return zodIssue.keys.map((key) => checked("unknown_property", { key }, [...path, key]))
    case "custom":
      return [mapCustom(zodIssue.params, path)]
    default:
      return [invalidAt(path)]
  }
}

function isMissing(zodIssue: z.core.$ZodIssue): boolean {
  return Object.hasOwn(zodIssue, "input") && zodIssue.input === undefined
}

const BOUND_CODES = {
  string: { min: "too_short", max: "too_long" },
  number: { min: "too_small", max: "too_big" },
  int: { min: "too_small", max: "too_big" },
  array: { min: "too_few", max: "too_many" },
  set: { min: "too_few", max: "too_many" },
} as const satisfies Record<string, { min: IssueCode; max: IssueCode }>

// Catalogue limits are inclusive, so an exclusive Zod bound (`.gt`, `.lt`, `.positive`) and any
// other origin (`bigint`, `date`, `file`, …) map to `invalid`. Plugins that want a limit code for
// those raise it with `customIssue`.
function mapBound(
  origin: string,
  bound: number | bigint,
  inclusive: boolean | undefined,
  side: "min" | "max",
  path: IssuePath,
): Issue {
  if (inclusive === false || typeof bound !== "number" || !Object.hasOwn(BOUND_CODES, origin)) {
    return invalidAt(path)
  }
  const code = BOUND_CODES[origin as keyof typeof BOUND_CODES][side]
  return checked(code, side === "min" ? { min: bound } : { max: bound }, path)
}

function mapCustom(params: unknown, path: IssuePath): Issue {
  if (!isPlainObject(params)) return invalidAt(path)
  return checked(readOwn(params, "code"), readOwn(params, "params"), path)
}

// Every mapped issue goes through the strict schema; anything that does not parse becomes
// `invalid` at the same path, so no code outside the catalogue can leave the package (AC8).
function checked(code: unknown, params: unknown, path: IssuePath): Issue {
  const parsed = issueSchema.safeParse({ code, params, path })
  return parsed.success ? parsed.data : invalidAt(path)
}

function invalidAt(path: IssuePath): Issue {
  return { code: "invalid", params: {}, path }
}

// Zod paths are `PropertyKey[]`; the catalogue's are strings and finite numbers.
function toPath(zodPath: readonly PropertyKey[]): IssuePath {
  return zodPath.map((key) => {
    if (typeof key === "string") return key
    if (typeof key === "number" && Number.isFinite(key)) return key
    return key.toString()
  })
}

// --- result helpers ----------------------------------------------------------------------------

/** The failure branch of the package's `ok` results. */
export interface Failure {
  readonly ok: false
  readonly issues: readonly Issue[]
}

export function failure(issues: readonly Issue[]): Failure {
  return { ok: false, issues }
}

/** The same issues with `prefix` put in front of each path (e.g. `["fields", 0, "config"]`). */
export function prefixIssues(prefix: IssuePath, issues: readonly Issue[]): Issue[] {
  return issues.map((issue) => ({ ...issue, path: [...prefix, ...issue.path] }))
}

// --- definition errors ---------------------------------------------------------------------------

/**
 * Thrown by `defineField` and `createFieldRegistry` for a broken definition (a programming error
 * at start-up). `issues` is the contract; `message` is only the issue codes, in order, joined by
 * ", " (repeats kept), so it never carries display text, params or paths.
 */
export class FieldDefinitionError extends Error {
  readonly issues: readonly Issue[]

  constructor(issues: readonly Issue[]) {
    super(issues.map((issue) => issue.code).join(", "))
    this.name = "FieldDefinitionError"
    this.issues = Object.freeze([...issues])
  }
}
