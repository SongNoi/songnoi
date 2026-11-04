import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { kanit } from "../fonts"
import "../globals.css"
import { LocaleSwitcher } from "./locale-switcher"

// Root layout of the admin world. The respondent world has its own root layout so its
// <html lang> follows the form, not the admin cookie (ADR 0003).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common")
  return { title: t("appName"), description: t("tagline") }
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  return (
    <html lang={locale} className={kanit.variable}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider>
          <div className="mx-auto min-h-dvh max-w-5xl px-6 py-10">
            <header className="mb-10 flex items-center justify-end">
              <LocaleSwitcher />
            </header>
            {children}
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
