import { base } from "@songnoi/config/eslint/base"
import { next } from "@songnoi/config/eslint/next"
import { architecture } from "./eslint/architecture.mjs"

export default [
  { ignores: ["test/fixtures/**"] },
  ...base({ tsconfigRootDir: import.meta.dirname }),
  ...next,
  ...architecture({
    rootPath: import.meta.dirname,
    tsconfig: `${import.meta.dirname}/tsconfig.json`,
  }),
]
