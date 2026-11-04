"use server"
import { defineAction } from "./application/passthrough"

export const wipe = defineAction(async () => 1)
