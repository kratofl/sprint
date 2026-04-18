## Tooling Guidance

### GitHub Collaboration

- Use `gh` CLI for GitHub issue and PR operations unless the user requests a different tool.
- When an agent works on a GitHub issue, add comments for implementation details, decisions,
  blockers, questions, or other context worth preserving.
- If there is an active or assigned PR for the same work, add the relevant context there too when
  reviewers or future agents would benefit from it.
- Keep GitHub comments durable and high-signal rather than posting routine progress noise.

### GitHub Actions

- Pin every action to a full commit SHA and annotate it with the human-readable version comment.
- Set `permissions: contents: read` at workflow level by default and increase only where needed.
- Prefer OIDC over long-lived cloud secrets.
- Cache Go and Node dependencies with explicit `hashFiles`-based keys.

### Docker

- Use multi-stage builds for Go and Node images.
- Pin base images to concrete versions instead of `latest`.
- Run as a non-root user in final images.
- Keep image layers tight and clean up in the same layer.
- Maintain `.dockerignore` so builds exclude `.git`, dependency folders, build artifacts, and docs.

### Security

- Use bcrypt for password hashing.
- Keep SQL in `api/internal/store/` and always parameterize queries.
- Keep secrets in environment variables or a proper secret manager.

### Performance

- The telemetry pipeline targets 30 Hz.
- Dashboard rendering is a hot path, so avoid extra allocations.
- Use `sync.Pool`, atomics, and preallocation where profiling shows they help.
- Profile before optimizing and benchmark critical paths.

### Markdown

- Use `##` and `###` headings for structure.
- Use fenced code blocks with language tags.
- Keep lines reasonably readable.
