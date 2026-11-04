import type { Locale } from "./config"
import type en from "../../messages/en.json"

export type Messages = typeof en

export async function loadMessages(locale: Locale): Promise<Messages> {
  const mod = (await import(`../../messages/${locale}.json`)) as { default: Messages }
  return mod.default
}
