# ADR 0002 — Separate auth instances for admins and respondents

Status: Accepted · Date: 2026-11-04 · Work item: `000-foundation`

## Context

Brief §2 and §7: form creators (admins) and people answering forms (respondents) are
separate worlds with separate permissions. A single auth setup separated only by roles relies
on every route remembering a role check; one miss lets a respondent reach admin data.

## Decision

Two Better Auth instances in `apps/web/src/modules/auth/`:

|               | Admin                                                                | Respondent                             |
| ------------- | -------------------------------------------------------------------- | -------------------------------------- |
| Base path     | `/api/auth/admin`                                                    | `/api/auth/respondent`                 |
| Cookie prefix | `songnoi_admin`                                                      | `songnoi_respondent`                   |
| Secret        | `ADMIN_AUTH_SECRET`                                                  | `RESPONDENT_AUTH_SECRET` (must differ) |
| Tables        | `admin_user`, `admin_session`, `admin_account`, `admin_verification` | `respondent_*` equivalents             |
| Guard         | `requireAdmin()`                                                     | `requireRespondent()`                  |

Both use one Postgres database and one Prisma client, mapped to their own models with
Better Auth's `modelName`. Separate Postgres schemas were rejected: Prisma `multiSchema` adds
complexity without adding isolation that cookies, secrets and guards do not already give.

## Consequences

- The same email can exist in both worlds as two unrelated identities.
- A cookie from one world cannot be verified by the other, even if renamed (different secret).
  This is proven by `apps/web/test/integration/auth-isolation.test.ts`.
- ESLint (`eslint-plugin-boundaries`) forbids `modules/auth/respondent` from importing
  `modules/auth/admin` and the reverse, and `(respond)` pages from importing `(admin)`.
- Better Auth telemetry is explicitly disabled in both instances.
- **Admin sign-up is closed after the first admin.** A `databaseHooks.user.create.before` hook
  on the admin instance refuses (403) any new admin once `admin_user` has a row, so a visitor
  or respondent cannot make themselves an admin. The first admin is whoever installs SongNoi;
  inviting further admins is a later work item. Respondent sign-up stays open (per-form
  access modes decide who may answer). Known gap: two simultaneous _first_ sign-ups could both
  pass the check; acceptable for a fresh self-hosted install, revisit with the invite flow.
- Per-form respondent access modes (token link, password, email domain; brief §7) build on
  the respondent instance in later work items.
