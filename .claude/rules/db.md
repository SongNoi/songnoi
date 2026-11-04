---
paths:
  - "**/prisma/**"
---

# Database rules

- `Response` always references `FormVersion`, never `Form` directly.
- A published `FormVersion` is immutable. Changes create a new version from `Form.draftSchema`.
- Write `Response` and its `Answer` rows in a single transaction on submit.
- Never edit an applied migration. Add a new migration instead (a hook enforces this).
