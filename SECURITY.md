# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Sprint, please report it responsibly.

**Do not open a public issue.** Instead, email the maintainer directly:

- **Email:** [open an issue with the `security` label if no email is available]

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

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
