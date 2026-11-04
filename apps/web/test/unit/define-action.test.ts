import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

vi.mock("server-only", () => ({}))

const requireAdmin = vi.fn()
const requireRespondent = vi.fn()
const logError = vi.fn()

vi.mock("@/modules/auth/admin/guard", () => ({ requireAdmin }))
vi.mock("@/modules/auth/respondent/guard", () => ({ requireRespondent }))
vi.mock("@/shared/infrastructure/logger", () => ({ getLogger: () => ({ error: logError }) }))

const { defineAction } = await import("@/shared/action/define-action")
const { AppException } = await import("@/shared/kernel/app-error")

const unauthorized = () => Promise.reject(new AppException("UNAUTHORIZED", "Please sign in."))
const adminSession = { user: { id: "u1", email: "a@example.com" }, session: { id: "s1" } }

beforeEach(() => {
  vi.clearAllMocks()
  requireAdmin.mockImplementation(unauthorized)
  requireRespondent.mockImplementation(unauthorized)
})

describe("defineAction with auth: admin", () => {
  const handler = vi.fn((input: { name: string }) => `hello ${input.name}`)
  const action = defineAction({ auth: "admin", input: z.object({ name: z.string() }), handler })

  it("returns UNAUTHORIZED for a respondent or anonymous caller and never runs the handler", async () => {
    requireRespondent.mockResolvedValue({ user: { id: "r1" } }) // a respondent is signed in…
    const result = await action({ name: "x" }) // …but the admin guard rejects them
    expect(result).toEqual({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Please sign in." },
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it("returns VALIDATION_FAILED for bad input without calling the handler", async () => {
    requireAdmin.mockResolvedValue(adminSession)
    const result = await action({ name: 42 } as unknown as { name: string })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe("VALIDATION_FAILED")
    expect(handler).not.toHaveBeenCalled()
  })

  it("runs the handler with parsed input and the admin session", async () => {
    requireAdmin.mockResolvedValue(adminSession)
    const result = await action({ name: "Mhon" })
    expect(result).toEqual({ ok: true, data: "hello Mhon" })
    expect(handler).toHaveBeenCalledWith({ name: "Mhon" }, { auth: "admin", session: adminSession })
  })
})

describe("defineAction error handling", () => {
  it("maps an unexpected error to INTERNAL, logs it, and does not leak its message", async () => {
    const action = defineAction({
      auth: "public",
      input: z.object({}),
      handler: () => {
        throw new Error("db password is hunter2")
      },
    })
    const result = await action({})
    expect(!result.ok && result.error.code).toBe("INTERNAL")
    expect(JSON.stringify(result)).not.toContain("hunter2")
    expect(logError).toHaveBeenCalledOnce()
  })

  it("passes an expected AppException through without logging it as a failure", async () => {
    const action = defineAction({
      auth: "public",
      input: z.object({}),
      handler: () => {
        throw new AppException("NOT_FOUND", "Form not found")
      },
    })
    expect(await action({})).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "Form not found" },
    })
    expect(logError).not.toHaveBeenCalled()
  })

  it("lets Next.js redirect() propagate instead of turning it into INTERNAL", async () => {
    const { redirect } = await import("next/navigation")
    const action = defineAction({
      auth: "public",
      input: z.object({}),
      handler: () => redirect("/done"),
    })
    await expect(action({})).rejects.toThrow("NEXT_REDIRECT")
    expect(logError).not.toHaveBeenCalled()
  })

  it("public actions do not consult either guard", async () => {
    const action = defineAction({ auth: "public", input: z.object({}), handler: () => 1 })
    expect(await action({})).toEqual({ ok: true, data: 1 })
    expect(requireAdmin).not.toHaveBeenCalled()
    expect(requireRespondent).not.toHaveBeenCalled()
  })
})
