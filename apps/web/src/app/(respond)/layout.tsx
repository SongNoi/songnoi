import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { resolveRespondentLocale } from "@/i18n/resolve-locale"
import { loadMessages } from "@/i18n/messages"
import { kanit } from "../fonts"
import "../globals.css"

// Root layout of the respondent world. It never reads the admin locale cookie: the language
// comes from the form (spec R26). Until forms exist there is no form locale to pass in, so
// this falls back to the default; the form route will move this into f/[slug]/layout.tsx.
export default async function RespondLayout({ children }: { children: ReactNode }) {
  const locale = resolveRespondentLocale(undefined)
  return (
    <html lang={locale} className={kanit.variable}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={await loadMessages(locale)}>
          <div className="mx-auto min-h-dvh max-w-2xl px-4 py-8">{children}</div>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
