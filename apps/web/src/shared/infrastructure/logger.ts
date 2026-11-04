import "server-only"
import { pino, type Logger } from "pino"
import { getEnv } from "@/env"

let instance: Logger | undefined

/** JSON logs to stdout only — no remote transport (spec R18, constitution §3). */
export function getLogger(): Logger {
  instance ??= pino({ level: getEnv().LOG_LEVEL, base: { app: "songnoi" } })
  return instance
}
