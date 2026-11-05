// Plain-decimal number cells (spec R11; plan "Number cells: plain decimal, never an exponent").
// Internal to the built-ins: `number` and `rating` cells use it; plugins format their own cells.

/**
 * `n` in plain decimal notation: optional leading `-`, ASCII digits, at most one `.`, no grouping,
 * never an exponent (`1e21` → `1000000000000000000000`, `1e-7` → `0.0000001`, `-0` → `0`).
 *
 * The digits are exactly those of `String(n)` (ECMAScript `Number::toString`: locale-free, the
 * shortest digits that convert back to `n`); only the decimal point moves, by string work alone —
 * no float arithmetic, no `toFixed`, `toPrecision`, `Intl` or `toLocaleString`. So the cell reads
 * back as exactly `n` for every finite `n`. Callers pass finite numbers (Zod numbers are finite).
 */
export function toPlainDecimal(n: number): string {
  const text = String(n)
  const e = text.indexOf("e")
  // No exponent: already plain (0, `-0` as "0", and 1e-6 <= |n| < 1e21).
  if (e === -1) return text

  // Exponent form is `[-]d[.ddd]e(+|-)x`: one digit before the point.
  const sign = text.startsWith("-") ? "-" : ""
  const mantissa = text.slice(sign.length, e)
  const digits = mantissa.replace(".", "")
  // The exponent is a small integer written in decimal; parsing it is exact.
  const point = Number.parseInt(text.slice(e + 1), 10) + 1

  if (point >= digits.length) return sign + digits + "0".repeat(point - digits.length)
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`
}
