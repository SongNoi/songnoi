import type { AppError } from "./app-error"

/** What every Server Action returns; actions never throw to the client (spec R17, R39). */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: AppError }

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data })
export const fail = (error: AppError): ActionResult<never> => ({ ok: false, error })
