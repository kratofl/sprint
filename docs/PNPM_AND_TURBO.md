# pnpm & Turborepo — Concepts for this Project

## What is pnpm?

pnpm is a **package manager for JavaScript/TypeScript** — the same category as npm and yarn, but smarter about disk usage and workspace support.

### Why pnpm instead of npm?

| Feature | npm | pnpm |
|---|---|---|
| Disk usage | Copies packages into every `node_modules` | Stores each version once globally, uses hard-links |
| Speed | Slower | Significantly faster (especially reinstalls) |
| Workspace support | Exists but basic | First-class, well-designed |
| Security | Packages can access anything | Strict: packages can only access their declared dependencies |

### How to use pnpm

```bash
# Install all workspace dependencies (run from repo root)
pnpm install

# Add a dependency to a specific package
pnpm --filter @sprint/ui add clsx

# Add a dev dependency
pnpm --filter @sprint/desktop add -D @types/something

# Run a script in one package
pnpm --filter @sprint/desktop dev

# Run a script in ALL packages (useful for type-check everywhere)
pnpm -r type-check
```

### Workspaces

This project is a **pnpm workspace** — multiple related packages in one repo (monorepo). Workspaces are declared in `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'   # @sprint/ui, @sprint/types, @sprint/tokens
  - 'web'          # Next.js web app
  - 'app/frontend' # Wails React frontend
```

Workspace packages can reference each other with `workspace:*`:

```json
// app/frontend/package.json
{
  "dependencies": {
    "@sprint/ui":     "workspace:*",
    "@sprint/types":  "workspace:*",
    "@sprint/tokens": "workspace:*"
  }
}
```

`workspace:*` means "use the local version from this repo". When you change something in `packages/ui/src/`, the desktop app and web app pick it up immediately (after rebuilding the package).

---

## What is Turborepo?

Turborepo (called `turbo`) is a **build orchestrator for monorepos**. It knows about the dependencies between your packages and runs tasks in the optimal order — parallelising where safe, caching results when inputs haven't changed.

### The problem Turbo solves

Without Turbo, if you want to build everything you might do:

```bash
cd packages/tokens && pnpm build
cd packages/types  && pnpm build
cd packages/ui     && pnpm build   # must wait for tokens to finish
cd web             && pnpm build   # must wait for ui and types
cd app/frontend    && pnpm build   # must wait for ui and types
```

This is fragile (manual order) and slow (sequential). Turbo automates this.

### How Turbo knows the order

`turbo.json` in the repo root defines the **task graph**:

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],   // ^ means: build my dependencies first
      "outputs": ["dist/**"]     // what to cache
    },
    "dev": {
      "dependsOn": ["^build"],   // for dev, deps must be built first
      "persistent": true         // long-running: don't wait for it to finish
    },
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

`"dependsOn": ["^build"]` means: before running `build` in this package, run `build` in all packages this one depends on. Turbo reads the `dependencies` in each `package.json` to figure out the graph.

### The dependency graph for this project

```
@sprint/tokens  (no dependencies on other workspace packages)
      │
      ├── @sprint/ui     (depends on @sprint/tokens)
      │
      └── @sprint/types  (depends on @sprint/tokens)
                │
                ├── web            (depends on @sprint/ui + @sprint/types)
                └── app/frontend   (depends on @sprint/ui + @sprint/types)
```

So if you run `pnpm turbo build`, Turbo will:
1. Build `@sprint/tokens` first (no deps)
2. Then build `@sprint/ui` and `@sprint/types` in **parallel** (both only need tokens)
3. Then build `web` and `app/frontend` in **parallel** (both only need ui + types)

### Turbo caching

Turbo hashes the **inputs** (source files, env vars) of each task. If the inputs haven't changed since the last run, it skips the task and restores the outputs from cache instantly:

```
Tasks:    4 successful, 4 total
Cached:   3 cached, 4 total    ← 3 packages skipped because nothing changed
  Time:   312ms >>> FULL TURBO  ← rebuilt in 312ms instead of minutes
```

### Common Turbo commands

```bash
# Build everything in the correct order
pnpm turbo build

# Run dev servers for all packages (starts watchers in parallel)
pnpm turbo dev

# Type-check all packages
pnpm turbo type-check

# Run only for specific packages (and their deps)
pnpm turbo build --filter=@sprint/desktop
pnpm turbo build --filter=web

# Force re-run (ignore cache)
pnpm turbo build --force
```

---

## How pnpm and Turbo work together

pnpm manages **packages and their node_modules**. Turbo manages **the order and caching of tasks** across those packages.

```
pnpm install    → installs all node_modules for all workspace packages
pnpm turbo build → builds all packages in the right order, with caching
```

Think of pnpm as the tool that makes packages available, and Turbo as the tool that runs the right scripts in the right sequence.

---

## Shared packages: @sprint/tokens, @sprint/ui, @sprint/types

This project splits shared code into three packages:

### `@sprint/tokens`
Design tokens — colours, typography, spacing, border radii — as a Tailwind config and a `globals.css`. Both the web app and desktop app extend this config so they share the same visual language.

**You change here when:** you want to adjust a colour, font, or spacing value globally.

### `@sprint/ui`
Shared React components — `Button`, `Badge`, `Card`, `Input`, `Select`, telemetry widgets (`LapTime`, `DeltaBar`, `TireTemp`, etc.). Built with TypeScript and Tailwind.

**You change here when:** you're building a component that will be used in both the web app and the desktop app.

**Important:** After editing source files in `packages/ui/src/`, you must rebuild it before the apps see the changes:
```bash
cd packages/ui && pnpm build
# or from root:
pnpm turbo build --filter=@sprint/ui
```

### `@sprint/types`
TypeScript interfaces that mirror the Go DTO structs. For example, `TelemetryFrame` in TypeScript mirrors `dto.TelemetryFrame` in Go.

**You change here when:** you add or modify a field in a Go DTO struct in `/pkg/dto/`. Keep them in sync manually.
