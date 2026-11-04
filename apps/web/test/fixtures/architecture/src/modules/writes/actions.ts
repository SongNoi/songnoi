"use server"
import { defineAction } from "../../shared/action/define-action"
import { db } from "../../shared/infrastructure/db"

export const wipe = defineAction({ auth: "admin", handler: () => db })
