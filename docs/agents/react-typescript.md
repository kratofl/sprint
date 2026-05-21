## React and TypeScript Guidance

### Shared UI

- Put reusable visual components in `packages/ui`.
- Export and consume shared components through `@sprint/ui`.
- Use Tailwind utilities first.
- Reuse tokens from `@sprint/tokens` before adding one-off values.
- Use CVA for shared variants and `cn()` for class composition.
- Use Radix `Slot` for `asChild` polymorphism when appropriate.

### Ownership

- Shared components belong in `packages/ui`.
- Desktop-only components that depend on Wails belong in `app/frontend/src/components/`.
- Web-only components belong in `web/components/`.

### Desktop Frontend

- The desktop frontend uses Wails runtime bindings and event APIs.
- Keep Wails-specific logic out of shared packages.
- View state is organized around the app sections such as telemetry, dash, setups, engineer, and
  devices.

### Shared Types

- `packages/types` mirrors `pkg/dto` manually.
- Keep shared TypeScript DTOs aligned with the Go definitions.
- Use SI units consistently with the Go side.

### Styling

- Prefer Tailwind in JSX and TSX over ad hoc CSS.
- Reuse `@sprint/tokens` surfaces and utilities.
- Reserve `.glass` and `.glass-overlay` for floating overlays only.
- Use `Space Grotesk` for UI and `JetBrains Mono` for telemetry or other numeric readouts.

### Semantics

- Orange `#ff906c` means driver-owned or primary.
- Cyan `#5af8fb` means engineer-originated or comparison.
- Do not use both colors at equal visual weight on the same element.

### State and Hooks

- Use local React state for local UI concerns.
- Use custom hooks for domain data such as telemetry streams.
- Avoid introducing a global state library unless the architecture changes materially.
