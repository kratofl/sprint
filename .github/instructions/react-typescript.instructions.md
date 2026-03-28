---
description: 'Shared React and TypeScript conventions for both the desktop frontend (app/frontend) and web app (web). Covers component patterns, hooks, state management, and the shared UI system.'
applyTo: 'app/frontend/**/*.tsx,app/frontend/**/*.ts,packages/ui/**/*.tsx,packages/ui/**/*.ts,packages/types/**/*.ts'
---

# React & TypeScript Conventions

## Shared UI System (`@sprint/ui`)

All reusable visual components live in `packages/ui/`. Both `app/frontend` and `web` import from `@sprint/ui`.

### Component Patterns

- **CVA (class-variance-authority)** for variant management — define variants and sizes declaratively
- **Radix UI `Slot`** for `asChild` polymorphism — components can render as any element
- **`cn()` utility** for Tailwind class merging (`clsx` + `tailwind-merge`)
- Export both the component and its variants type (e.g., `Button`, `ButtonProps`, `ButtonVariants`)

### Naming & Structure

```
packages/ui/src/components/
  primitives/    → Button, Badge, Card, Input (visual atoms)
  telemetry/     → LapTime, DeltaBar, TireTemp (domain display)
```

### Accessibility

- Use `aria-invalid`, `focus-visible:ring` patterns
- Add `data-slot` and `data-variant` attributes for CSS hooks
- Support keyboard navigation on interactive components

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

These must NOT be moved to `@sprint/ui`.

## TypeScript Types (`@sprint/types`)

- Mirror Go DTOs from `pkg/dto/` — kept in sync manually
- Telemetry types: `TelemetryFrame`, `SessionInfo`, `CarState`, `TireData`
- Engineer types: `EngineerCommand`, `CommandStatus`
- All numeric values use SI units (m/s, °C, kPa) matching Go side

## Styling

- Tailwind CSS with shared config from `@sprint/tokens`
- Both apps include `../../packages/ui/src/**/*.{ts,tsx}` in Tailwind `content` — shared component classes are not purged
- Glassmorphism: `backdrop-blur-glass`, `border-border-glass`, `.glass` utility classes
- Font: `Inter` variable (100–900). Telemetry numbers: `font-mono tabular-nums`

## Design System Semantics

- **Orange `#EF8118`** — driver-owned actions, primary buttons
- **Teal `#1EA58C`** — engineer-originated actions, comparison data
- Never use both at the same visual weight on the same element

## Hooks Conventions

- Prefix with `use` (standard React convention)
- Live data hooks should handle WebSocket lifecycle (connect/disconnect/reconnect)
- Return stable references (use `useCallback`/`useMemo` for objects passed to children)

## State Management

- Local state for UI concerns (view selection, panel open/close)
- Custom hooks for domain data (telemetry stream, setup data)
- No global state library — Wails events + React state are sufficient for current scope
