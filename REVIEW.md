# Review checklist

Run these passes in order against the diff and its `docs/work/<NNN-slug>/spec.md`.

## 1. Acceptance criteria

- Every `- [ ]` item in spec.md is implemented **and** proven by a test or check named in plan.md.
- Bug fixes include a failing-first test that was not edited by the fix.
- No work from a later roadmap phase than the spec states.

## 2. Brief rule violations (`docs/project-brief.md` §2, §6, §11)

- Schema is the source of truth; built-in fields go through public `defineField`.
- `Response` references `FormVersion`; published versions immutable; Response + Answer in one
  transaction; applied migrations untouched.
- No in-house BI (pivot tables, custom formulas, drag-drop dashboards), no custom condition
  language (use JSON Logic).

## 3. Security

- Admin and respondent auth stay separate: no shared sessions, roles or routes that let a
  respondent reach admin data or actions.
- No data or files leave the user's machine: no third-party telemetry, CDNs for user content,
  or external storage beyond the self-hosted S3/MinIO.
- No secrets, tokens or `.env` values in the diff.
