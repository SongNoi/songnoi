import { cookies } from "next/headers"
import { getRequestConfig } from "next-intl/server"
import { LOCALE_COOKIE } from "./config"
import { resolveAdminLocale } from "./resolve-locale"
import { loadMessages } from "./messages"

// No locale in the URL (spec R24). Respondent pages pass their form's locale explicitly
// (`getTranslations({ locale })`); everything else uses the admin's cookie.
export default getRequestConfig(async ({ locale }) => {
  const resolved = locale ?? resolveAdminLocale((await cookies()).get(LOCALE_COOKIE)?.value)
  return { locale: resolved, messages: await loadMessages(resolveAdminLocale(resolved)) }
})
