// Base ESLint preset: type-aware TypeScript rules for every package.
import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"
import { serverActions } from "./server-actions.mjs"

/** @param {{ tsconfigRootDir: string }} options */
export function base({ tsconfigRootDir }) {
  return tseslint.config(
    {
      ignores: [
        "**/dist/**",
        "**/.next/**",
        "**/.turbo/**",
        "**/coverage/**",
        "**/playwright-report/**",
        "**/test-results/**",
        "**/next-env.d.ts",
      ],
    },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: {
        // CLAUDE.md: no `any` without a comment explaining why — the comment goes on the disable.
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { fixStyle: "inline-type-imports" },
        ],
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      },
    },
    {
      files: ["**/*.{js,mjs,cjs}"],
      extends: [tseslint.configs.disableTypeChecked],
    },
    // Applies to every linted file in every package (apps/web relaxes it for actions.ts only).
    ...serverActions,
  )
}
