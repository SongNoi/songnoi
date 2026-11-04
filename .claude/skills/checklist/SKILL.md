---
name: checklist
description: Generate a requirements-quality checklist ("unit tests for the spec") in docs/work/<NNN-slug>/checklists/.
argument-hint: "<NNN-slug> [focus area]"
disable-model-invocation: true
---

# Requirements-quality checklist

Input: `docs/work/<NNN-slug>/` (first word of `$ARGUMENTS`; default: newest folder). The rest
of `$ARGUMENTS` is an optional focus (e.g. "respondent access", "i18n").

A checklist tests the **requirements**, not the code: is the spec complete, clear,
consistent, measurable and covering edge cases? Never write items like "the button works".

1. Read `spec.md`, `plan.md` (if any), `docs/constitution.md` and the brief.
2. Write `checklists/<focus-slug>.md` (or `checklists/general.md`) with numbered items
   `- [ ] CHK001 <question about the requirements> [Spec §<section> | Gap | Ambiguity | Conflict]`
   grouped under: Completeness, Clarity, Consistency, Measurability, Edge cases,
   Constitution (one item per relevant MUST principle).
3. Do not tick anything. Custom checklists are **reviewer-owned**: `[x]` means the owner (or a
   reviewer they name) judged that criterion satisfied. Claude may evaluate items only when
   explicitly asked, and reports the evaluation instead of ticking.
4. Report the number of items per group and the biggest gaps; suggest `/clarify` for them.

`checklists/requirements.md` is the built-in spec-quality checklist owned by `/spec` and
`/clarify`; do not overwrite it here.
