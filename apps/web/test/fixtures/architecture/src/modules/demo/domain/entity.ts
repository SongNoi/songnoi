import { z } from "zod"
import type { Result } from "../../../shared/kernel/result"

export const Entity = z.object({ id: z.string() })
export type R = Result<string>
