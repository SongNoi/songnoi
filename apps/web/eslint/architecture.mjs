// Clean-architecture guardrails for apps/web (spec R19, R37, R39; ADR 0005).
// Exported as a function so tests can lint fixture trees with the exact same rules.
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
      el("shared-action"),
      el("shared-infrastructure"), // queries.ts may read with Prisma directly (R40)
      el("kernel"),
      el("composition"),
      external(),
    ],
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
  { from: { element: { type: "i18n" } }, allow: [el("i18n"), el("kernel"), external()] },
  {
    from: from("app-root"),
    allow: [el("app-root"), el("i18n"), el("shared-ui"), external()],
  },
  {
    from: from("app-admin"),
    allow: [
      el("app-admin"),
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

const USE_SERVER_INLINE = ":function > BlockStatement > ExpressionStatement[directive='use server']"

/**
 * @param {{ rootPath: string, tsconfig: string, files?: string[] }} options
 */
export function architecture({ rootPath, tsconfig, files = ["src/**/*.{ts,tsx}"] }) {
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
            // A local import that matches no element is a mistake, not something to skip.
            checkUnknownLocals: true,
            policies,
            message:
              "{{#if from.element.types}}{{ from.element.types.[0] }}{{else}}{{ from.file.categories.[0] }}{{/if}} may not depend on {{#if to.element.types}}{{ to.element.types.[0] }}{{else if to.file.categories}}{{ to.file.categories.[0] }}{{else}}{{ to.module.source }}{{/if}} (clean architecture, ADR 0005)",
          },
        ],
        "boundaries/no-unknown-files": "error",
        // Inline "use server" functions bypass defineAction's auth + validation (R39).
        "no-restricted-syntax": [
          "error",
          {
            selector: USE_SERVER_INLINE,
            message: "Create Server Actions with defineAction in a module's actions.ts (R39).",
          },
        ],
      },
    },
    {
      files: files.map(() => "src/modules/*/actions.ts"),
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            selector: USE_SERVER_INLINE,
            message: "Create Server Actions with defineAction in a module's actions.ts (R39).",
          },
          {
            selector: "ExportNamedDeclaration > FunctionDeclaration",
            message: "Export Server Actions as `export const x = defineAction({...})` (R39).",
          },
          {
            selector:
              "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator:not([init.type='CallExpression'][init.callee.name='defineAction'])",
            message: "Export Server Actions as `export const x = defineAction({...})` (R39).",
          },
          {
            selector: "ExportDefaultDeclaration",
            message: "actions.ts must not have a default export (R39).",
          },
        ],
      },
    },
  ]
}
