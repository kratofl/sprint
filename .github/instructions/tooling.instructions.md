---
description: 'Project-specific rules for CI/CD workflows, Docker images, security, performance, and documentation.'
applyTo: '.github/workflows/*.yml,.github/workflows/*.yaml,**/Dockerfile,**/Dockerfile.*,**/*.dockerfile,**/docker-compose*.yml,**/docker-compose*.yaml,**/compose*.yml,**/compose*.yaml,**/*.md'
---

# Tooling & Cross-Cutting Conventions

## GitHub Actions

- **Pin all actions to a full-length commit SHA** with a human-readable version comment (e.g., `uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2`). Tags like `@v4` or `@main` are mutable and vulnerable to supply chain attacks.
- Set `permissions: contents: read` as workflow-level default; override per-job only when needed.
- Workflows live in `.github/workflows/`: `ci.yml` (lint + test + build on PR) and `desktop-release.yml` (build desktop + API, attach to GitHub Release).
- Use OIDC for cloud authentication instead of long-lived secrets where possible.
- Use `actions/cache` with `hashFiles` keys for `node_modules` and Go module caches.

## Docker

- Use **multi-stage builds** for both Go (compile → scratch/alpine) and Node (build → alpine).
- Base images: Alpine variants, pinned to specific versions (not `latest`).
- Run as a **non-root user** in the final stage.
- Combine `RUN` commands and clean up in the same layer.
- Keep a comprehensive `.dockerignore` (exclude `.git`, `node_modules`, build artifacts, docs).
- Reference: `docker-compose.yml` at repo root.

## Security

- Passwords: **bcrypt** via `golang.org/x/crypto/bcrypt`.
- All API traffic over HTTPS in production.
- SQL only inside `api/internal/store/` — always use parameterized queries.
- Secrets via environment variables or a secrets manager, never hardcoded.
- Authentication middleware in `api/internal/auth/`.

## Performance

- Telemetry pipeline targets **30 Hz** (~33 ms per frame) for VoCore + frontend updates.
- Dashboard image rendering is the hot path — minimize allocations, use `sync.Pool` for reusable buffers.
- Use `atomic.Pointer[T]` / `atomic.Bool` for state read on every render tick (latest frame, flags).
- Preallocate slices when size is known; avoid unbounded buffering for large payloads.
- Profile with `pprof` before optimizing; benchmark critical paths with `testing.B`.

## Markdown / Documentation

- Use `##` (H2) and `###` (H3) for structure; no H1 (generated from title).
- Use fenced code blocks with language specifier for syntax highlighting.
- Keep lines under 120 characters for readability.
