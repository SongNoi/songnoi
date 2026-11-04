# docs/work

Each feature gets a folder `NNN-slug/` (e.g. `001-define-field`) that moves through three gates:

1. `/intent` — Claude interviews you and writes `intent.md`: problem, outcome, users, constraints.
2. `/spec` — turns intent into `spec.md`: schema impact first, requirements, design, roadmap phase,
   checkable acceptance criteria, and Flags for brief conflicts or BI creep.
3. `/impl-plan` — turns an approved spec into `plan.md`: files, order, risks, proof per criterion.
   Claude stops here until you approve.

Then build and test; keep `plan.md` in sync with what was actually built.
Finally the `spec-reviewer` subagent checks the diff against spec.md and `REVIEW.md`.
Small chores may skip straight to a commit.
