import type { NextConfig } from "next"
import path from "node:path"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const config: NextConfig = {
  output: "standalone",
  // Trace from the monorepo root so workspace packages land in the standalone output.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Workspace packages ship ESM; let Next compile them alongside the app.
  transpilePackages: ["@songnoi/schema", "@songnoi/renderer"],
  poweredByHeader: false,
}

export default withNextIntl(config)
