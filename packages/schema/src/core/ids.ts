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

// --- generation (R18) ----------------------------------------------------------------------------

/** RFC 4648 §5 base64url alphabet: index = 6-bit value. */
const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

/** 9 random bytes = 72 bits = exactly 12 base64url characters, no padding. */
const ID_BYTES = 9

/**
 * Generates a new ID for a field or an option (R18): 9 bytes from Web Crypto
 * (`globalThis.crypto.getRandomValues`, available in Node and every browser) encoded as 12
 * base64url characters (`A–Z a–z 0–9 - _`), so 72 random bits without modulo bias. The result
 * always passes `idSchema` and can never be a reserved value (none is 12 characters long). Generate
 * once when the field or option is created; never derive an ID from a label.
 */
export function generateId(): string {
  const bytes = new Uint8Array(ID_BYTES)
  // Read at call time (never cached at module load), so the engine's current Web Crypto is used.
  globalThis.crypto.getRandomValues(bytes)
  let id = ""
  for (let index = 0; index < ID_BYTES; index += 3) {
    // Three bytes (24 bits) give four 6-bit characters, most significant first (byte order).
    const group =
      ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0)
    id +=
      BASE64URL.charAt((group >>> 18) & 63) +
      BASE64URL.charAt((group >>> 12) & 63) +
      BASE64URL.charAt((group >>> 6) & 63) +
      BASE64URL.charAt(group & 63)
  }
  return id
}
