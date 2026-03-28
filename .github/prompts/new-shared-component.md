---
description: 'Create a new shared UI component in @sprint/ui'
mode: 'agent'
---

# New Shared Component

I need to create a new reusable component in the shared UI library (`packages/ui/`).

## Conventions to follow

1. **Location**: `packages/ui/src/components/primitives/` for visual atoms, `packages/ui/src/components/telemetry/` for domain display components
2. **Variant management**: Use CVA (class-variance-authority) for variants and sizes
3. **Polymorphism**: Support `asChild` via Radix UI `Slot` when the component wraps interactive elements
4. **Class merging**: Use the `cn()` utility for Tailwind class composition
5. **Exports**: Export the component, its Props type, and Variants type
6. **Accessibility**: Include `aria-*` attributes, `focus-visible:ring` patterns, and `data-slot`/`data-variant` attributes
7. **Design system**: Use tokens from `@sprint/tokens` — orange for driver/primary, teal for engineer/secondary

## Reference files

- `packages/ui/src/components/primitives/button.tsx` — reference for variants + polymorphism
- `packages/ui/src/components/primitives/badge.tsx` — reference for simpler variant component
- `packages/ui/src/lib/utils.ts` — the `cn()` utility
- `docs/DESIGN_SYSTEM.md` — full design system specification

## After creating

- Ensure the component is exported from `packages/ui/src/index.ts`
- Both `app/frontend` and `web` Tailwind configs already scan `packages/ui/src/` — no config changes needed
