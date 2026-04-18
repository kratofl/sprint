## Code Review Skill

Use when the user asks for a review, PR review, or diff review.

### Priorities

- Security issues
- Correctness and regression risks
- Breaking changes and data loss risks
- Missing tests for critical paths
- Significant performance problems

### Review Style

- Findings first, ordered by severity.
- Be specific about file and line references.
- Explain why the issue matters.
- Suggest the smallest credible fix or follow-up.

### Repo-Specific Focus

- Shared contract drift between `pkg/dto` and `packages/types`
- Desktop and web divergence when shared surfaces change
- SQL escaping the `api/internal/store/` boundary
- Wails bindings growing business logic
