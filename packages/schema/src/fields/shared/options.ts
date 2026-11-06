import * as z from "zod"
import { customIssue, idSchema } from "../../api"

// The shared builder of the option fields `choice`, `dropdown` and `checkbox` (spec R13, R14, R9;
// plan "Built-in fields", "Option fields: checkbox limits, option IDs and cells"). Not a field
// type: each of `fields/{choice,dropdown,checkbox}.ts` makes one `defineField` call from these
// parts. Uses only the public API and `zod`.

/** The reserved option ID that marks the "Other" selection; never a configured option's ID. */
export const OTHER = "other"

/** A plain string that is not blank after `trim()`; missing or blank → `required`. Kept verbatim. */
const nonBlankString = z.string().refine((text) => text.trim() !== "", customIssue("required", {}))

/** One option: strict `{ id, label }`; `id` through the public `idSchema`. */
const optionSchema = z.strictObject({ id: idSchema, label: nonBlankString })

/**
 * The option list: at least one entry (`too_few {min: 1}`). Checked once every entry is well
 * formed: `other` → `reserved_id {id}`, a repeat → `duplicate_option_id {optionId}` at the
 * repeat's `id` (a reserved ID never counts as a repeat).
 */
const optionsSchema = z
  .array(optionSchema)
  .min(1)
  .superRefine((options, ctx) => {
    const seen = new Set<string>()
    options.forEach(({ id }, index) => {
      const path = [index, "id"]
      if (id === OTHER) {
        ctx.addIssue({ code: "custom", input: id, path, ...customIssue("reserved_id", { id }) })
      } else if (seen.has(id)) {
        ctx.addIssue({
          code: "custom",
          input: id,
          path,
          ...customIssue("duplicate_option_id", { optionId: id }),
        })
      } else {
        seen.add(id)
      }
    })
  })

// Shared config keys. `otherLabel` is checked for blankness even while `allowOther` is false
// (R13: a blank `otherLabel` is `required`) and kept, so "Other" can be switched back on.
const optionConfigShape = {
  options: optionsSchema,
  allowOther: z.boolean().default(false),
  otherLabel: nonBlankString.optional(),
}

// The shared keys as one object schema, so the "Other" keys' type is derived, not hand-written.
// (`optionConfigSchema` itself cannot be used: its refinement below takes this type.)
const optionConfigBase = z.strictObject(optionConfigShape)

/** The parsed "Other" keys both option configs share. */
type OtherConfig = Readonly<Pick<z.output<typeof optionConfigBase>, "allowOther" | "otherLabel">>

// Zod runs an object refinement only when the keys parsed without an aborting issue, so a missing
// or malformed `options` never reaches the cross-field rules below.
function requireOtherLabel(config: OtherConfig, ctx: z.RefinementCtx): void {
  if (!config.allowOther || config.otherLabel !== undefined) return
  ctx.addIssue({
    code: "custom",
    input: config,
    path: ["otherLabel"],
    ...customIssue("required", {}),
  })
}

/** Config of `choice` and `dropdown`: `{ options, allowOther = false, otherLabel? }`, strict. */
export const optionConfigSchema = optionConfigBase.superRefine(requireOtherLabel)

/**
 * Config of `checkbox`: the shared keys plus optional `minSelections` (int ≥ 0) and
 * `maxSelections` (int ≥ 1), no defaults. Each failing rule gives its own `invalid_range` at
 * `["minSelections"]`: above `maxSelections`, and above the selectable count (options, plus 1
 * when "Other" is allowed). A `maxSelections` above the selectable count never binds and is kept.
 */
export const checkboxConfigSchema = z
  .strictObject({
    ...optionConfigShape,
    minSelections: z.int().min(0).optional(),
    maxSelections: z.int().min(1).optional(),
  })
  .superRefine((config, ctx) => {
    requireOtherLabel(config, ctx)
    const { minSelections, maxSelections } = config
    if (minSelections === undefined) return
    const addRange = (max: number): void => {
      ctx.addIssue({
        code: "custom",
        input: config,
        path: ["minSelections"],
        ...customIssue("invalid_range", { min: minSelections, max }),
      })
    }
    if (maxSelections !== undefined && minSelections > maxSelections) addRange(maxSelections)
    const selectable = config.options.length + (config.allowOther ? 1 : 0)
    if (minSelections > selectable) addRange(selectable)
  })

export type OptionConfig = z.output<typeof optionConfigSchema>

/** The normalised option answer: `optionIds` in answer order, the trimmed "Other" text if chosen. */
const normalisedAnswerSchema = z.strictObject({
  optionIds: z.array(z.string()),
  other: z.string().optional(),
})

export type OptionAnswer = z.output<typeof normalisedAnswerSchema>

/** Selection limits that apply only to an answered field: `choice` / `dropdown` use `max` 1. */
export interface SelectionLimits {
  readonly min?: number | undefined
  readonly max?: number | undefined
}

/**
 * The answer schema (R14): strict `{ optionIds: string[], other?: string }`, where `other` may
 * also arrive as `null` so that `null` reaches the "Other" rules instead of a type error. Issue
 * paths are inside the answer:
 * - `unknown_option {optionId}` at `["optionIds", i]` for an ID that is not an own option of the
 *   config, or `other` while "Other" is off; `duplicate {value}` at the repeat's index;
 * - `too_many {max}` / `too_few {min}` at `["optionIds"]`, "Other" counting as one, only when
 *   something is selected;
 * - with `other` selected and allowed: missing, `null` or blank text → `other_text_required`;
 *   without the selection, any `other` key (even `""` or `null`) → `invalid` at `["other"]`.
 */
export function optionAnswerSchema(
  config: OtherConfig & { readonly options: readonly { readonly id: string }[] },
  limits: SelectionLimits,
): z.ZodType<OptionAnswer> {
  const known = new Set(config.options.map(({ id }) => id))
  return z
    .strictObject({
      optionIds: z.array(z.string()),
      other: z.string().nullable().optional(),
    })
    .superRefine((answer, ctx) => {
      const { optionIds } = answer
      const seen = new Set<string>()
      optionIds.forEach((id, index) => {
        const path = ["optionIds", index]
        if (seen.has(id)) {
          ctx.addIssue({
            code: "custom",
            input: id,
            path,
            ...customIssue("duplicate", { value: id }),
          })
          return
        }
        seen.add(id)
        const allowed = id === OTHER ? config.allowOther : known.has(id)
        if (!allowed) {
          ctx.addIssue({
            code: "custom",
            input: id,
            path,
            ...customIssue("unknown_option", { optionId: id }),
          })
        }
      })

      const count = optionIds.length
      if (count > 0 && limits.max !== undefined && count > limits.max) {
        ctx.addIssue({
          code: "custom",
          input: optionIds,
          path: ["optionIds"],
          ...customIssue("too_many", { max: limits.max }),
        })
      }
      if (count > 0 && limits.min !== undefined && count < limits.min) {
        ctx.addIssue({
          code: "custom",
          input: optionIds,
          path: ["optionIds"],
          ...customIssue("too_few", { min: limits.min }),
        })
      }

      const hasText = Object.hasOwn(answer, "other")
      if (!seen.has(OTHER)) {
        if (hasText) {
          ctx.addIssue({
            code: "custom",
            input: answer.other,
            path: ["other"],
            ...customIssue("invalid", {}),
          })
        }
        return
      }
      // `other` while "Other" is off is already `unknown_option`; its text is not checked then.
      if (config.allowOther && (answer.other ?? "").trim() === "") {
        ctx.addIssue({
          code: "custom",
          input: answer.other,
          path: ["other"],
          ...customIssue("other_text_required", {}),
        })
      }
    })
    .transform(({ optionIds, other }): OptionAnswer => {
      if (!optionIds.includes(OTHER)) return { optionIds }
      return { optionIds, other: (other ?? "").trim() }
    })
    .pipe(normalisedAnswerSchema)
}

/**
 * The empty selection (R9): a plain object whose only own key is `optionIds`, holding an empty
 * array. `{ optionIds: [], other: "x" }` is not unanswered (it is `invalid`).
 */
export function isEmptySelection(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  if (proto !== null && proto !== Object.prototype && Object.getPrototypeOf(proto) !== null) {
    return false
  }
  const keys = Object.keys(value)
  if (keys.length !== 1 || keys[0] !== "optionIds") return false
  const optionIds: unknown = Reflect.get(value, "optionIds")
  return Array.isArray(optionIds) && optionIds.length === 0
}

/**
 * The export cell (R14), joined by `; `: the selected options the given config has, as labels in
 * config order; then the IDs it does not have, as themselves in answer order; then "Other" last as
 * `<otherLabel>: <text>`, or `other: <text>` when the config has no `otherLabel`. Raw text; item
 * 007 quotes cells and neutralises formula injection.
 */
export function optionCell(answer: OptionAnswer, config: OptionConfig): string {
  const selected = new Set(answer.optionIds)
  const known = new Set(config.options.map(({ id }) => id))
  const items = config.options.filter(({ id }) => selected.has(id)).map(({ label }) => label)
  for (const id of answer.optionIds) {
    if (id !== OTHER && !known.has(id)) items.push(id)
  }
  if (selected.has(OTHER)) {
    const text = answer.other ?? ""
    items.push(`${config.otherLabel ?? OTHER}: ${text}`)
  }
  return items.join("; ")
}

/** Stored values (R14, AC7): one `text` value per selected ID in answer order; no "Other" text. */
export function optionStoredValues(answer: OptionAnswer): string[] {
  return [...answer.optionIds]
}
