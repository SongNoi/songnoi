import * as z from "zod"
import type { CellOptions } from "./cell-options"
import { FieldDefinitionError, type Issue, type IssuePath } from "./issues"
import { describeValue, isPlainObject, readOwn } from "./json"

// `defineField` (spec R1, R2; ADR 0007 as amended; plan "defineField"). One public call defines a
// field type; built-ins and plugins use exactly this call. Config and answer types are inferred
// from the Zod schemas and every other member receives them.

// --- analytics data ------------------------------------------------------------------------------

/** R2's stored kinds: what one stored value (one future `Answer` row) is. */
const storeAsSchema = z.enum(["text", "number", "date", "datetime", "none"])

/** R2's closed `summarize` set; item 008 maps each one to a chart. */
const summarizeSchema = z.enum([
  "responses",
  "counts",
  "histogram+stats",
  "distribution+avg",
  "timeline",
  "count",
  "none",
])

/** The stored kind of a field's values: `text`, `number`, `date`, `datetime` or `none`. */
export type StoreAs = z.output<typeof storeAsSchema>

/** How item 008 summarises a field: one of R2's closed set, shared by built-ins and plugins. */
export type Summarize = z.output<typeof summarizeSchema>

// R2 fit rule: the stored kinds each `summarize` accepts.
const FITS: Readonly<Record<Summarize, readonly StoreAs[]>> = {
  responses: ["text"],
  counts: ["text"],
  "histogram+stats": ["number"],
  "distribution+avg": ["number"],
  timeline: ["date", "datetime"],
  count: ["text", "number", "date", "datetime"],
  none: ["none"],
}

/**
 * The type of one stored value of kind `K`: `text` a string, `number` a number, `date` a
 * `YYYY-MM-DD` string, `datetime` an ISO UTC string, and `none` nothing (only `[]` type-checks).
 */
type StoredValueOf<K extends StoreAs> = K extends "number"
  ? number
  : K extends "none"
    ? never
    : string

/** `storeAs`: a fixed kind, or one picked by the parsed config from kinds declared up front. */
type StoreAsRule<Config, K extends StoreAs> =
  | K
  | {
      /** Every kind `pick` may return; checked against `summarize` when the field is defined. */
      readonly kinds: readonly K[]
      pick(config: Config): K
    }

/** Analytics data of a field: data only, no chart code. */
interface FieldAnalytics<Config, K extends StoreAs> {
  readonly storeAs: StoreAsRule<Config, K>
  readonly summarize: Summarize
  readonly groupable: boolean
}

// --- the definition type ---------------------------------------------------------------------------

/** Names of config properties (what `incompatibleChanges` returns). */
type ConfigKeys<Config> = readonly (keyof Config & string)[]

/**
 * A field type, as returned by `defineField` and held by a registry. The defaults are the widened
 * form generic code (registry, Form Schema, response validation) works with: `toCell(answer:
 * unknown, …)` and so on. Function members are method signatures, so a typed definition widens to
 * this type without casts. `isUnanswered` and `incompatibleChanges` are optional here; absence
 * means "no rule", so generic code calls them with `?.`.
 */
export interface FieldDefinition<
  Type extends string = string,
  Config = Record<string, unknown>,
  Answer = unknown,
  K extends StoreAs = StoreAs,
> {
  /** The permanent type string, e.g. `rating` or `acme/signature`. */
  readonly type: Type
  /** The config schema; its output (defaults written in) is the parsed config. */
  readonly config: z.ZodType<Config>
  /** Builds the answer schema from the parsed config; its output is the normalised answer. */
  answer(config: Config): z.ZodType<Answer>
  /** Extra field-specific "no answer" values, checked on the raw value (R9). */
  isUnanswered?(value: unknown, config: Config): boolean
  /** The export cell of a valid answer. Pure; never reads the environment (R1). */
  toCell(answer: Answer, config: Config, options?: CellOptions): string
  /** The stored values of a valid answer, one per future `Answer` row (R2). */
  storedValues(answer: Answer, config: Config): readonly StoredValueOf<K>[]
  /** Config properties whose change makes answers under one `fieldId` incomparable (R19). */
  incompatibleChanges?(previous: Config, next: Config): ConfigKeys<Config>
  /** Analytics data (R2). */
  readonly analytics: FieldAnalytics<Config, K>
}

/** The parsed config type of a field definition, e.g. `FieldConfig<typeof ratingField>`. */
export type FieldConfig<D extends FieldDefinition> = Parameters<D["answer"]>[0]

/** The normalised answer type of a field definition, e.g. `FieldAnswer<typeof ratingField>`. */
export type FieldAnswer<D extends FieldDefinition> = Parameters<D["toCell"]>[0]

type OptionalMembers = "isUnanswered" | "incompatibleChanges"

// Marks an optional member the caller did not provide. A generic inferred from the member falls
// back to this default only when the member is absent, so the return type can drop it (P03).
declare const _absent: unique symbol
type Absent = typeof _absent

/**
 * Defines a field type (R1, R2). `type`, `config` and `answer` drive inference; every other member
 * receives the inferred config and answer types. The returned definition is frozen, and the
 * optional members the caller provided are required on its type.
 *
 * @throws FieldDefinitionError when the definition breaks the checks (`invalid_field_type`,
 *   `invalid`, `incompatible_analytics`); `issues` lists every problem.
 */
export function defineField<
  const Type extends string,
  CS extends z.ZodType<Record<string, unknown>>,
  AS extends z.ZodType,
  const K extends StoreAs,
  R extends ConfigKeys<z.output<CS>> | Absent = Absent,
  B extends boolean | Absent = Absent,
>(input: {
  type: Type
  config: CS
  answer: (config: NoInfer<z.output<CS>>) => AS
  isUnanswered?: (value: unknown, config: NoInfer<z.output<CS>>) => B
  toCell: (
    answer: NoInfer<z.output<AS>>,
    config: NoInfer<z.output<CS>>,
    options?: CellOptions,
  ) => string
  storedValues: (
    answer: NoInfer<z.output<AS>>,
    config: NoInfer<z.output<CS>>,
  ) => readonly StoredValueOf<NoInfer<K>>[]
  incompatibleChanges?: (previous: NoInfer<z.output<CS>>, next: NoInfer<z.output<CS>>) => R
  analytics: {
    storeAs: K | { kinds: readonly K[]; pick: (config: NoInfer<z.output<CS>>) => NoInfer<K> }
    summarize: Summarize
    groupable: boolean
  }
}): Omit<FieldDefinition<Type, z.output<CS>, z.output<AS>, K>, OptionalMembers> &
  ([B] extends [Absent]
    ? unknown
    : { isUnanswered(value: unknown, config: z.output<CS>): boolean }) &
  ([R] extends [Absent]
    ? unknown
    : {
        incompatibleChanges(previous: z.output<CS>, next: z.output<CS>): ConfigKeys<z.output<CS>>
      }) {
  const issues = checkDefinition(input)
  if (issues.length > 0) throw new FieldDefinitionError(issues)

  const { storeAs, summarize, groupable } = input.analytics
  const analytics = Object.freeze({
    storeAs:
      typeof storeAs === "string"
        ? storeAs
        : Object.freeze({ kinds: Object.freeze([...storeAs.kinds]), pick: storeAs.pick }),
    summarize,
    groupable,
  })
  const definition = Object.freeze({
    type: input.type,
    config: input.config,
    answer: input.answer,
    toCell: input.toCell,
    storedValues: input.storedValues,
    ...(input.isUnanswered === undefined ? {} : { isUnanswered: input.isUnanswered }),
    ...(input.incompatibleChanges === undefined
      ? {}
      : { incompatibleChanges: input.incompatibleChanges }),
    analytics,
  })
  // The checks above proved the shape; the conditional return type (which optional members are
  // present) cannot be derived from the object literal by the compiler, hence the cast.
  return definition as unknown as ReturnType<typeof defineField<Type, CS, AS, K, R, B>>
}

/**
 * The stored kind of `definition`'s values for a parsed config (fixed, or picked by config).
 *
 * @throws TypeError when a config-dependent `pick` returns anything that is not one of its
 *   declared `kinds` (a plugin fault, R8: a broken plugin is loud, never a silently wrong kind).
 */
export function storeAsOf<D extends FieldDefinition>(
  definition: D,
  config: FieldConfig<D>,
): StoreAs {
  const { storeAs } = definition.analytics
  if (typeof storeAs === "string") return storeAs
  // A JavaScript plugin (or a cast) may return anything here.
  const picked: unknown = storeAs.pick(config)
  const declared = storeAs.kinds.find((kind) => kind === picked)
  if (declared !== undefined) return declared
  throw new TypeError(
    `Field type "${definition.type}": analytics.storeAs.pick returned ${describeValue(picked)}, ` +
      `which is not one of its declared kinds (${storeAs.kinds.join(", ")}).`,
  )
}

// --- definition checks ---------------------------------------------------------------------------

// R3: lowercase ASCII letters, digits and `-`, optionally one scope and `/`.
const TYPE_PATTERN = /^(?:[a-z0-9-]+\/)?[a-z0-9-]+$/

const REQUIRED_FUNCTIONS = ["answer", "toCell", "storedValues"] as const
const OPTIONAL_FUNCTIONS = [
  "isUnanswered",
  "incompatibleChanges",
] as const satisfies readonly OptionalMembers[]

/**
 * The structural definition checks (plan "Definition checks"), run by `defineField` and again by
 * `createFieldRegistry` because a JavaScript caller can hand-build a definition. No `instanceof`:
 * a config only needs a `safeParse` method, so two Zod copies cannot break the check. Returns every
 * problem, with paths relative to the definition.
 */
export function checkDefinition(value: unknown): Issue[] {
  if (!isPlainObject(value)) return [invalidAt([])]
  const issues: Issue[] = []

  const type = readOwn(value, "type")
  if (typeof type !== "string") issues.push(invalidAt(["type"]))
  else if (!TYPE_PATTERN.test(type))
    issues.push({ code: "invalid_field_type", params: { type }, path: ["type"] })

  if (!hasSafeParse(readOwn(value, "config"))) issues.push(invalidAt(["config"]))

  for (const member of REQUIRED_FUNCTIONS) {
    if (typeof readOwn(value, member) !== "function") issues.push(invalidAt([member]))
  }
  for (const member of OPTIONAL_FUNCTIONS) {
    const rule = readOwn(value, member)
    if (rule !== undefined && typeof rule !== "function") issues.push(invalidAt([member]))
  }

  issues.push(...checkAnalytics(readOwn(value, "analytics")))
  return issues
}

function checkAnalytics(analytics: unknown): Issue[] {
  if (!isPlainObject(analytics)) return [invalidAt(["analytics"])]
  const issues: Issue[] = []

  const kinds = checkStoreAs(readOwn(analytics, "storeAs"), issues)
  const summarize = summarizeSchema.safeParse(readOwn(analytics, "summarize"))
  if (!summarize.success) issues.push(invalidAt(["analytics", "summarize"]))
  if (typeof readOwn(analytics, "groupable") !== "boolean") {
    issues.push(invalidAt(["analytics", "groupable"]))
  }

  // The fit check needs both sides well-formed; a malformed one is already reported.
  if (kinds !== undefined && summarize.success) {
    const fits = FITS[summarize.data]
    for (const kind of new Set(kinds)) {
      if (!fits.includes(kind)) {
        issues.push({
          code: "incompatible_analytics",
          params: { storeAs: kind, summarize: summarize.data },
          path: ["analytics"],
        })
      }
    }
  }
  return issues
}

// Every kind `storeAs` may produce, or `undefined` (with the problems pushed) when it is malformed.
function checkStoreAs(storeAs: unknown, issues: Issue[]): readonly StoreAs[] | undefined {
  const fixed = storeAsSchema.safeParse(storeAs)
  if (fixed.success) return [fixed.data]
  if (!isPlainObject(storeAs)) {
    issues.push(invalidAt(["analytics", "storeAs"]))
    return undefined
  }

  const before = issues.length
  const kinds: StoreAs[] = []
  const declared = readOwn(storeAs, "kinds")
  if (!Array.isArray(declared) || declared.length === 0) {
    issues.push(invalidAt(["analytics", "storeAs", "kinds"]))
  } else {
    const entries: readonly unknown[] = declared
    entries.forEach((entry, index) => {
      const kind = storeAsSchema.safeParse(entry)
      if (kind.success) kinds.push(kind.data)
      else issues.push(invalidAt(["analytics", "storeAs", "kinds", index]))
    })
  }
  if (typeof readOwn(storeAs, "pick") !== "function") {
    issues.push(invalidAt(["analytics", "storeAs", "pick"]))
  }
  return issues.length === before ? kinds : undefined
}

function hasSafeParse(config: unknown): boolean {
  if ((typeof config !== "object" && typeof config !== "function") || config === null) return false
  // A schema object, not untrusted JSON: Zod may put `safeParse` on the prototype chain.
  return typeof Reflect.get(config, "safeParse") === "function"
}

function invalidAt(path: IssuePath): Issue {
  return { code: "invalid", params: {}, path }
}
