# ADR 0011 — File field and object storage in MVP

Status: Proposed — waits for the owner to update brief §5 and §10 · Date: 2026-11-04 ·
Work items: `001-field-core`, `002-renderer`, `006-file-uploads`

## Context

Brief §3 picks S3-compatible storage (RustFS for self-host) but brief §5 lists 8 built-in
fields with no file field, and §10 never schedules one. The owner decided to add `file` as the
9th built-in field in MVP so the stack is complete from the first release.

## Decision

- **Field** (updated 2026-11-05): `file` is defined with `defineField` like every built-in
  (ADR 0007). Config: `maxFiles` (default 1), optional `maxSize` in bytes, optional
  `allowedTypes` (MIME types, `type/*` allowed). The answer is a **list of opaque file IDs** —
  references to upload records, never the bytes and never file metadata. Storage key, name,
  size and type live with the upload record (`006`). `storeAs: "text"` with one stored value
  (one `Answer` row) per file ID; `summarize: "count"`; not groupable. `toCell` joins the IDs
  in answer order with `; `; `007` turns them into file names and admin download paths when it
  builds the CSV.
- **Untrusted IDs:** `@songnoi/schema` checks only the shape and count of the ID list. `005` /
  `006` must check that each ID is a pending upload of this respondent for this field and passed
  its size and type limits before submit links it.
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

## Change log

- 2026-11-04 — first version, Proposed (owner interview, ADR 0006).
- 2026-11-05 — the answer is a list of file IDs stored as one `text` value per file
  (`storeAs: "text"`, not `"none"`); `toCell` writes the IDs and `007` resolves names and
  download paths; file metadata lives with the upload record (owner decision 6, spec `001`
  Flag 4). Still Proposed until the brief amendment of spec `001` Flag 1.
