import * as z from "zod"

// IDs (spec R5, R18; ADR 0012 decision 5; plan "Rules on values" and "IDs"). One rule for
// `fieldId`s and option IDs. This file holds the only copy of the pattern: the Form Schema checks
// `fieldId`s with `idSchema`, and the built-in option fields check option IDs with it through the
// public API.

/**
 * The one ID rule: 1–64 URL-safe characters (`A–Z a–z 0–9 _ -`). A mismatch maps to `invalid`
 * (a space, a `.`, an empty string and 65 characters alike). Reserved values pass this schema;
 * they are refused where they mean something (`fieldId` in the Form Schema, option ID `other` in
 * the option fields).
 */
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)

/**
 * `fieldId`s refused with `reserved_id`: keys that would reach `Object.prototype` if a `fieldId`
 * were ever used as an object key (the answer set is keyed by `fieldId`).
 */
export const RESERVED_FIELD_IDS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
])
