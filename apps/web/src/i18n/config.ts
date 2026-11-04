/** Supported UI locales (spec R24). The first one is the default. */
export const LOCALES = ["en", "th"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"

/** Cookie holding the admin's chosen UI language (spec R25). */
export const LOCALE_COOKIE = "songnoi_locale"

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value)
