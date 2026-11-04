import { DEFAULT_LOCALE, isLocale, type Locale } from "./config"

/** Admin pages: the language the admin picked (cookie), else the default (spec R25). */
export const resolveAdminLocale = (cookieValue: string | undefined): Locale =>
  isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE

/**
 * Respondent pages: the language the form owner chose for the form, else the default.
 * The respondent's browser language (Accept-Language) is deliberately ignored, so the UI
 * around a form always matches the language of its questions (spec R26).
 */
export const resolveRespondentLocale = (formLocale: string | null | undefined): Locale =>
  isLocale(formLocale) ? formLocale : DEFAULT_LOCALE
