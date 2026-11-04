---
paths:
  - "apps/web/**"
  - "packages/renderer/**"
---

# UI rules

- Server Components by default. Add `"use client"` only for state, effects, browser APIs or
  event handlers, and keep the client boundary as low in the tree as possible.
- Full Thai support: correct line breaking and vowel/tone-mark rendering, no truncation that
  splits clusters, Thai-friendly line height, and Thai copy that fits in every layout.
- Use Kanit as the default font in mockups.
- Check every UI change against Nielsen's 10 usability heuristics and list any violations
  (heuristic + where + suggested fix) in your summary.
