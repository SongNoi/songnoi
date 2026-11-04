import { ZodError } from "zod"

/** Error codes shared by Server Actions and route handlers (spec R17). */
export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL",
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export interface AppError {
  code: ErrorCode
  message: string
  details?: unknown
}

/** Throw this from domain/application code for an expected, user-facing failure. */
export class AppException extends Error {
  readonly error: AppError

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = "AppException"
    this.error = details === undefined ? { code, message } : { code, message, details }
  }
}

export const INTERNAL_ERROR: AppError = {
  code: "INTERNAL",
  message: "Something went wrong. Please try again.",
}

/**
 * Converts anything thrown into an AppError that is safe to send to a client.
 * Unexpected errors become INTERNAL with a generic message; the caller logs the original.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppException) return error.error
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_FAILED",
      message: "Some fields are invalid.",
      details: error.issues.map((i) => ({ path: i.path.map(String), message: i.message })),
    }
  }
  return INTERNAL_ERROR
}

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
}

/** HTTP status for route handlers returning an AppError as JSON. */
export const httpStatus = (code: ErrorCode): number => HTTP_STATUS[code]
