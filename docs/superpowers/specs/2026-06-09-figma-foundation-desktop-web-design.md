# Figma Foundation Desktop Web Migration Design

## Goal

Migrate Sprint to the new `docs/Sprint.fig` theme in three strict phases: shared foundation, Wails desktop app, then Next.js web app.

## Source Of Truth

`docs/Sprint.fig` is canonical. `docs/DESIGN.md` is the readable exported mirror used for implementation because the local `.fig` archive stores the canvas as binary `canvas.fig`, not searchable JSON or text.

Precedence for visual decisions is:

1. `docs/Sprint.fig`
2. `docs/DESIGN.md`
3. Current repo code and older specs

Older June 4 Superpowers specs and plans are superseded where they disagree with the new Figma export. Concrete examples: the titlebar is 32px, not 42px; numeric typography is Saira, not JetBrains Mono; semantic green is `#16b566`, not `#33d27e`; semantic red is `#f02744`, not `#ff4d63`.

## Scope

In scope:

- `packages/tokens`: exact Figma color, typography, radius, border, spacing, and component token mapping.
- `packages/ui`: reusable component styling that matches the Figma Components page.
- `app/frontend`: full Wails desktop app visual migration to the Figma Layout page and component system.
- `app/build`: app icon build assets derived from the new Sprint icon export.
- `web`: web visual migration after desktop is complete and verified.
- Asset placement for the new icon, square mark, pattern, wordmark, and wallpaper.

Out of scope:

- API contracts, SQL, telemetry DTOs, device drivers, and Wails backend behavior unless a frontend compile boundary requires a narrow adapter update.
- New product features not present in the current app or Figma.
- Direct Figma MCP usage. The free Figma plan is not available for this workflow.

## Migration Sequence

Use strict sequential delivery:

1. Foundation: assets, tokens, and shared UI.
2. Desktop: Wails shell and app views.
3. Web: Next.js shell and routes.

Do not start desktop repainting until shared assets/tokens/UI are stable enough to consume. Do not start web repainting until desktop is implemented and verified against the Figma app frame.

## Foundation Design

### Assets

Move exported brand assets out of `docs/` into runtime-owned asset locations while leaving the docs copies intact.

Shared brand asset targets:

- `packages/ui/src/assets/brand/sprint-icon.svg` from `docs/sprint-ico.svg`
- `packages/ui/src/assets/brand/sprint-square.svg` from `docs/sprint-square.svg`
- `packages/ui/src/assets/brand/sprint-pattern.svg` from `docs/sprint-pattern.svg`
- `packages/ui/src/assets/brand/sprint-wordmark.svg` from `docs/sprint-wordmark.svg`

Desktop brand asset targets:

- `app/frontend/src/assets/brand/sprint-icon.svg`
- `app/frontend/src/assets/brand/sprint-square.svg`
- `app/frontend/src/assets/brand/sprint-pattern.svg`
- `app/frontend/src/assets/brand/sprint-wordmark.svg`
- `app/frontend/src/assets/brand/sprint-wallpaper.png`

The wallpaper comes from the embedded PNG in `docs/Sprint.fig`. The full-size embedded wallpaper is the runtime desktop backdrop; the thumbnail is inspection-only.

Wails build assets:

- Replace `app/build/appicon.png` with a PNG rendered from the new icon.
- Replace `app/build/windows/icon.ico` with an ICO generated from the same new icon source.

The old `sprint_logo_icon.png` should stop being the active app icon source. It may remain temporarily only if existing references require a compatibility step during migration.

### Tokens

`packages/tokens` must expose Figma values exactly, using token names that current consumers can import and CSS variables that app/web styles can use.

Required surface variables:

```css
--bg: #0a0a0a;
--bg-deep: #050505;
--win: #0f0f0f;
--panel: #0f0f0f;
--tile: #0f0f0f;
--panel-2: #141414;
--tile-2: #141414;
--panel-3: #1a1a1a;
--tile-3: #1a1a1a;
--panel-4: #1f1f1f;
--tile-4: #1f1f1f;
```

Required border and text variables:

```css
--border: #2e2e2e;
--border-2: #424242;
--win-edge: #404040;
--text: #f6f6f6;
--muted: #7a7a7a;
--muted-2: #5a5a5a;
```

Required signal variables:

```css
--orange: #ff6a00;
--green: #16b566;
--red: #f02744;
--amber: #e0a30c;
--blue: #1f7fe6;
```

Required badge tint and ring variables:

```css
--green-tint: #05281a;
--green-ring: #0e7445;
--red-tint: #3a0a10;
--red-ring: #851727;
--amber-tint: #2b2003;
--amber-ring: #8a6507;
--blue-tint: #071a30;
--blue-ring: #11457f;
--orange-tint: #33170a;
--orange-ring: #9c4505;
```

Radius responsibilities must follow Figma:

- `14px`: window, content screen, cards, topbar, panels.
- `10px`: alerts, widget tiles, tab-group containers.
- `8px`: buttons, inputs, nav items, segmented containers, badge-group containers.
- `6px`: icon tiles, segmented items, titlebar `S` tile.
- `4px`: badges and add-tab tiles.
- `999px`: pills, progress, toggles.

Typography roles must follow Figma:

- Inter: UI strings, titles, body, nav labels, secondary text, group labels.
- Saira: all numeric telemetry and counters.
- Saira Semi Condensed: badges, mode tags, segmented labels, page-tab labels, `SPRINT` wordmark.
- Space Grotesk: titlebar `S` tile and big lockup wordmark moments.

Compatibility aliases can remain during migration, but they must resolve to the new Figma values. Do not keep old cyan, purple, glass, glow, or Material-elevation behavior as a visible default.

### Shared UI Components

`packages/ui` should implement the Figma Components page as reusable primitives and organisms. Component classes should be stable enough for desktop and web to consume without one-off per-view styling.

Required component metrics:

- Button: hug width, 25px height, `14px 6px` padding, 8px radius, Inter 700/13.
- Small button: `10px 4px` padding and 12px type.
- Badge or mode tag: 20px height, `10px 4px` padding, 4px radius, Saira Semi Condensed 700/12.
- Icon tile: 25x25, 6px padding, 6px radius, 13px icon.
- Large icon tile: 28x28, 16px icon.
- Segmented control: 8px container radius, 4px padding, 2px gap; items are 25px high with 6px radius.
- Nav item: 32px height, `10px 8px` padding, 10px gap, 8px radius, 16px icon, Inter 500/13.
- Alert: 10px radius, 10px padding, 10px gap, neutral panel/border, severity only in the indicator tile.
- Field: 32px height, 8px radius, `10px` horizontal padding, `panel-2` fill, `border` stroke.
- Progress and segment bars: 8px height.
- Card: 14px radius, 14px padding, panel fill, default border.
- Widget tile: 107x46, 10px radius, 8px padding.
- Toggle: 44x24 pill with 18px knob, green badge pair when on.

Shared UI must prefer Tabler-style 16px line icons with 1.8 to 2px stroke. Complex custom illustrations are not part of this migration.

## Desktop Design

The Wails desktop app should match the Figma Layout page `application` frame as closely as practical.

### Shell

Base frame:

- Window: 1570x883, 14px radius, `Surface/Panel`, 1px `Border/Window`, only sanctioned drop shadow.
- Stage backdrop: `sprint-wallpaper.png`.
- Scaled stage: the application frame can scale to fit available viewport; controls outside the scaled node must remain usable.

Titlebar:

- 32px height.
- 14px horizontal padding.
- 8px gap.
- Left content only: 20x20 orange `S` tile with 6px radius, `Sprint` in white Inter 700/13, and muted `- Telemetry System` suffix.
- Right content only: minimize, maximize, close controls.
- Close hover uses red.
- No nav, tabs, status, or view actions live in the titlebar.

Sidebar:

- 220px width.
- 10px padding.
- 14px vertical gap.
- Transparent on the window surface.
- No logo block.
- Top sections include Developer and Configure.
- System plus Settings and Help are pinned to the bottom column.

Visible navigation:

- Developer: Dashboard.
- Configure: Dash Editor and Devices.
- System: Settings.
- Utility: Help.

The default landing view is Dash Editor. Existing Home and Controls code should not remain in primary navigation unless a current product requirement maps them into the Figma navigation. If retained temporarily, they should be hidden from primary nav and documented as follow-up cleanup.

Content screen:

- Fills the area right of sidebar.
- 1350x851 at the Figma base frame.
- 14px radius.
- `Surface/Screen`.
- Inset 1px `Border/Default`.
- 14px padding.
- 14px gap.

Topbar:

- 41px height.
- 14px radius.
- `Surface/Panel` fill with `Border/Default`.
- `4px 8px` padding.
- Left: 21x21 back tile and Saira 11 context title.
- Center: page tabs with the exact tab-group anatomy from Figma.
- Right: view action cluster with secondary buttons and exactly one primary action per view.

### Desktop Views

Dash Editor is the default and primary reference screen. It is a builder for a VoCore 5 inch 800x480 wheel display. It should use:

- Left Widgets palette panel, 240px wide, 14px radius, panel fill.
- Search input and grouped 107x46 widget tiles.
- Center editor surface with the VoCore 800x480 preview.
- Existing page tabs, dirty state, save behavior, layout selection, widget selection, drag/drop, resize, and persistence behavior.
- Brand defaults: racing orange and Saira. No end-user theme/font gallery in this phase.

Dashboard is the developer live-telemetry simulation view. It should use:

- Figma component styling and token colors.
- rAF simulation behavior if currently present.
- LIVE/PAUSE state that freezes simulated telemetry if the current code path supports it.
- Numeric values in Saira/tabular styling.

Devices, Settings, and Help should be repainted using the shared component system. Their behavior should not change.

Alerts, inputs, tables, cards, badges, progress bars, segmented controls, page tabs, and local panels should visually match the shared Figma components rather than maintaining local legacy classes.

## Web Design

Web is migrated after desktop passes verification.

The web app consumes the same tokens and shared UI components, but it does not mimic Windows desktop chrome by default. It should use browser-native layout with the same Figma visual language.

Existing routes remain:

- `/`
- `/sessions`
- `/engineer`
- `/setups`
- `/dash`

Web-specific nav files should either use shared `@sprint/ui` organisms or match the same class contracts. Web pages should remove visible legacy cyan, purple, glass, glow, and elevated styling.

The `/dash` page may use the same Dash Editor visual language, but web must not depend on Wails runtime APIs.

## Data Flow And Behavior

This migration is visual and structural. It must preserve existing runtime behavior:

- Wails APIs and generated bindings stay local to `app/frontend`.
- Shared UI remains runtime-agnostic.
- Telemetry hooks and formatting helpers remain the source for live data.
- Device, update, settings, and dashboard persistence flows are not redesigned.
- DTOs and backend contracts do not change.

If a view currently lacks data required by the Figma layout, use a stable empty or disabled state. Do not expand backend contracts in this pass.

## Error Handling And Empty States

Use Figma alert anatomy:

- Alert container is neutral panel with default border.
- Severity is represented by a 28px icon tile using the badge tint/ring pair.
- Danger uses red tint/ring and `Red/500`.
- Success uses green tint/ring and `Green/500`.
- Caution uses amber tint/ring and `Amber/500`.
- Info uses blue tint/ring and `Blue/500`.

Offline telemetry and unavailable devices should preserve layout and make missing data explicit with muted labels, disabled controls, or alert rows.

## Testing And Verification

Foundation checks:

- Token tests where present, or add focused tests if the implementation changes token source files.
- `pnpm --filter @sprint/ui build`
- `pnpm --filter @sprint/ui type-check`

Desktop checks:

- `pnpm --filter @sprint/desktop type-check`
- `pnpm --filter @sprint/desktop build`
- Browser-safe desktop inspection at `http://localhost:5173/` while `cd app && wails dev` is running.
- Desktop-bound inspection with `make dev-app-agent`, `pwsh -File .\app\scripts\wait-desktop-browser.ps1`, then Playwright MCP against `http://127.0.0.1:34115` when runtime bindings matter.

Web checks:

- `pnpm --filter @sprint/web type-check`
- `pnpm --filter @sprint/web build`
- Browser inspection via `make dev-web`.

Do not claim any check that was not run.

## Acceptance Criteria

- Runtime assets use the new Sprint icon, square mark, pattern, wordmark, and wallpaper from the local Figma export and docs assets.
- Shared tokens match `docs/DESIGN.md` Figma values exactly.
- Shared UI component metrics match the Figma Components page.
- Desktop shell matches the Figma `application` frame: 1570x883 base, 32px titlebar, 220px sidebar, 1350x851 content screen, 41px topbar.
- Dash Editor is the default landing view.
- Desktop primary navigation matches the Figma app views.
- Existing behavior is preserved.
- Web is migrated only after foundation and desktop are complete.
- No visible default UI uses old cyan-first, purple, glass, glow, blur, or Material-elevation styling.

## Risks

- The `.fig` canvas is binary, so direct automated extraction is limited without Figma tooling. Mitigation: use `docs/DESIGN.md` as the readable mirror and visually inspect exported thumbnails/assets.
- Shared token changes can affect desktop and web before the web phase. Mitigation: keep compatibility aliases mapped to new Figma values and run downstream type/build checks.
- Strict fixed-frame desktop metrics can break smaller development viewports. Mitigation: implement the 1570x883 frame as the base coordinate system and scale/adapt around it without changing component metrics.
- Existing uncommitted repo changes are extensive. Mitigation: do not revert unrelated changes; inspect touched files before editing during implementation.
