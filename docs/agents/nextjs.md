## Next.js Guidance

### App Router

- Keep client-only behavior in Client Components.
- Do not use `next/dynamic` with `{ ssr: false }` inside Server Components.

### Request APIs

- Treat `cookies()`, `headers()`, and `draftMode()` as async.
- `params` and `searchParams` may be Promises in Server Components. Await them when needed.
- Accessing request data opts routes into dynamic rendering, so isolate dynamic sections carefully.

### Caching

- Prefer Cache Components over legacy cache helpers.
- Use `use cache`, `cacheTag(...)`, and `cacheLife(...)` when caching is intentional.
- Prefer `revalidateTag(tag, "max")` for stale-while-revalidate behavior.
- Use `updateTag(...)` inside Server Actions when immediate consistency is required.

### Route Handlers

- Do not call your own Route Handlers from Server Components.
- Extract shared logic into local modules and call it directly.

### Tooling

- Turbopack is the default development bundler.
- Typed routes are stable and should remain enabled when used.
- Run ESLint via the ESLint CLI rather than `next lint`.

### Repo Rule

- Do not add demo or example files unless the user explicitly asks.
