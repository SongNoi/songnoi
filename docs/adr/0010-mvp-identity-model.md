# ADR 0010 — MVP identity model: one owner, password respondents

Status: Accepted · Date: 2026-11-04 · Work items: `003-owner-and-forms`, `005-respond`

## Context

Brief §7 describes workspace roles (Phase 3) and five respondent access modes, of which MVP
needs Public and Login (brief §10). The first real user is the owner replacing Google Forms
(ADR 0006). A self-hosted install may have no SMTP server.

## Decision

**Admin world (MVP)**

- One instance, one owner. When no admin exists, the admin sign-up page creates the **owner**;
  once one exists, admin sign-up is closed. The check and insert run in one transaction with a
  unique guard so two simultaneous first sign-ups cannot both become owner.
- One implicit workspace is created with the owner. Every `Form` still has `workspaceId`, so
  Phase 3 roles and multiple workspaces need no data rewrite.
- No invitations or roles yet; any feature that would need them waits for Phase 3.

**Respondent world (MVP)**

- Login access mode uses **email + password** on the respondent Better Auth instance (ADR 0002).
  Respondent sign-up is open, rate-limited, and does not need SMTP.
- No email verification in MVP, so "Login" proves a returning identity, **not** ownership of an
  email address. The UI must not imply otherwise.
- Phase 2's email-domain restriction does need proven ownership, so it brings optional SMTP
  (verification or magic link). OAuth providers may be added then as opt-in.

## Consequences

- MVP is complete for a single person; a team needs Phase 3.
- Owner password recovery without SMTP needs a CLI or Compose command (`009` documents it).
- Domain-restricted forms are impossible until SMTP exists; that dependency is recorded in
  ADR 0006 Phase 2.
