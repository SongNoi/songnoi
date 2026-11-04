# ADR 0011 — File field and object storage in MVP

Status: Proposed — waits for the owner to update brief §5 and §10 · Date: 2026-11-04 ·
Work items: `001-field-core`, `002-renderer`, `006-file-uploads`

## Context

Brief §3 picks S3-compatible storage (RustFS for self-host) but brief §5 lists 8 built-in
fields with no file field, and §10 never schedules one. The owner decided to add `file` as the
9th built-in field in MVP so the stack is complete from the first release.

## Decision

- **Field:** `file` is defined with `defineField` like every built-in (ADR 0007). Config:
  max files, max size, allowed MIME types. The answer stores file references (storage key,
  name, size, type), never the bytes. `storeAs: "none"`; `toCell` writes file names plus an
  admin download path.
- **Storage:** RustFS joins Docker Compose with its own volume, reachable only on the internal
  network. The app talks to it with an S3 client from `shared/infrastructure`.
- **Transfer through the app:** upload and download stream through `api/files/**` (already
  allow-listed in ADR 0005). No presigned URLs, so storage is never exposed.
- **Lifecycle:** an upload made before submit is `pending`, tied to the form version and the
  respondent's session. Submit links it to the `Response` in the submit transaction. A pg-boss
  job (ADR 0008) deletes pending uploads older than a TTL.
- **Access:** admins download files of their forms; a respondent may read only their own
  pending uploads. Content-Type is taken from a server-side check, not the client header, and
  downloads use `Content-Disposition: attachment`.

## Consequences

- MVP grows by one work item (`006`) and one Compose service; the golden path in `009` includes
  a file.
- Backups must cover two volumes (Postgres and RustFS); `009` documents it.
- Becomes Accepted when the owner amends brief §5 (9 fields) and §10 MVP item 1.
