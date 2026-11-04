import "server-only"
import { headers as nextHeaders } from "next/headers"
import { AppException } from "@/shared/kernel/app-error"
import { getAdminAuth, type AdminAuth } from "./instance"

export type AdminSession = NonNullable<Awaited<ReturnType<AdminAuth["api"]["getSession"]>>>

/** The admin session for these request headers, or null. Reads only the admin cookie. */
export async function getAdminSession(
  headers?: Headers,
  auth: AdminAuth = getAdminAuth(),
): Promise<AdminSession | null> {
  return auth.api.getSession({ headers: headers ?? (await nextHeaders()) })
}

/** Throws UNAUTHORIZED (HTTP 401) unless the request carries a valid admin session (R22). */
export async function requireAdmin(
  headers?: Headers,
  auth: AdminAuth = getAdminAuth(),
): Promise<AdminSession> {
  const session = await getAdminSession(headers, auth)
  if (!session) throw new AppException("UNAUTHORIZED", "Please sign in as an admin.")
  return session
}
