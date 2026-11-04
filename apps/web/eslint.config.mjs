import { base } from "@songnoi/config/eslint/base"
import { next } from "@songnoi/config/eslint/next"

export default [...base({ tsconfigRootDir: import.meta.dirname }), ...next]
