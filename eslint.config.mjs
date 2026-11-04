import { base } from "@songnoi/config/eslint/base"
import { react } from "@songnoi/config/eslint/react"

export default [
  ...base({ tsconfigRootDir: import.meta.dirname }),
  ...react.map((c) => ({ ...c, files: ["packages/renderer/**/*.{ts,tsx}"] })),
]
