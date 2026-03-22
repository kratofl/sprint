# Contributing to Sprint

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Development Setup

### Prerequisites

| Tool | Version |
|---|---|
| [Go](https://go.dev) | ≥ 1.25 |
| [Node.js](https://nodejs.org) | ≥ 20 |
| [pnpm](https://pnpm.io) | ≥ 9 |
| [Wails CLI](https://wails.io) | v2 (desktop app only) |

### Getting started

```bash
git clone https://github.com/kratofl/sprint.git
cd sprint
cp .env.example .env
pnpm install

# Run API server
make dev-api

# Run web app (separate terminal)
make dev-web

# Run all tests
make test
```

See the [README](README.md) for more options including Docker.

## Code Style

### Go
- Format with `gofmt` (enforced by CI)
- Lint with `go vet`
- Follow [Effective Go](https://go.dev/doc/effective_go) conventions
- Run `make fmt` before committing

### TypeScript / React
- Format with Prettier
- Lint with ESLint
- Run `make fmt` before committing

### General
- Comment only when the code isn't self-explanatory
- Prefer composition over inheritance
- Keep functions short and focused

## Commit Messages

Use clear, descriptive commit messages:

```
<type>: <short summary>

<optional body>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`

Examples:
- `feat: add iRacing game adapter`
- `fix: correct tire temp mapping in LMU adapter`
- `docs: update quick start for Docker`

## Branch Naming

```
feat/<short-description>
fix/<short-description>
docs/<short-description>
refactor/<short-description>
```

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes, ensuring tests pass (`make test`)
3. Run lint and format (`make lint && make fmt`)
4. Write a clear PR description explaining what and why
5. Reference any related issues

### PR Checklist

- [ ] Code compiles cleanly (`make build`)
- [ ] Tests pass (`make test`)
- [ ] Linting passes (`make lint`)
- [ ] Code is formatted (`make fmt`)
- [ ] Documentation updated if applicable

## Adding a New Game

See the [README](README.md#adding-a-new-game) for the step-by-step guide. In short:

1. Create `pkg/games/<gamename>/`
2. Implement the `GameAdapter` interface
3. Map raw data to the unified DTO
4. Register in the coordinator

## Questions?

Open an issue or start a discussion — we're happy to help.
