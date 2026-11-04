import { getRespondentAuth } from "@/modules/auth/respondent/instance"

// Resolved per request so the build never needs auth secrets.
export const GET = (req: Request) => getRespondentAuth().handler(req)
export const POST = (req: Request) => getRespondentAuth().handler(req)
