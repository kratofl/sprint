---
description: 'Tooling conventions for this project. Canonical guidance lives in docs/agents/tooling.md.'
applyTo: '.github/workflows/*.yml,.github/workflows/*.yaml,**/Dockerfile,**/Dockerfile.*,**/*.dockerfile,**/docker-compose*.yml,**/docker-compose*.yaml,**/compose*.yml,**/compose*.yaml,**/*.md'
---

# Tooling & Cross-Cutting Conventions

Use `docs/agents/tooling.md` as the canonical guide. Key rules:

- Pin GitHub Actions to full SHAs.
- Prefer OIDC over long-lived secrets.
- Use multi-stage Docker builds with pinned base images and non-root final users.
- Keep SQL parameterized and inside `api/internal/store/`.
- Profile before optimizing hot paths.
