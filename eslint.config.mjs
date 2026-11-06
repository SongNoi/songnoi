import { builtinModules } from "node:module"
import { base } from "@songnoi/config/eslint/base"
import { react } from "@songnoi/config/eslint/react"
import {
  DEFINE_ACTION_ONLY,
  USE_SERVER_FILE,
  USE_SERVER_INLINE,
} from "@songnoi/config/eslint/server-actions"

// R20 guard rails for @songnoi/schema (spec 001): the package runs unchanged in Node and in the
// browser and never reads the environment, so `src/` may not touch Node, the DOM, React, the local
// time zone or the default locale. Flat config replaces rule options, so `src/fields/**` repeats
// the lists and adds the public-API-only import rule (constitution 2).
const nodeBuiltins = [...new Set(builtinModules.filter((name) => !name.startsWith("_")))]

const noPlatformImports = {
  paths: nodeBuiltins.map((name) => ({
    name,
    message: "@songnoi/schema is isomorphic: no Node built-ins in src/ (R20).",
  })),
  patterns: [
    {
      group: ["node:*"],
      message: "@songnoi/schema is isomorphic: no Node built-ins in src/ (R20).",
    },
    { group: ["react", "react/*", "react-*"], message: "@songnoi/schema has no UI library (R20)." },
  ],
}

const noPlatformGlobals = [
  "process",
  "Buffer",
  "require",
  "global",
  "__dirname",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "navigator",
  "window",
  "document",
  "localStorage",
].map((name) => ({ name, message: "No platform globals in @songnoi/schema src/ (R20)." }))

const noLocalTimeAndLocale = [
  ...[
    "getTimezoneOffset",
    "getYear",
    "getFullYear",
    "getMonth",
    "getDate",
    "getDay",
    "getHours",
    "getMinutes",
    "getSeconds",
    "getMilliseconds",
    "setYear",
    "setFullYear",
    "setMonth",
    "setDate",
    "setHours",
    "setMinutes",
    "setSeconds",
    "setMilliseconds",
    "toLocaleString",
    "toLocaleDateString",
    "toLocaleTimeString",
  ].map((property) => ({
    property,
    message:
      "Local-time and locale APIs depend on the environment; use UTC or explicit Intl (R20).",
  })),
  {
    object: "Date",
    property: "parse",
    message: "Date.parse is engine-dependent; parse the format with a regular expression (R20).",
  },
]

// `Intl.X()` / `new Intl.X()` with no arguments, or with `undefined` or `[]` as the locales
// argument, falls back to the environment's default locale. Always pass an explicit locale (R20,
// T047). A DateTimeFormat without a `timeZone` option still uses the process zone; lint does not
// catch that, so pass `timeZone` explicitly too.
const INTL_DEFAULT_MESSAGE =
  "Intl with no locale reads the environment's default locale or zone; pass an explicit locale (R20)."
// `Intl.getCanonicalLocales` and `Intl.supportedValuesOf` never read the default locale.
const INTL_CALLEE =
  "[callee.type='MemberExpression'][callee.object.name='Intl']" +
  "[callee.property.name!=/^(getCanonicalLocales|supportedValuesOf)$/]"
const noDefaultIntl = ["NewExpression", "CallExpression"].flatMap((node) =>
  [
    "[arguments.length=0]",
    "[arguments.0.type='Identifier'][arguments.0.name='undefined']",
    "[arguments.0.type='ArrayExpression'][arguments.0.elements.length=0]",
  ].map((args) => ({ selector: `${node}${INTL_CALLEE}${args}`, message: INTL_DEFAULT_MESSAGE })),
)

const schemaSrcRules = (extraPatterns = []) => ({
  "no-restricted-imports": [
    "error",
    { paths: noPlatformImports.paths, patterns: [...noPlatformImports.patterns, ...extraPatterns] },
  ],
  "no-restricted-globals": ["error", ...noPlatformGlobals],
  "no-restricted-properties": ["error", ...noLocalTimeAndLocale],
  // Flat config replaces the base preset's `no-restricted-syntax`, so its "use server" ban is
  // spread back in (see @songnoi/config/eslint/server-actions).
  "no-restricted-syntax": [
    "error",
    { selector: USE_SERVER_INLINE, message: DEFINE_ACTION_ONLY },
    { selector: USE_SERVER_FILE, message: DEFINE_ACTION_ONLY },
    ...noDefaultIntl,
  ],
})

export default [
  ...base({ tsconfigRootDir: import.meta.dirname }),
  ...react.map((c) => ({ ...c, files: ["packages/renderer/**/*.{ts,tsx}"] })),
  { files: ["packages/schema/src/**/*.ts"], rules: schemaSrcRules() },
  {
    files: ["packages/schema/src/fields/**/*.ts"],
    rules: schemaSrcRules([
      {
        group: ["**/core/**"],
        message:
          "Built-in fields import only the public API (src/api.ts) and zod (constitution 2).",
      },
    ]),
  },
]
