"use server"

const defineAction = <T>(f: T) => f

export const x = defineAction(async () => 1)
