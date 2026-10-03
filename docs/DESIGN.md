# Sprint design

The product design system lives in [`docs/design/design-system/DESIGN.md`](design/design-system/DESIGN.md)
(rules, components, interface guidelines). That document is the authority for
UI; this file only maps it onto Sprint's surfaces. The rendered wheel dashboard,
which the design system does not cover, has its own rules in
[`docs/internals/dash-rendering.md`](internals/dash-rendering.md).

## Platform mapping

| Surface | Look | Tokens | Type |
| --- | --- | --- | --- |
| Desktop app (`app/desktop`, Electron on Windows) | Windows Fluent: Mica window, 48px title bar, NavigationView pane, content layer, CommandBar, ContentDialog, acrylic flyouts and notifications. 4px controls, 8px cards and flyouts. | `@sprint/tokens/windows.css` | Segoe UI Variable (system font, nothing bundled), 13px/20px base |
| Web app (`web/`) | Web CI: Apple look, flat content, Liquid Glass only on toolbar, menus, toasts, notifications and dialogs. | `@sprint/tokens/web.css` | System stack |
| Wheel dashboard (`packages/dashboard`) | Hardware instrument with its own color domain (below). Not restyled with the app. | Dash palette in `packages/dashboard` | Saira Semi Condensed for numerics, Inter for wheel labels |

Shared across platforms: brand `#ff6a00` (`--brand-500`; text on it is the dark
`--on-brand`, never white), the status scales (green, red, yellow, blue, purple),
and light **and** dark themes following the OS. Status is dot + word, never color
alone. One primary button per view. Buttons never glow.

Desktop references: the Windows mockups
`docs/design/_unpacked/pages/windows-light.readable.html` and
`windows-dark.readable.html` (exact sizes in their inline styles) and the
screenshots `docs/design/_unpacked/win.png` / `win-dark.png`. The shell and the
shared primitives (`.button`, `.card`, `.infobar`, `.list-row`, `PageHeader`, …)
live in `app/desktop/src/styles.css` and `app/desktop/src/shell/`.

Rendered dashes: the old-renderer ground truth in `docs/design/dash-reference/`
remains the visual authority for wheel output.

## Glance readouts

The default Glance readout has a quiet label, a high-contrast value, and a
subordinate unit attached in a stable position. Whitespace and aligned baselines
separate neighboring readouts. Dividers or grouped surfaces appear only when
spacing and alignment cannot prevent ambiguity. A metric is not automatically a
card.

Readouts reserve space for their expected maximum format. Unit position and
decimal precision remain stable. Values update in place without bounce, count-up,
reflow, pulse, or glow. Missing, stale, invalid, and disconnected values retain
their geometry and show `—` with an explicit connection state; an old value is
never frozen and presented as live.

Primary Glance values remain neutral at rest. Application orange appears only
when it adds interaction or state meaning, not merely because a value is central.

## Wheel dashboard

The rendered wheel dashboard is a separate color domain: orange means Warning,
not brand accent, and default focal values stay neutral. Its condition palette,
Functional/Styled color systems, theme presets, attention ladder and contrast
targets are in [`docs/internals/dash-rendering.md`](internals/dash-rendering.md).
