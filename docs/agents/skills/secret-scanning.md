## Secret Scanning Skill

Use when configuring secret scanning, push protection, or remediating secret alerts.

### Scope

- GitHub secret scanning settings
- `.github/secret_scanning.yml`
- remediation steps for leaked credentials

### Rules

- Prefer prevention with push protection.
- Revoke and rotate real secrets, not just delete them from the visible diff.
- Use exclusions sparingly and document why they exist.
- Keep repo-specific patterns and remediation steps explicit.

### Verify

- whether the repository type supports the feature set in question
- whether push protection is enabled
- whether exclusions are justified
- whether remediation includes credential rotation
