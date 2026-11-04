import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { TEST_DATABASE_URL } from "./env"

// Spec R21–R22 / ADR 0002: an admin session must never authenticate a respondent request, and
// the reverse — not even with the same email, and not with a cookie renamed to the other world.
const { createDb } = await import("@/shared/infrastructure/db")
const { createAdminAuth } = await import("@/modules/auth/admin/instance")
const { createRespondentAuth } = await import("@/modules/auth/respondent/instance")
const { requireAdmin } = await import("@/modules/auth/admin/guard")
const { requireRespondent } = await import("@/modules/auth/respondent/guard")
const { AppException, httpStatus } = await import("@/shared/kernel/app-error")

const APP_URL = "http://localhost:3000"
const db = createDb(TEST_DATABASE_URL)
const adminAuth = createAdminAuth(db, { APP_URL, ADMIN_AUTH_SECRET: "a".repeat(40) })
const respondentAuth = createRespondentAuth(db, { APP_URL, RESPONDENT_AUTH_SECRET: "r".repeat(40) })

/** Signs up through the real HTTP handler and returns the Cookie header it set. */
async function signUpRequest(
  handler: (r: Request) => Promise<Response>,
  basePath: string,
  email: string,
) {
  return handler(
    new Request(`${APP_URL}${basePath}/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP_URL },
      body: JSON.stringify({ email, password: "correct-horse-battery", name: "Test" }),
    }),
  )
}

async function signUp(handler: (r: Request) => Promise<Response>, basePath: string, email: string) {
  const res = await signUpRequest(handler, basePath, email)
  expect(res.status, await res.clone().text()).toBe(200)
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
}

const withCookie = (cookie: string) => new Headers({ cookie })

async function expectUnauthorized(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  const { code } = (error as InstanceType<typeof AppException>).error
  expect(code).toBe("UNAUTHORIZED")
  expect(httpStatus(code)).toBe(401)
}

let adminCookie = ""
let respondentCookie = ""

beforeAll(async () => {
  await db.$executeRawUnsafe(
    "TRUNCATE admin_user, admin_session, admin_account, admin_verification, respondent_user, respondent_session, respondent_account, respondent_verification CASCADE",
  )
  // Same email in both worlds: they are separate identities in separate tables.
  adminCookie = await signUp(adminAuth.handler, "/api/auth/admin", "same@example.com")
  respondentCookie = await signUp(
    respondentAuth.handler,
    "/api/auth/respondent",
    "same@example.com",
  )
})

afterAll(async () => {
  await db.$disconnect()
})

describe("cookies", () => {
  it("each world sets only its own prefixed cookie", () => {
    expect(adminCookie).toMatch(/^songnoi_admin\./)
    expect(adminCookie).not.toContain("songnoi_respondent")
    expect(respondentCookie).toMatch(/^songnoi_respondent\./)
    expect(respondentCookie).not.toContain("songnoi_admin")
  })
})

describe("own guard accepts own session", () => {
  it("requireAdmin accepts an admin session", async () => {
    const session = await requireAdmin(withCookie(adminCookie), adminAuth)
    expect(session.user.email).toBe("same@example.com")
  })

  it("requireRespondent accepts a respondent session", async () => {
    const session = await requireRespondent(withCookie(respondentCookie), respondentAuth)
    expect(session.user.email).toBe("same@example.com")
  })
})

describe("cross-world sessions are rejected with 401", () => {
  it("an admin session cannot pass requireRespondent", async () => {
    await expectUnauthorized(requireRespondent(withCookie(adminCookie), respondentAuth))
  })

  it("a respondent session cannot pass requireAdmin", async () => {
    await expectUnauthorized(requireAdmin(withCookie(respondentCookie), adminAuth))
  })

  it("an admin cookie renamed to the respondent prefix is still rejected (different secret)", async () => {
    const renamed = adminCookie.replace(/^songnoi_admin\./, "songnoi_respondent.")
    await expectUnauthorized(requireRespondent(withCookie(renamed), respondentAuth))
  })

  it("no cookie at all is rejected by both", async () => {
    await expectUnauthorized(requireAdmin(new Headers(), adminAuth))
    await expectUnauthorized(requireRespondent(new Headers(), respondentAuth))
  })
})

describe("admin sign-up is closed after the first admin (brief §7)", () => {
  it("refuses a second admin sign-up with 403", async () => {
    const res = await signUpRequest(adminAuth.handler, "/api/auth/admin", "intruder@example.com")
    expect(res.status).toBe(403)
    expect(await db.adminUser.count()).toBe(1)
  })

  it("does not affect respondent sign-up", async () => {
    const res = await signUpRequest(
      respondentAuth.handler,
      "/api/auth/respondent",
      "another-respondent@example.com",
    )
    expect(res.status).toBe(200)
  })
})
