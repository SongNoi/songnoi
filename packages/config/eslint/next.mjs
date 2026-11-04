// Next.js preset: React rules plus Next's own core-web-vitals rules.
import nextPlugin from "@next/eslint-plugin-next"
import { react } from "./react.mjs"

export const next = [
  ...react,
  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
]
