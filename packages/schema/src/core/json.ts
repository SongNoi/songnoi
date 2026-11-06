// Helpers for reading untrusted JSON-like values without ever consulting `Object.prototype`
// (a key such as `toString` or `__proto__` must only ever see the object's own properties).

/**
 * True for a plain object: what `JSON.parse` returns for `{…}`, an object literal or an
 * `Object.create(null)` object. Arrays, `null`, class instances, `Map`, `Date` and functions are
 * not plain objects. An object whose prototype is another realm's `Object.prototype` counts too,
 * so the check needs no `instanceof`.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype || Object.getPrototypeOf(proto) === null
}

/** True when `key` is an own property of `object` (never an inherited one). */
export function hasOwnKey(object: object, key: PropertyKey): boolean {
  return Object.hasOwn(object, key)
}

/** The value of `object`'s own property `key`, or `undefined` when it has none. */
export function readOwn(object: object, key: PropertyKey): unknown {
  return Object.hasOwn(object, key) ? (object as Record<PropertyKey, unknown>)[key] : undefined
}

/** A short developer-facing description of an untrusted value, for plugin-fault messages. */
export function describeValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value)
  if (value === null) return "null"
  if (Array.isArray(value)) return "an array"
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return `a value of type ${typeof value}`
}
