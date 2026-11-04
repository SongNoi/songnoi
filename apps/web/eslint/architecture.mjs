// Clean-architecture guardrails for apps/web (spec R19, R37, R39; ADR 0005).
// Exported as a function so tests can lint fixture trees with the exact same rules.
import { DEFINE_ACTION_ONLY, USE_SERVER_INLINE } from "@songnoi/config/eslint/server-actions"
import boundaries from "eslint-plugin-boundaries"

const ROUTE_GROUP_ADMIN = "src/app/\\(admin\\)"
const ROUTE_GROUP_RESPOND = "src/app/\\(respond\\)"

/** Folder elements, from the innermost layer outwards. */
const elements = [
  { type: "kernel", pattern: "src/shared/kernel" },
  { type: "domain", pattern: "src/modules/*/domain", capture: ["module"] },
  { type: "application", pattern: "src/modules/*/application", capture: ["module"] },
  { type: "infrastructure", pattern: "src/modules/*/infrastructure", capture: ["module"] },
  { type: "auth", pattern: "src/modules/auth/*", capture: ["world"] },
  { type: "shared-action", pattern: "src/shared/action" },
  { type: "shared-infrastructure", pattern: "src/shared/infrastructure" },
  { type: "shared-ui", pattern: "src/shared/ui" },
  { type: "i18n", pattern: "src/i18n" },
  { type: "app-admin", pattern: ROUTE_GROUP_ADMIN },
  { type: "app-respond", pattern: ROUTE_GROUP_RESPOND },
  { type: "app-api", pattern: "src/app/api" },
].map((e) => ({ partialMatch: false, ...e }))

/** Single files that are architectural units on their own (matched on the full path). */
const fileDescriptors = [
  {
    category: "module-api",
    pattern: "src/modules/*/{actions,queries}.ts",
    capture: ["module", "kind"],
  },
  { category: "composition", pattern: "src/composition.ts" },
  { category: "env", pattern: "src/env.ts" },
  { category: "instrumentation", pattern: "src/instrumentation.ts" },
  { category: "app-root", pattern: "src/app/*.{ts,tsx,css}" },
]

const FILE_TYPES = new Set(fileDescriptors.map((f) => f.category))
/** Selector for an element type or a single-file category. */
const select = (type, captured) =>
  FILE_TYPES.has(type)
    ? { file: captured ? { categories: type, captured } : { categories: type } }
    : { element: captured ? { type, captured } : { type } }
const el = (type, captured) => ({ to: select(type, captured) })
const from = (type) => select(type)
// The module name is captured by the folder element (layers) or by the file (actions/queries).
const sameModule = (type) =>
  el(type, {
    module:
      "{{#if from.element.captured.module}}{{ from.element.captured.module }}{{else}}{{ from.file.captured.module }}{{/if}}",
  })
const external = (source) => ({
  to: { module: { origin: ["external", "core"], ...(source ? { source } : {}) } },
})

// Only these external packages may be used by the pure inner layers.
const PURE_EXTERNALS = ["zod", "@songnoi/schema"]

const policies = [
  { from: from("kernel"), allow: [el("kernel"), external(PURE_EXTERNALS)] },
  {
    from: from("domain"),
    allow: [sameModule("domain"), el("kernel"), external(PURE_EXTERNALS)],
  },
  {
    from: from("application"),
    allow: [
      sameModule("application"),
      sameModule("domain"),
      // Cross-module use goes through the other module's application layer (R37).
      el("application"),
      el("kernel"),
      external(PURE_EXTERNALS),
    ],
  },
  {
    from: from("infrastructure"),
    allow: [
      sameModule("infrastructure"),
      sameModule("application"),
      sameModule("domain"),
      el("kernel"),
      el("shared-infrastructure"),
      external(),
    ],
  },
  {
    from: from("module-api"),
    allow: [
      sameModule("application"),
      sameModule("domain"),
      el("application"), // another module's use cases (R37)
      el("shared-action"),
      el("kernel"),
      el("composition"),
      el("i18n"),
      external(),
    ],
  },
  {
    // Only queries.ts may read with Prisma directly (CQRS-lite, R40). actions.ts must write
    // through application use cases, so it gets no infrastructure access.
    from: { file: { categories: "module-api", captured: { kind: "queries" } } },
    allow: [el("shared-infrastructure")],
  },
  {
    from: from("auth"),
    allow: [
      el("auth", { world: "{{ from.element.captured.world }}" }),
      el("shared-infrastructure"),
      el("kernel"),
      el("env"),
      external(),
    ],
  },
  {
    from: from("shared-action"),
    allow: [el("shared-action"), el("auth"), el("kernel"), el("shared-infrastructure"), external()],
  },
  {
    from: from("shared-infrastructure"),
    allow: [el("shared-infrastructure"), el("kernel"), el("env"), external()],
  },
  { from: from("shared-ui"), allow: [el("shared-ui"), external()] },
  {
    from: from("composition"),
    allow: [
      el("application"),
      el("infrastructure"),
      el("auth"),
      el("shared-infrastructure"),
      el("kernel"),
      external(),
    ],
  },
  { from: from("env"), allow: [external()] },
  { from: from("instrumentation"), allow: [el("env"), external()] },
  { from: { element: { type: "i18n" } }, allow: [el("i18n"), el("kernel"), external()] },
  {
    from: from("app-root"),
    allow: [el("app-root"), el("i18n"), el("shared-ui"), external()],
  },
  {
    from: from("app-admin"),
    allow: [
      el("app-admin"),
      el("app-root"),
      el("module-api"),
      el("auth", { world: "admin" }),
      el("shared-ui"),
      el("i18n"),
      el("kernel"),
      external(),
    ],
  },
  {
    from: from("app-respond"),
    allow: [
      el("app-respond"),
      el("app-root"),
      el("module-api"),
      el("auth", { world: "respondent" }),
      el("shared-ui"),
      el("i18n"),
      el("kernel"),
      external(),
    ],
  },
  {
    from: from("app-api"),
    allow: [
      el("app-api"),
      el("module-api"),
      el("auth"),
      el("composition"),
      el("shared-infrastructure"),
      el("kernel"),
      el("env"),
      external(),
    ],
  },
]

const EXPORT_SHAPE = "Export Server Actions as `export const x = defineAction({...})` (R39)."

/**
 * @param {{ rootPath: string, tsconfig: string, files?: string[] }} options
 */
export function architecture({ rootPath, tsconfig, files = ["src/**/*.{ts,tsx,js,jsx,mjs,cjs}"] }) {
  return [
    {
      files,
      plugins: { boundaries },
      settings: {
        "boundaries/root-path": rootPath,
        "boundaries/elements": elements,
        "boundaries/files": fileDescriptors,
        "boundaries/include": ["src/**/*"],
        "import/resolver": { typescript: { project: tsconfig } },
      },
      rules: {
        "boundaries/dependencies": [
          "error",
          {
            default: "disallow",
            // Also check npm/node imports, so inner layers can't reach frameworks or Prisma.
            checkAllOrigins: true,
            // A local import inside src/ that matches no element is an error, not skipped.
            // (Imports resolving outside src/ are outside `include` and not checked here.)
            checkUnknownLocals: true,
            policies,
            message:
              "{{#if from.element.types}}{{ from.element.types.[0] }}{{else}}{{ from.file.categories.[0] }}{{/if}} may not depend on {{#if to.element.types}}{{ to.element.types.[0] }}{{else if to.file.categories}}{{ to.file.categories.[0] }}{{else}}{{ to.module.source }}{{/if}} (clean architecture, ADR 0005)",
          },
        ],
        "boundaries/no-unknown-files": "error",
      },
    },
    {
      // The "use server" bans for every other file come from @songnoi/config (serverActions).
      files: ["src/modules/*/actions.ts"],
      rules: {
        "no-restricted-syntax": [
          "error",
          // The file-level "use server" is required here, so only the inline form is banned.
          { selector: USE_SERVER_INLINE, message: DEFINE_ACTION_ONLY },
          { selector: "ExportNamedDeclaration > FunctionDeclaration", message: EXPORT_SHAPE },
          {
            selector:
              "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator:not([init.type='CallExpression'][init.callee.name='defineAction'])",
            message: EXPORT_SHAPE,
          },
          // `export let x = defineAction(...)` can be reassigned to an unguarded function.
          {
            selector: "ExportNamedDeclaration > VariableDeclaration[kind!='const']",
            message: EXPORT_SHAPE,
          },
          // A local `defineAction` would shadow the real wrapper.
          {
            selector:
              "VariableDeclarator[id.name='defineAction'], FunctionDeclaration[id.name='defineAction'], ImportSpecifier[local.name='defineAction'][imported.name!='defineAction']",
          },
          // `export { x }`, `export { x } from "..."` and `export *` would publish anything as an
          // action, e.g. a raw use case with no guard.
          { selector: "ExportNamedDeclaration[specifiers.length>0]", message: EXPORT_SHAPE },
          { selector: "ExportAllDeclaration", message: EXPORT_SHAPE },
          {
            selector: "ExportDefaultDeclaration",
            message: "actions.ts must not have a default export (R39).",
          },
        ],
      },
    },
  ]
}
