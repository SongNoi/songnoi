import "server-only"
import { headers as nextHeaders } from "next/headers"
import { AppException } from "@/shared/kernel/app-error"
import { getRespondentAuth, type RespondentAuth } from "./instance"

export type RespondentSession = NonNullable<
  Awaited<ReturnType<RespondentAuth["api"]["getSession"]>>
>

/** The respondent session for these request headers, or null. Reads only the respondent cookie. */
export async function getRespondentSession(
  headers?: Headers,
  auth: RespondentAuth = getRespondentAuth(),
): Promise<RespondentSession | null> {
  return auth.api.getSession({ headers: headers ?? (await nextHeaders()) })
}

/** Throws UNAUTHORIZED (HTTP 401) unless the request carries a valid respondent session (R22). */
export async function requireRespondent(
  headers?: Headers,
  auth: RespondentAuth = getRespondentAuth(),
): Promise<RespondentSession> {
  const session = await getRespondentSession(headers, auth)
  if (!session) throw new AppException("UNAUTHORIZED", "Please sign in to answer this form.")
  return session
}
