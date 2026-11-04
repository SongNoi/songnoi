SongNoi (ส่งหน่อย, "just send it") — a self-hosted form builder

> **Just send it. Your data stays home.**

SongNoi is an open-source form builder you run on your own machine. Your forms, responses and
uploaded files never leave it, and every part — down to the field types — can be customised in
code.

> **Status:** early development. The foundation is in place; form building is not usable yet.

## Quick start (self-host)

```bash
cp .env.example .env   # then set the secrets
docker compose up
```

Open <http://localhost:3000>. Health check: <http://localhost:3000/api/health>.

## Develop

Requirements: Node 24 (see `.nvmrc`), Corepack enabled (`corepack enable`), Docker.

```bash
pnpm install
docker compose up -d postgres minio
pnpm dev
```

| Command | What it does |
|---|---|
| `pnpm lint` / `pnpm format:check` | ESLint and Prettier |
| `pnpm typecheck` | TypeScript across the monorepo |
| `pnpm test` | Unit tests (no database needed) |
| `pnpm test:integration` | Integration tests against Postgres |
| `pnpm build` | Production build |

## Repository layout

```
apps/web/          Next.js app: builder, admin, share links, analytics
packages/schema/   Form schema + defineField (Zod) — the core
packages/renderer/ Renders a form from its schema; usable in other projects
packages/config/   Shared TypeScript / ESLint presets
docs/              Brief, ADRs, standards, feature work
```

Read [`docs/standards.md`](docs/standards.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md) before
opening a pull request.

## License

[MIT](LICENSE). "SongNoi" is the project's name and brand; please don't use it for forks in a
way that suggests they are the official project.
