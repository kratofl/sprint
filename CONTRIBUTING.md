# Contributing to Sprint

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Development Setup

### Prerequisites

| Tool | Version |
|---|---|
| [Go](https://go.dev) | ≥ 1.26 |
| [Node.js](https://nodejs.org) | ≥ 20 |
| [pnpm](https://pnpm.io) | ≥ 9 |
| [.NET SDK](https://dotnet.microsoft.com/download) | 10.0.x (desktop app only) |

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

### Desktop app (.NET / Avalonia)

The desktop app (`app/Sprint.Desktop.sln`) is a separate .NET 10 solution — see
[`app/README.md`](app/README.md) for the full development guide (module
boundaries, feature layout, testing seams, adding a game).

```powershell
make dev-app        # run the Avalonia shell (dotnet run)
make lint-app       # build with warnings as errors (the real gate)
make test-app       # xunit tests (dotnet test)
make build-app      # publish → app/build/bin
```

> **SDK note:** the .NET `10.0.301` SDK (pinned by `global.json`) is installed
> under the **x86** host on Windows. If a bare `dotnet` reports "no SDK found",
> invoke it explicitly: `& 'C:\Program Files (x86)\dotnet\dotnet.exe' …`.

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

### C# (desktop app)
- Nullable + implicit usings are on; the build must be clean with `-warnaserror`
  (`make lint-app`)
- Keep game-specific code in `Sprint.Games` and UI-free contracts in
  `Sprint.Desktop.Api` — the project references enforce these seams
- Prefer pure, testable presenter/reducer seams over growing `MainWindow.cs`; do
  not hardcode hex outside `Graphite.cs`

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

- [ ] Code compiles cleanly (`make build`; desktop: `make lint-app`)
- [ ] Tests pass (`make test`; desktop: `make test-app`)
- [ ] Linting passes (`make lint`)
- [ ] Code is formatted (`make fmt`)
- [ ] Documentation updated if applicable

## Adding a New Game

See the [README](README.md#adding-a-new-game) for the step-by-step guide. In short:

1. Implement `ITelemetrySource` (from `Sprint.Desktop.Api`) in `app/Sprint.Games`,
   mapping the game's shared memory / structs to `TelemetryFrame`
2. Add a `GameDescriptor` and register it via `GameTelemetryPackage.CreateSource`
3. Wire it into the composition root (see
   [`app/README.md`](app/README.md#adding-a-game-desktop))

## Questions?

Open an issue or start a discussion — we're happy to help.
