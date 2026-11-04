## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## Work item

- Folder: `docs/work/<NNN-slug>/` (or "chore — no work item")
- Roadmap phase: MVP / Phase 2 / Phase 3

## Checklist (see REVIEW.md)

- [ ] Every acceptance criterion is proven by a test or check named in `plan.md`
- [ ] `plan.md` / `tasks.md` match what was built
- [ ] Constitution holds: schema-first, `defineField` dogfooding, self-host (no third-party
      calls), admin/respondent separation, no in-house BI
- [ ] Architecture: boundaries lint passes; mutations use `defineAction`; no new route handler
      outside the allow-list
- [ ] UI text in `messages/en.json` and `messages/th.json`; Thai renders correctly
- [ ] Changeset added if `@songnoi/schema` or `@songnoi/renderer` changed
- [ ] No secrets, tokens or `.env` values

## How I tested

<!-- Commands run and anything checked by hand. -->
