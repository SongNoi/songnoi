"use server"
import { defineAction } from "../../shared/action/define-action"
import { useCase } from "./application/use-case"

export const doIt = defineAction({ auth: "admin", handler: useCase })
