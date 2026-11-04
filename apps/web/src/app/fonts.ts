import { Kanit } from "next/font/google"

// next/font downloads Kanit at build time and serves it from this app: no runtime font CDN.
export const kanit = Kanit({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-kanit",
  display: "swap",
})
