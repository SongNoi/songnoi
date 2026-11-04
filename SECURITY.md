# Security Policy

## Supported versions

SongNoi is pre-1.0. Only the latest commit on `main` receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue. Report it privately through
[GitHub private vulnerability reporting](https://github.com/SongNoi/songnoi/security/advisories/new).

Include steps to reproduce, the affected version or commit, and the impact you expect. We aim to
acknowledge reports within 7 days.

## Scope notes

SongNoi is self-hosted. Areas we care about most:

- Separation between admin (form creator) and respondent sessions.
- Access to responses and uploaded files.
- Any path that sends user data or files off the host machine.
