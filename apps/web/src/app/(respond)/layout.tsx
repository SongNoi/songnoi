import type { ReactNode } from "react"

// Respondent world: never import from (admin) — enforced by eslint-plugin-boundaries.
export default function RespondLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto min-h-dvh max-w-2xl px-4 py-8">{children}</div>
}
