import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const config: NextConfig = {
  output: "standalone",
  // Workspace packages ship ESM; let Next compile them alongside the app.
  transpilePackages: ["@songnoi/schema", "@songnoi/renderer"],
  poweredByHeader: false,
}

export default withNextIntl(config)
