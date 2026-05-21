---
description: 'React and TypeScript conventions for this project. Canonical guidance lives in docs/agents/react-typescript.md.'
applyTo: 'app/frontend/**/*.tsx,app/frontend/**/*.ts,packages/ui/**/*.tsx,packages/ui/**/*.ts,packages/types/**/*.ts'
---

# React & TypeScript Conventions

Use `docs/agents/react-typescript.md` as the canonical guide. Key rules:

- Put reusable UI in `packages/ui` and consume it via `@sprint/ui`.
- Keep Wails-specific code in `app/frontend/src/components/`.
- Reuse `@sprint/tokens`, CVA, and `cn()` before inventing one-off patterns.
- Keep `packages/types` aligned with `pkg/dto`.
- Use orange for driver-primary intent and cyan for engineer/comparison intent.
