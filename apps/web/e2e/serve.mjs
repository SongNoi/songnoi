// Serves the production standalone build exactly as the Docker image does (static assets
// copied next to server.js), so E2E tests the artifact we ship.
import { cpSync, existsSync } from "node:fs"
import path from "node:path"

const app = path.resolve(import.meta.dirname, "..")
const standalone = path.join(app, ".next/standalone/apps/web")
if (!existsSync(path.join(standalone, "server.js"))) {
  throw new Error("No standalone build found. Run `pnpm build` first.")
}
cpSync(path.join(app, ".next/static"), path.join(standalone, ".next/static"), { recursive: true })
cpSync(path.join(app, "public"), path.join(standalone, "public"), { recursive: true })
process.chdir(standalone)
await import(path.join(standalone, "server.js"))
