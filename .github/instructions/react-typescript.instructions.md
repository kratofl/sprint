---
description: 'Shared React and TypeScript conventions for both the desktop frontend (app/frontend) and web app (web). Covers component patterns, hooks, state management, and the shared UI system.'
applyTo: 'app/frontend/**/*.tsx,app/frontend/**/*.ts,packages/ui/**/*.tsx,packages/ui/**/*.ts,packages/types/**/*.ts'
---

# React & TypeScript Conventions

## Shared UI System (`@sprint/ui`)

All reusable visual components live in `packages/ui/`, are exported from
`@sprint/ui`, and are consumed from `@sprint/ui` by both `app/frontend`
and `web`.

### Component Patterns

- **Tailwind-first styling** — prefer Tailwind utility classes in JSX/TSX
  over ad-hoc CSS for component styling
- **Token reuse** — use shared tokens and utilities from `@sprint/tokens`
  before introducing one-off visual values
- **CVA (class-variance-authority)** for shared component variants — define
  variants and sizes declaratively
- **Radix UI `Slot`** for `asChild` polymorphism — components can render as any element
- **`cn()` utility** for Tailwind class composition and merging (`clsx` +
  `tailwind-merge`)
- Export both the component and its variants type (e.g., `Button`, `ButtonProps`, `ButtonVariants`)

### Naming & Structure

```
packages/ui/src/components/
  primitives/    → Button, Badge, Card, Input (visual atoms)
  telemetry/     → LapTime, DeltaBar, TireTemp (domain display)
```

If a component is needed on both desktop and web surfaces, extract it to
`packages/ui` and consume it via `@sprint/ui` instead of duplicating it.
Do not use decorative separator comment lines or banner comments made of
repeated hyphens, box-drawing characters, or similar glyphs; prefer normal
comments, headings, and self-explanatory structure.

## Desktop Frontend (`app/frontend/`)

- View state managed via enum: `'telemetry' | 'dash' | 'setups' | 'engineer' | 'devices'`
- Sidebar + main content layout
- Custom hooks for live data (e.g., `useTelemetry()`)
- Wails runtime for Go interop: `window.go.main.App.*` and `EventsOn/EventsEmit`
- Path alias: `@` → `./src`

### Desktop-Only Components

Components in `app/frontend/src/components/` that depend on Wails runtime or native features:
- Drag region chrome
- Device configuration panels
- Wails event listeners

`app/frontend/src/components/` is for Wails-specific UI only. If a component
does not need Wails APIs and is reusable, move it to `packages/ui` and
consume it via `@sprint/ui`.

## TypeScript Types (`@sprint/types`)

- Mirror Go DTOs from `pkg/dto/` — kept in sync manually
- Telemetry types: `TelemetryFrame`, `SessionInfo`, `CarState`, `TireData`
- Engineer types: `EngineerCommand`, `CommandStatus`
- All numeric values use SI units (m/s, °C, kPa) matching Go side

## Styling

- Prefer Tailwind utility classes in JSX/TSX over ad-hoc CSS for component
  styling
- Tailwind CSS with shared config from `@sprint/tokens`
- Reuse tokens, CSS variables, and shared utilities from `@sprint/tokens`
  before adding one-off colors, spacing, blur, or shadow values
- Use `cn()` for conditional class composition and CVA for shared component
  variants
- Both apps include `../../packages/ui/src/**/*.{ts,tsx}` in Tailwind
  `content` — shared component classes are not purged
- Use the shared surface utilities from `@sprint/tokens` (`.surface`,
  `.surface-elevated`, `.surface-overlay`, `.surface-active`,
  `.surface-secondary`, `.surface-success`, `.surface-warning`,
  `.surface-destructive`, `.surface-tertiary`) instead of inventing local
  surface treatments
- Reserve `.glass` and `.glass-overlay` for floating overlays only
- Font stack: `Space Grotesk` for UI and `JetBrains Mono` for telemetry/data
  readouts with `font-mono tabular-nums`

## Design System Semantics

- **Orange `#ff906c`** — driver-owned actions, primary buttons
- **Cyan `#5af8fb`** — engineer-originated actions, comparison data
- Never use both at the same visual weight on the same element

## Hooks Conventions

- Live data hooks should handle WebSocket lifecycle (connect/disconnect/reconnect)

## State Management

- Local state for UI concerns (view selection, panel open/close)
- Custom hooks for domain data (telemetry stream, setup data)
- No global state library — Wails events + React state are sufficient for current scope
