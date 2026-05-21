---
description: 'Next.js conventions for this project. Canonical guidance lives in docs/agents/nextjs.md.'
applyTo: 'web/**/*.tsx,web/**/*.ts,web/**/*.jsx,web/**/*.js,web/**/*.css,web/**/*.mjs'
---

# Next.js Conventions

Use `docs/agents/nextjs.md` as the canonical guide. Key rules:

- Keep client-only behavior in Client Components.
- Do not use `next/dynamic` with `{ ssr: false }` inside Server Components.
- Treat request APIs such as `cookies()` and `headers()` as async.
- Prefer Cache Components over legacy cache helpers.
- Do not call your own Route Handlers from Server Components.
