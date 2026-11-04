---
name: analyze
description: Read-only consistency check across spec.md, plan.md and tasks.md before implementation, run by the artifact-analyzer subagent.
argument-hint: "<NNN-slug>"
disable-model-invocation: true
---

# Analyze artifacts

Input: `docs/work/<NNN-slug>/` (default: newest folder). Requires `spec.md`, `plan.md`,
`tasks.md`.

1. Delegate to the `artifact-analyzer` subagent with the folder path. Do not analyse it
   yourself — an independent read catches what the author misses.
   Choose its `model` and `effort` from "Subagent model and effort" in
   `docs/work/README.md` (default, escalate for high-risk areas, or light work) and pass them
   to the Agent tool; say which you chose and why. An explicit user request overrides it.
2. Relay its report unchanged: findings table (ID, category, severity, location, summary,
   recommendation), coverage summary and constitution alignment.
3. Do **not** edit any file. Offer remediations, each pointing to the step that owns the
   problem: `/spec` or `/clarify` for requirement issues, `/impl-plan` for design issues,
   `/tasks` to regenerate tasks. Apply them only after the user approves, then re-run
   `/analyze` until there are no CRITICAL or HIGH findings.
4. When clean, ask the user to approve implementation (`/implement`).
