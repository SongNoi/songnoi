import localFont from "next/font/local"

// Kanit (SIL Open Font License, see _fonts/OFL.txt) is bundled with the app: no font CDN at
// runtime and no network at build time, so SongNoi also builds offline (ADR 0003).
export const kanit = localFont({
  src: [
    { path: "./_fonts/Kanit-Light.woff2", weight: "300", style: "normal" },
    { path: "./_fonts/Kanit-Regular.woff2", weight: "400", style: "normal" },
    { path: "./_fonts/Kanit-Medium.woff2", weight: "500", style: "normal" },
    { path: "./_fonts/Kanit-SemiBold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-kanit",
  display: "swap",
})
