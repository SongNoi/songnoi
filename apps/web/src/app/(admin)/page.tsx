import { getTranslations } from "next-intl/server"

export default async function HomePage() {
  const t = await getTranslations("admin.home")
  return (
    <main className="space-y-4">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="max-w-prose text-neutral-600">{t("intro")}</p>
    </main>
  )
}
