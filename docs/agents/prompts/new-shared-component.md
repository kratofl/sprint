## New Shared Component Prompt

Use this prompt when creating UI intended for both desktop and web.

### Checklist

- Put reusable components in `packages/ui`.
- Export them through `@sprint/ui`.
- Reuse `@sprint/tokens`, CVA, and `cn()`.
- Keep platform-specific logic out of shared packages.
- Put desktop-only behavior in `app/frontend/src/components/`.
- Put web-only behavior in `web/components/`.
- Validate on both consuming surfaces if the component is actually shared.
