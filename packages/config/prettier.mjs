import * as tailwind from "prettier-plugin-tailwindcss"

/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  semi: false,
  // Pass the plugin object (not its name) so it resolves from this package, not the caller.
  plugins: [tailwind],
}
