"use server"
import { useCase } from "../demo/application/use-case"

async function wipe() {
  return useCase(1)
}
export { wipe }
export { useCase as again } from "../demo/application/use-case"
