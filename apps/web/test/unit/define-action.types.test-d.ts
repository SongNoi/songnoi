// Compile-time checks for defineAction (spec R39), verified by `pnpm typecheck`:
// if an @ts-expect-error below stops being an error, typecheck fails.
import { z } from "zod"
import { defineAction } from "@/shared/action/define-action"

const input = z.object({ name: z.string() })

// @ts-expect-error -- `auth` is required: every action must state who may call it.
defineAction({ input, handler: () => 1 })

// @ts-expect-error -- only "admin" | "respondent" | "public" are valid.
defineAction({ auth: "anyone", input, handler: () => 1 })

defineAction({
  auth: "admin",
  input,
  handler: (data, ctx) => {
    const name: string = data.name
    const email: string = ctx.session.user.email // admin actions always have a session
    return `${name} ${email}`
  },
})

defineAction({
  auth: "public",
  input,
  handler: (_data, ctx) => {
    const none: null = ctx.session // public actions never have one
    return none
  },
})
