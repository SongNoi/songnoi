import { getDb } from "@/shared/infrastructure/db"
import { healthResponse } from "@/shared/infrastructure/health"

export const dynamic = "force-dynamic"

export function GET(): Promise<Response> {
  return healthResponse(getDb())
}
