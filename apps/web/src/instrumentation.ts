// Runs once when the Next.js server starts: fail fast on a bad environment (spec R16).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("./env")
    getEnv()
  }
}
