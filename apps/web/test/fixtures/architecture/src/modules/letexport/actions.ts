"use server"
import { defineAction } from "../../shared/action/define-action"

export let x = defineAction({ auth: "admin" })
x = defineAction({ auth: "public" })
