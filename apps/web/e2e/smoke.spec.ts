import { expect, test, type Page } from "@playwright/test"

/** Fails the test if the page talks to any origin other than the app itself (spec R31). */
function trackThirdPartyRequests(page: Page, baseURL: string | undefined) {
  if (!baseURL) throw new Error("baseURL is not configured")
  const appOrigin = new URL(baseURL).origin
  const offenders: string[] = []
  page.on("request", (request) => {
    const url = request.url()
    if (url.startsWith("data:") || url.startsWith("blob:")) return
    if (new URL(url).origin !== appOrigin) offenders.push(url)
  })
  return offenders
}

test("home page renders in English by default", async ({ page, baseURL }) => {
  const offenders = trackThirdPartyRequests(page, baseURL)
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome to SongNoi")
  expect(offenders, "third-party requests").toEqual([])
})

test("switching to Thai updates the UI and <html lang>", async ({ page, baseURL }) => {
  const offenders = trackThirdPartyRequests(page, baseURL)
  await page.goto("/")
  await page.getByRole("combobox").selectOption("th")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ยินดีต้อนรับสู่ SongNoi")
  await expect(page.locator("html")).toHaveAttribute("lang", "th")

  // The choice is remembered (cookie set by the setLocale Server Action).
  await page.reload()
  await expect(page.locator("html")).toHaveAttribute("lang", "th")
  expect(offenders, "third-party requests").toEqual([])
})
