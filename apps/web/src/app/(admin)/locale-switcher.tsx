"use client"

import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/i18n/config"

export function LocaleSwitcher() {
  const t = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function change(next: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span>{t("language")}</span>
      <select
        className="rounded-md border border-neutral-300 bg-white px-2 py-1"
        value={locale}
        disabled={pending}
        onChange={(e) => {
          change(e.target.value as Locale)
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {t(`languages.${l}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
