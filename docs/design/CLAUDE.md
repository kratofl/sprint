# Design System

This project uses the sprint Design System. Before building or changing any UI:

1. Read `design-system/DESIGN.md` (rules for platforms, glass vs. flat, colours, type, shape, components).
2. Use only the CSS custom properties from `design-system/tokens.css` – never hard-code colours, radii or spacing. Machine-readable values: `design-system/tokens.json`.
3. Domain: the app has NO accounts. Expenses are deducted from the budget of their category in the month of their date. Never add account fields, columns, filters or transfers.
4. Web is the primary CI (Apple look). Native apps (iOS, macOS, Windows, Android) follow their own platform guidelines; only brand tokens carry over.
5. Glass (`.glass`, `.toolbar-band`) only on toolbar, context menus, notifications, toasts, popovers, dialogs. Everything else is flat. Buttons never glow.
6. Support light and dark (`data-theme="dark"` or `prefers-color-scheme`) and the flat fallback (`prefers-reduced-transparency`).
7. Choosing a selection control is NOT a matter of taste: follow the decision procedure in `DESIGN.md` → „Interface Guidelines (Webix HIG)“, top to bottom, first match wins. In short:
   - app navigation → sidebar / tab bar; actions → buttons (1–2) or pull-down button (3+)
   - separate panes of one page (2–6) → `.tab-switcher` (glass)
   - 2–5 short options changing the presentation of the same data → `.segmented` (flat)
   - 6+ options, long/dynamic labels, form values, rare settings → Select
8. The selected segment of a segmented control NEVER has a box-shadow, border, gradient or glass. Only the tab switcher is glass.
9. Create/edit flows (Buchung, Budget, Sparziel) MUST follow `DESIGN.md` → „Forms & sheets“ and the reference pattern `design-system/patterns/neue-buchung.md`: sheet, field order, defaults, button labels and placement, validation on blur.
10. Every component section in `DESIGN.md` has „Use when“, „MUST“ and „NEVER“ rules. They are binding, not suggestions.
11. Before finishing a UI change, check it against the MUST/NEVER rules in `DESIGN.md` and fix any violation.

Live reference (mockups + component previews): the Design System artifact on claude.ai.
