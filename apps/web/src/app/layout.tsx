import type { Metadata } from "next"
import { Kanit } from "next/font/google"
import type { ReactNode } from "react"
import "./globals.css"

// next/font downloads Kanit at build time and serves it from this app: no runtime font CDN.
const kanit = Kanit({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-kanit",
  display: "swap",
})

export const metadata: Metadata = {
  title: "SongNoi",
  description: "A self-hosted form builder. Just send it. Your data stays home.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={kanit.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
