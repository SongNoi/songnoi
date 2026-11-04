// React preset: hooks rules for packages that render UI.
import reactHooks from "eslint-plugin-react-hooks"
import globals from "globals"

export const react = [
  reactHooks.configs.flat["recommended-latest"] ?? reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
  },
]
