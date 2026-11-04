---
paths:
  - "packages/schema/**"
---

# Schema package rules

- Zod first: define the Zod schema, then derive TypeScript types with `z.infer`. Never hand-write
  a type that duplicates a schema.
- Built-in fields must be created with the public `defineField` API, exactly as a third-party
  plugin would. No private registry hooks, internal flags or special-cased field types.
- No runtime React imports here (`import type` is fine). Render/Settings components are passed in
  by consumers so the schema stays usable on the server and outside React.
