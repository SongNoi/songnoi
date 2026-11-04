import "server-only"
import { unstable_rethrow } from "next/navigation"
import type { z } from "zod"
import { requireAdmin, type AdminSession } from "@/modules/auth/admin/guard"
import { requireRespondent, type RespondentSession } from "@/modules/auth/respondent/guard"
import { getLogger } from "@/shared/infrastructure/logger"
import { AppException, toAppError } from "@/shared/kernel/app-error"
import { fail, ok, type ActionResult } from "@/shared/kernel/result"

/** Who may call an action. Required on every action: there is no default (spec R39). */
export type ActionAuth = "admin" | "respondent" | "public"

export type ActionContext<A extends ActionAuth> = A extends "admin"
  ? { auth: "admin"; session: AdminSession }
  : A extends "respondent"
    ? { auth: "respondent"; session: RespondentSession }
    : { auth: "public"; session: null }

export interface ActionDefinition<A extends ActionAuth, S extends z.ZodType, R> {
  /** Server Actions are public HTTP endpoints, so the caller's world must always be stated. */
  auth: A
  /** Validates the raw client input before the handler sees it. */
  input: S
  handler: (input: z.output<S>, ctx: ActionContext<A>) => Promise<R> | R
}

async function authenticate<A extends ActionAuth>(auth: A): Promise<ActionContext<A>> {
  switch (auth) {
    case "admin":
      return { auth, session: await requireAdmin() } as ActionContext<A>
    case "respondent":
      return { auth, session: await requireRespondent() } as ActionContext<A>
    default:
      return { auth: "public", session: null } as ActionContext<A>
  }
}

/**
 * The only way to create a Server Action (spec R39, ADR 0005): guard → validate → handler.
 * Always resolves to an ActionResult; nothing is thrown to the client, and unexpected errors
 * are logged on the server and returned as a generic INTERNAL error.
 */
export function defineAction<A extends ActionAuth, S extends z.ZodType, R>(
  definition: ActionDefinition<A, S, R>,
): (input: z.input<S>) => Promise<ActionResult<R>> {
  return async (raw) => {
    try {
      const ctx = await authenticate(definition.auth)
      const parsed = definition.input.safeParse(raw)
      if (!parsed.success) return fail(toAppError(parsed.error))
      return ok(await definition.handler(parsed.data, ctx))
    } catch (error) {
      // Let Next.js control flow (redirect(), notFound(), forbidden()…) propagate.
      unstable_rethrow(error)
      if (!(error instanceof AppException)) {
        getLogger().error({ err: error, auth: definition.auth }, "server action failed")
      }
      return fail(toAppError(error))
    }
  }
}
