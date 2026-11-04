import type { NextConfig } from "next"

const config: NextConfig = {
  output: "standalone",
  // Workspace packages ship ESM; let Next compile them alongside the app.
  transpilePackages: ["@songnoi/schema", "@songnoi/renderer"],
  poweredByHeader: false,
}

export default config
