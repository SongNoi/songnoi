# ADR 0008 — Background jobs with pg-boss

Status: Accepted · Date: 2026-11-04 · Work items: `005-respond`, `006-file-uploads`,
`007-export-webhook`

## Context

MVP needs work that must survive restarts and outlive a request: webhook delivery after a
submit (brief §8), and cleanup of abandoned file uploads (ADR 0011). Sending a webhook
directly after commit loses it when the receiver is down or the server restarts. Self-host
first (brief §2) argues against adding Redis or another service to Docker Compose.

## Decision

- Use **pg-boss** as the job queue. It stores jobs in its own schema (`pgboss`) in the
  existing Postgres, so Compose gains no new service.
- **Enqueue inside the submit transaction.** The `deliver-webhook` job is created in the same
  transaction as `Response` + `Answer`, so a response never exists without its delivery job and
  vice versa. pg-boss accepts a custom `db` executor; `005` wraps the Prisma interactive
  transaction in it. **Spike first** in `005`: if this cannot be made reliable with Prisma, fall
  back to an outbox table written in the transaction and copied into pg-boss by a job.
- **Worker placement:** in-process, started from `instrumentation.ts`, guarded by
  `WORKER_ENABLED` (default `true`). A large install can later run the same image as a separate
  worker by flipping the flag, with no code change.
- **Webhook delivery** (`007`): JSON payload with `formId`, `formVersion`, `responseId` and
  answers; `X-SongNoi-Signature` HMAC-SHA256 with a per-endpoint secret; retry with exponential
  backoff up to a limit, then dead-letter; every attempt is logged for the owner to see.
- Queue code lives in `shared/infrastructure/jobs`; modules enqueue through a port defined in
  their `application` layer (ADR 0005), never by importing pg-boss directly.

## Consequences

- New dependency `pg-boss` and its own migrations, which run outside Prisma Migrate; `005`
  must decide how both run at startup in Compose.
- `prisma migrate diff` in CI must ignore the `pgboss` schema.
- Delivery is at-least-once: receivers must de-duplicate by `responseId` (documented).
- Brief §3 should list the job queue (brief gap 4 in ADR 0006).
