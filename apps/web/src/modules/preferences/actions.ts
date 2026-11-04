"use server"

import { cookies } from "next/headers"
import { z } from "zod"
import { LOCALE_COOKIE, LOCALES } from "@/i18n/config"
import { defineAction } from "@/shared/action/define-action"

const ONE_YEAR = 60 * 60 * 24 * 365

/** Remembers the admin UI language (spec R25). Public: it only touches the caller's cookie. */
export const setLocale = defineAction({
  auth: "public",
  input: z.object({ locale: z.enum(LOCALES) }),
  handler: async ({ locale }) => {
    ;(await cookies()).set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: ONE_YEAR,
      sameSite: "lax",
      httpOnly: true,
    })
    return { locale }
  },
})
