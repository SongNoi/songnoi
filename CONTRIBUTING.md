# Contributing to SongNoi

Thanks for helping! SongNoi is small on purpose: we prefer a few features that really work.

## Before you start

1. Read [`docs/project-brief.md`](docs/project-brief.md) (Thai) — it is the source of truth.
2. Read [`docs/standards.md`](docs/standards.md) and the ADRs in [`docs/adr/`](docs/adr/).
3. For anything bigger than a typo or dependency bump, open an issue first.

## Workflow

Every feature lives in `docs/work/<NNN-slug>/` and passes three gates before code:
`intent.md` → `spec.md` (states the roadmap phase) → `plan.md`. See
[`docs/work/README.md`](docs/work/README.md). Small chores can skip straight to a commit.

Bug fixes start with a failing test that reproduces the bug; the fix must not edit that test.

## Setup

```bash
corepack enable
pnpm install          # also installs git hooks (lefthook)
docker compose up -d postgres
```

## Before you push

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration
```

## Commits and releases

- [Conventional Commits](https://www.conventionalcommits.org/) are enforced by commitlint.
- If you change a published package (`@songnoi/schema`, `@songnoi/renderer`), add a changeset:
  `pnpm changeset`.

## Code of Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
