import { getAdminAuth } from "@/modules/auth/admin/instance"

// Resolved per request so the build never needs auth secrets.
export const GET = (req: Request) => getAdminAuth().handler(req)
export const POST = (req: Request) => getAdminAuth().handler(req)
