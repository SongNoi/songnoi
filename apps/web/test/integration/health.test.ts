import { afterAll, describe, expect, it } from "vitest"
import "./env"

const { GET } = await import("@/app/api/health/route")
const { createDb } = await import("@/shared/infrastructure/db")
const { healthResponse } = await import("@/shared/infrastructure/health")

describe("GET /api/health", () => {
  const unreachable = createDb("postgresql://nobody:nothing@127.0.0.1:1/none")

  afterAll(async () => {
    await unreachable.$disconnect()
  })

  it("is 200 when Postgres is reachable", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "ok", database: "up" })
  })

  it("is 503 when Postgres is not reachable", async () => {
    const res = await healthResponse(unreachable)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ status: "unavailable", database: "down" })
  })
})
