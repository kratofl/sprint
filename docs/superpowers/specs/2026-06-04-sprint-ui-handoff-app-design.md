# Sprint UI Handoff App Migration Design

## Goal

Implement `docs/Sprint UI Handoff/` 1:1 for the desktop app through the shared token and UI package foundation.

The target look is the handoff's flat, true-neutral, technical desktop UI: black and neutral panel surfaces, one racing-orange primary accent, semantic green/red only for state, strict mono numeric data, 1px borders for separation, soft non-pill radii, and no blur/glow/elevation.

## Scope

In scope:

- `packages/tokens`: canonical color, radius, spacing, typography, border, surface, and compatibility aliases.
- `packages/ui`: shared primitives, organisms, and telemetry display components used by the desktop app.
- `app/frontend`: Wails shell and every current desktop view: Home, Telemetry, Dash Editor, Devices, Controls, Settings, Help, and view-owned components.

Out of scope:

- `web/` visual migration.
- `api/`, DTOs, persistence, device drivers, and Wails backend behavior.
- New telemetry contracts or fake production data.

If shared package edits create visible `web/` follow-up work, document it instead of migrating `web/` in this pass.

## Architecture

Use a foundation-first migration.

`packages/tokens` translates the handoff values from `sprint.css` into the repo's token system and Tailwind config. It exposes the handoff variables (`--bg`, `--bg-deep`, `--panel`, `--panel-2`, `--panel-3`, `--border`, `--border-2`, `--orange`, `--orange-soft`, `--green`, `--green-soft`, `--red`, `--red-soft`, `--text`, `--muted`, `--muted-2`) plus compatibility aliases mapped onto the new system.

`packages/ui` owns the reusable visual grammar. Buttons, cards, badges, inputs, tables, nav rail, page header, status strip, and telemetry widgets should match the guide by default so app views do not carry one-off styling.

`app/frontend` owns Wails-specific chrome and screen composition. It keeps navigation history, dirty-state guards, window controls, update flow, telemetry hooks, dash editor behavior, device flows, settings persistence, and existing runtime APIs unchanged.

## Component Design

Shared primitives:

- Buttons use 9px radius. Primary is solid orange with dark text. Secondary is neutral panel with 1px border. Destructive stays transparent with red border/text.
- Inputs/selects/textareas use `panel-2`, `border-2`, 40px control height where applicable, orange focus border, and mono/right-aligned styling for numeric fields.
- Cards use `panel`, 1px `border`, 14px radius, 20px padding, and header structure of title/sub-label left with chip/action right.
- Badges use 7px radius. Tags use 5-6px radius, uppercase labels, and soft semantic tints.
- Tables use hairline row dividers only, no zebra striping, mono right-aligned numbers, muted labels, orange best/key values, green positive/optimal, red invalid/negative.
- Legacy glass/glow utilities become inert flat aliases or are removed only when no consumer needs them.

Shared organisms:

- Nav rail rows use 18px line icons, 13-13.5px labels, 9px radius, neutral hover on `panel-2`, and active orange-soft wash with orange text/icon and faint orange border.
- Page headers use the guide typography scale without elevated backgrounds.
- Status strip uses flat border separation, muted mono metadata, and green live/offline state.
- Telemetry display components enforce JetBrains Mono/tabular numerals for all measured values.

Desktop app:

- Shell uses a 42px Windows-style titlebar with icon, `Sprint - Telemetry System`, Wails drag regions, caption buttons, and close hover `#E81123`.
- Home becomes a concise command surface with metric/status cards and guide-matching quick actions.
- Telemetry becomes the reference dashboard using existing frame fields: session header, speed/gear/RPM HUD, driver inputs, chrono metrics, fuel, sectors/delta, tyre status, alerts or stable empty states.
- Dash Editor uses the handoff surface hierarchy already described in the existing redesign spec: recessed canvas well, raised rails, inset rail controls, flat seams, and orange selected-widget affordances while preserving editor behavior.
- Devices, Controls, Settings, and Help are repainted onto shared cards, tables, forms, badges, and alert/status patterns without behavior changes.

## Data Flow

No new data contracts are introduced.

Desktop views continue to use the existing Wails APIs and hooks. Telemetry continues to receive `TelemetryFrame | null` through `useTelemetry`. Formatting continues through current helpers and global dash settings. Offline or missing data renders stable empty states using the same layout and muted/semantic token system.

Shared UI components remain runtime-agnostic and receive data through props only. Wails APIs stay in `app/frontend`.

## Error Handling And Empty States

Unavailable live telemetry renders `OFFLINE` or `NO DATA` states without collapsing the dashboard layout.

Device, controls, settings, and update errors should use neutral rows with semantic icon/tag treatment, matching the guide's alert anatomy. Destructive states are red but not filled. Warning/watch states use orange soft tint. Healthy/connected states use green soft tint.

## Testing And Verification

Smallest relevant checks:

- Token/UI class tests that already cover variants and panel classes.
- `pnpm --filter @sprint/ui build`.
- `pnpm --filter @sprint/desktop type-check`.
- `pnpm --filter @sprint/desktop build` after app-wide changes.

Visual verification target:

- Browser-safe desktop UI at `http://localhost:5173/` while the app dev server is running.
- Use Playwright MCP when browser support is available. If the environment still lacks a launchable browser, report that limitation and verify by build/type checks plus source review.

## Acceptance Criteria

- All desktop app views follow the Sprint UI handoff language.
- Shared tokens and UI primitives are the source of truth for the app's visual system.
- No default surface is bluish, glassy, glowing, blurred, or Material-elevated.
- Orange is the only primary accent. Green and red are semantic. Cyan is not used as a primary UI accent.
- Numeric telemetry and measured values use mono/tabular styling.
- Existing desktop behavior is preserved.
- `web/` is not migrated in this pass.
