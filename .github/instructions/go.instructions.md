---
description: 'Go conventions for this project. Canonical guidance lives in docs/agents/go.md.'
applyTo: '**/*.go,**/go.mod,**/go.sum'
---

# Go Conventions

Use `docs/agents/go.md` as the canonical guide. Key rules:

- One `package` declaration per file, matching the directory package.
- `app`, `api`, and `pkg` are linked by `go.work`.
- Keep HTTP clients stateless per request and always close response bodies.
- Use `log/slog`, wrap errors with `%w`, and keep error messages lowercase.
- Prefer atomics for hot-path single-value state and keep platform code in per-OS files.
