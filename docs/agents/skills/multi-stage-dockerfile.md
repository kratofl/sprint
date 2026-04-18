## Multi-Stage Dockerfile Skill

Use when creating or reviewing Dockerfiles in this repository.

### Rules

- Use multi-stage builds.
- Pin base image versions.
- Keep runtime images minimal.
- Run as non-root in the final image.
- Keep `.dockerignore` effective.

### Sprint-Specific Focus

- Go binaries should build cleanly from the monorepo layout.
- Node builds should copy only the assets needed at runtime.
- Keep image layers ordered for cache efficiency.
