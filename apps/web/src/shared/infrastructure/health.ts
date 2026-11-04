import "server-only"
import { pingDatabase, type Db } from "./db"

/** Health payload for `GET /api/health` and the Docker healthcheck (spec R20). */
export async function healthResponse(db: Db): Promise<Response> {
  const database = await pingDatabase(db)
  return Response.json(
    { status: database ? "ok" : "unavailable", database: database ? "up" : "down" },
    { status: database ? 200 : 503, headers: { "cache-control": "no-store" } },
  )
}
