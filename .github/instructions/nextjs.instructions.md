---
description: 'Next.js 16 App Router conventions for this project: server/client boundaries, caching, async APIs, and tooling.'
applyTo: 'web/**/*.tsx,web/**/*.ts,web/**/*.jsx,web/**/*.js,web/**/*.css,web/**/*.mjs'
---

# Next.js Conventions (App Router, Next.js 16)

## Server and Client Component Integration

**Never use `next/dynamic` with `{ ssr: false }` inside a Server Component.** This causes a build/runtime error.

Instead: move all client-only logic into a dedicated Client Component (with `'use client'` at the top) and import it directly in the Server Component. No `next/dynamic` needed.

```tsx
// Server Component
import DashboardNavbar from "@/components/DashboardNavbar";

export default async function DashboardPage() {
  return (
    <>
      <DashboardNavbar /> {/* Client Component */}
    </>
  );
}
```

## Async Request APIs (Next.js 16)

- `cookies()`, `headers()`, and `draftMode()` are **async** in Server Components and Route Handlers.
- `params` / `searchParams` may be Promises in Server Components — always `await` them.
- Accessing request data opts the route into dynamic rendering. Isolate dynamic parts behind `Suspense` boundaries.

## Caching and Revalidation (Cache Components)

- Enable via `cacheComponents: true` in `next.config.*`.
- Use the **`use cache`** directive to opt a component/function into caching.
- Use `cacheTag(...)` for tag association and `cacheLife(...)` for lifetime control.
- Prefer `revalidateTag(tag, 'max')` (stale-while-revalidate). The single-argument form is legacy.
- Use `updateTag(...)` inside Server Actions for immediate consistency.
- **Avoid `unstable_cache`** — treat it as legacy, migrate to Cache Components.

## Route Handlers

- **Do not call your own Route Handlers from Server Components** (`fetch('/api/...')`). Extract shared logic into `lib/` modules and call directly to avoid extra server hops.

## Tooling (Next.js 16)

- **Turbopack** is the default dev bundler. Configure via `turbopack` field in `next.config.*` (not `experimental.turbo`).
- **Typed routes** are stable via `typedRoutes`.
- Run ESLint via the ESLint CLI (not `next lint`).

## Project Rules

- Do **not** create example/demo files (like `ModalExample.tsx`) unless explicitly requested. Keep the repo production-focused.
- For every Next.js request, search for the most up-to-date documentation first.
