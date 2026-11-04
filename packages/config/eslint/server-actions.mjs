// Server Actions are public HTTP endpoints. In SongNoi the only place allowed to declare them
// is `apps/web/src/modules/*/actions.ts`, through `defineAction` (constitution §10, ADR 0005).
// This preset bans "use server" everywhere; apps/web re-enables the file-level directive for
// actions.ts only, where stricter export rules apply.

export const USE_SERVER_INLINE =
  ":function > BlockStatement > ExpressionStatement[directive='use server']"
export const USE_SERVER_FILE = "Program > ExpressionStatement[directive='use server']"
export const DEFINE_ACTION_ONLY =
  "Create Server Actions with defineAction in apps/web/src/modules/<feature>/actions.ts (R39)."

export const serverActions = [
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: USE_SERVER_INLINE, message: DEFINE_ACTION_ONLY },
        { selector: USE_SERVER_FILE, message: DEFINE_ACTION_ONLY },
      ],
    },
  },
]
