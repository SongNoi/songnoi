---
name: review
description: Final independent review of a docs/work/<NNN-slug> feature by the spec-reviewer subagent.
argument-hint: "<NNN-slug>"
disable-model-invocation: true
---

# Review

1. Delegate to the `spec-reviewer` subagent with the folder path (default: newest folder in
   `docs/work/`). Do not review your own work.
   Choose its `model` and `effort` from "Subagent model and effort" in
   `docs/work/README.md` (default, escalate for high-risk areas, or light work) and pass them
   to the Agent tool; say which you chose and why. An explicit user request overrides it.
2. Relay its findings and verdict unchanged.
3. If the verdict is "Changes needed", fix the Important findings (updating `tasks.md` /
   `plan.md` in the same commit when they change), then run `/review` again. Never mark the
   work approved yourself.
