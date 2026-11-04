/** @type {import("@commitlint/types").UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allow the long Co-Authored-By / session trailers used by tooling.
    "footer-max-line-length": [0],
    "body-max-line-length": [0],
  },
}
