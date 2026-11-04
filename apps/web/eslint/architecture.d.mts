import type { Linter } from "eslint"

export function architecture(options: {
  rootPath: string
  tsconfig: string
  files?: string[]
}): Linter.Config[]
