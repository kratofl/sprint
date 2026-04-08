# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Sprint, please report it responsibly.

**Do not open a public issue.** Instead, use GitHub's private vulnerability reporting:

👉 [Report a vulnerability](https://github.com/kratofl/sprint/security/advisories/new)

This keeps the details confidential until a fix is ready.

## Response Timeline

- **Acknowledgement:** within 48 hours
- **Initial assessment:** within 1 week
- **Fix or mitigation:** as soon as feasible, depending on severity

## Supported Versions

| Version | Supported |
|---|---|
| Latest on `main` | ✅ |
| Older releases | ❌ |

## Scope

This policy covers the Sprint codebase, including:
- Go API server (`/api`)
- Go desktop app (`/app`)
- Next.js web app (`/web`)
- Shared packages (`/pkg`, `/packages`)
- Docker and deployment configuration

Third-party dependencies are not directly covered, but we monitor them and update as needed.
