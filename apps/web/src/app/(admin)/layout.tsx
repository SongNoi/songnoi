import type { ReactNode } from "react"

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto min-h-dvh max-w-5xl px-6 py-10">{children}</div>
}
