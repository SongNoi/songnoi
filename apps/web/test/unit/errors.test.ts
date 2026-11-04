import { z } from "zod"
import { describe, expect, it } from "vitest"
import { AppException, httpStatus, toAppError } from "@/shared/kernel/app-error"

describe("toAppError", () => {
  it("maps a ZodError to VALIDATION_FAILED with field paths", () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 })
    expect(result.success).toBe(false)
    const error = toAppError(result.error)
    expect(error.code).toBe("VALIDATION_FAILED")
    expect(error.details).toEqual([{ path: ["name"], message: expect.any(String) as string }])
  })

  it("keeps an AppException as is", () => {
    expect(toAppError(new AppException("NOT_FOUND", "Form not found"))).toEqual({
      code: "NOT_FOUND",
      message: "Form not found",
    })
  })

  it("hides unexpected errors behind INTERNAL", () => {
    const error = toAppError(new Error("connection string postgres://secret@db leaked"))
    expect(error.code).toBe("INTERNAL")
    expect(JSON.stringify(error)).not.toContain("secret")
  })

  it("maps codes to HTTP statuses for route handlers", () => {
    expect(httpStatus("VALIDATION_FAILED")).toBe(400)
    expect(httpStatus("UNAUTHORIZED")).toBe(401)
    expect(httpStatus("INTERNAL")).toBe(500)
  })
})
