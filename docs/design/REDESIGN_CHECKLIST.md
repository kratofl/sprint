# Redesign checklist — new Sprint design system

Started 2026-10-01 on `feat/issue-100-session-planner-page`. Source of truth:

- Rules: `docs/design/design-system/DESIGN.md` (+ component previews in `docs/design/design-system/previews/`)
- Web tokens: `docs/design/design-system/tokens.css` → shipped as `packages/tokens/web.css`
- Windows tokens: `packages/tokens/windows.css` (Fluent neutrals taken from the Windows mockups; brand/status scales shared)
- Mockups: `docs/design/Dashboard Mockup.html`. Unpacked, readable copies live in `docs/design/_unpacked/pages/`
  (`windows-light|dark.readable.html`, `web-light|dark.readable.html`, `web-sheet-neue-ausgabe.readable.html`,
  `components-web.readable.html`) and screenshots in `docs/design/_unpacked/*.png`.

**Platform rule:** the desktop app (`app/desktop`, Electron on Windows) follows the **Windows App – Fluent** mockup.
The web app (`web/`) follows the **Web App** mockup (Apple look, glass only on chrome). Only brand + status colours
carry across.

## Decisions taken (flag if wrong)

- Copy stays **English**. The design's "German, du" content rule belongs to the budget mockup domain; switching the
  product language is a separate decision.
- The budget domain rules (no accounts, Buchung/Ausgabe sheet fields) do not apply to Sprint. Their *structural* rules
  do: one primary per view, sheet/ContentDialog layout, field order, verb labels, validate on blur, toast after save.
- Light **and** dark, following the OS (`prefers-color-scheme`). No theme setting yet.
- Desktop font is Segoe UI Variable (system font, nothing bundled). Inter is retired from the desktop UI.
  Saira Semi Condensed stays, only for dash numerics.
- `packages/dashboard` (wheel instrument / USB output) is **not** restyled — it is hardware output, not app UI.
- Graphite, the previous design system, is removed: its token tree, `globals.css`, the Tailwind config, `packages/ui`,
  `GraphiteTokens.cs`, ADRs 0001–0037 and the Figma/glossary docs. The wheel-dash decisions live on in
  `docs/internals/dash-rendering.md`; the dash keeps its exact palette, now owned by `packages/dashboard`.

## Phase 0 — groundwork (lead)

- [x] Unpack mockup bundle, render Web/Windows/Components/Sheet screenshots
- [x] `packages/tokens/windows.css` — Fluent light/dark semantic tokens + brand scales
- [x] `packages/tokens/web.css` — web CI tokens (verbatim)
- [x] This checklist

## Phase 1a — Desktop foundation (agent: desktop-shell)

- [x] `app/desktop/src/styles.css`: import `windows.css`, drop Inter faces (keep Saira), Fluent base (13px Segoe UI Variable Text, Mica bg)
      — Inter faces kept: `packages/dashboard` names Inter for wheel labels; no app UI uses it.
- [x] Shared primitives in `styles.css`: `.button` (accent / standard / subtle / danger), `.icon-button`, `.card`,
      `.card-title`, `.field`/`.input`/`select`, `.chip`, `.segmented`, `.tabs`, `.infobar`, `.menu-flyout`,
      `.list-header`/`.list-row` (selected = fill + 3px brand indicator), `.meter`, `.kpi`, `.empty-state`
- [x] Title bar (48px): back, app mark + "Sprint", centred 360px search box (opens command palette, Ctrl+K), telemetry status, OS caption buttons via `titleBarOverlay`
- [x] NavigationView (248px, 32px items, 3×16px brand indicator, hamburger → compact 48px mode, footer: account + Settings + Help, update dot)
- [x] Content layer (`--layer`, 8px top-left radius, 1px `--layer-stroke` top/left)
- [x] `PageHeader` (24px Display title) + `CommandBar` (28px controls, 1px dividers, overflow "…") components for views
- [x] Back navigation history (title-bar back button)
- [x] Toasts → Windows notification style (acrylic card, bottom-right); command palette → acrylic flyout
- [x] `electron/main.ts`: overlay height 48, Mica colours per theme, follow `nativeTheme` updates
- [x] Preview harness: static `window.sprint` stub so views render in headless Edge without the host
- [x] Docs: `AGENTS.md` UI rules + typography, `docs/DESIGN.md` now points at `docs/design/design-system`

## Phase 1b — Web (agent: web)

- [x] `web/app/globals.css` → `@sprint/tokens/web.css` (+ Tailwind preflight only), system font stack; Figtree bundled in `web/app/fonts/` (extracted from the mockup, no network load). Graphite import, Google Fonts and the Graphite `tailwind.config.ts` are gone.
- [x] Shell: edge-to-edge sidebar (`sidebar-bg`, separator, app tile + "Sprint" + collapse button → icon-only rail and back), brand-500 icons, `fill-strong` active + 600, "Tools" section caption, footer user row; sticky frosted `.toolbar-band` with title · centre control · trailing search pill
- [x] Pages (`/`, `/sessions`, `/setups`, `/engineer`, `/dash`) recomposed: KPI cards, chart card (single brand series, max bar full brand), caption-headed tables with hairline rows, status dot + word, empty states. No invented numbers: the web app has no data source yet (`web/lib/data.ts` is the seam), so pages show empty states
- [x] Glass only on the toolbar (no page needs menus/toasts/sheets yet, so none were built); light + dark + reduced-transparency
- [x] `packages/ui`: deleted — `web/` used none of its components
- Density follows the mockup's documented **compact** web scale (components sheet "Web (kompakt)": 224px sidebar, 28px rows/controls, 52px toolbar, 34px table rows, 24px KPI), not the larger DESIGN.md numbers (256/36/64/48/32). Card radius uses `--radius-lg` (16px) because the mockup's 14px has no token.
- Not built (no real behaviour behind them): toolbar icon-action group, Settings sidebar entry, user name. Screenshots: `docs/design/_unpacked/webapp-*.png`

## Phase 2 — Desktop views (after 1a)

- [x] Home / Overview → KPI row, cards, recent list (agent: views-a)
      — PageHeader "Overview" (primary: open the armed/tracking plan, else "Plan a session"); telemetry as InfoBar unless live
      (quiet dot + word in the CommandBar then); 4 KPIs from state only; Session plans / Devices / Dashes list cards, rows open the item.
      Devices card now lists every saved screen with its status, not only connected ones. No "…" overflow: no secondary actions to put there.
- [x] Settings, Help & diagnostics (agent: views-a)
      — Settings: Windows 11 setting cards in groups (Profile, Updates, Reset); update channel is a ToggleSwitch "Pre-release updates";
      pre-release opt-in, install and reset confirm in a ContentDialog. Help: primary "Check for updates", results + telemetry + faulted
      screens as InfoBars, "This build" facts, searchable topics, Screens and Logs list cards. Switch, setting row, status dot and
      card-header link are local to these views (candidates for styles.css).
- [x] Session planner (agent: views-b) — plan list cards (Open plans / Completed: 32px rows, status dot + word, blue lap-time
      strip, row delete); an opened plan = "All plans" back, InfoBars (tracking / warning / active slot taken), KPI row
      (race length, both targets, laps), Segments list card + Plan facts card. One primary: New plan on the list, the next
      step inside a plan (Arm plan → Start qualifying/race per `NextSegment` → Stop). Delete, take-over and race-without-
      qualifying confirm in a ContentDialog; create/edit is a three-step ContentDialog with a brand step indicator and a
      discard-changes confirm. Screenshots: `docs/design/_unpacked/desktop-planner-*.png`
- [x] Analysis + chart (agent: views-b) — CommandBar selects (Track/Class/Car/Day on the session list; lap filter + sort in a
      session) + Refresh, no primary (browsing has no single next step). Session list card; inside a session a lap-stat KPI
      row, the "Lap comparison" chart card (legend with 8px squares + clear, chart chips, brand/blue series, `--divider` rules,
      12px axis labels drawn at real pixel width) and the laps list (primary = brand indicator, comparison = blue indicator).
      Screenshots: `docs/design/_unpacked/desktop-analysis-*.png`
- [x] Dashes + Dash editor panel (agent: views-c)
      — Dashes: PageHeader + CommandBar (New dash · Edit, Duplicate, Set as default · Delete) acting on the selected card; GridView of cards
      (live thumbnail, name, screen size, assigned devices with status dot + word), right-click/Shift+F10 MenuFlyout, ContentDialogs for new/duplicate/delete.
      Editor: sub-page header (back + dash name, unsaved status), CommandBar (Save · Discard · Preview select · Grid/zoom · Reset to preset), tabs,
      pages/catalogue/stacks cards with list rows, canvas card (fits the pane), Fluent properties pane; alerts as master/detail; leaving with unsaved
      edits now asks. Dash renderer untouched. Screenshots: `docs/design/_unpacked/desktop-dashes-*.png`, `desktop-dash-editor-*.png`
- [x] Devices (+ status, preview, custom wheel form) (agent: views-d)
      — CommandBar: Add device (primary) · Disable/Enable · Remove (confirmed in a ContentDialog) · Gallery/List select.
      List card (gallery tiles with the native-shape preview, or 32px rows), status = dot + word everywhere; detail =
      InfoBar for non-working states (Not found/Disabled info, USB/setup warnings, failures error) + Preview, Device,
      Output, Screen alignment, Screen performance cards. Add device = ContentDialog with Preset / Generic / Custom wheel
      tabs (custom wheel: Add wheel + Cancel). No brightness control: the host has no brightness command.
- [x] Setups, Race engineer (agent: views-d)
      — Setups: CommandBar Duplicate (primary) · Delete (8s undo as an InfoBar, no confirm); "All setups" table (Name |
      Type — setups carry no car/track/date) + per-group parameter cards. Race engineer: CommandBar Push (primary) ·
      Revert (ContentDialog confirm) · push status dot + word; telemetry link / push failure / send errors as InfoBars;
      car controls and radio log as caption-headed tables. Screenshots: `docs/design/_unpacked/desktop-{devices,setups,raceengineer}-*.png`

## Phase 3 — Verification (lead)

- [x] No Graphite variables left in `app/desktop/src` (`--panel`, `--text2`, `--line`, `--accent`, …) — only the Fluent `--accent-stroke*` tokens match
- [x] `pnpm --filter @sprint/desktop type-check` + `test` (51), web type-check + test (9), tokens (18), dashboard (78) — all green 2026-10-01
- [x] Fixed the blank-window crash: host frames (C# names) are converted to the dash renderer's shape once in `app/desktop/src/telemetryFrame.ts`, called from `bridge.ts`
- [ ] Every desktop view screenshotted light + dark against the Windows mockup; web pages against the Web mockup
      — desktop done: `docs/design/_unpacked/final-*.png` (all nine views light + dark, compact nav, five dialogs, sample state); web not re-checked
- [ ] MUST/NEVER pass against `DESIGN.md` (one primary per view, no glow, no orange toolbar fills on web, status = dot + word)
      — desktop: ≤1 `.button.primary` per PageHeader, status is the shared `.status` dot + word everywhere; web not re-checked
- [x] Consolidation (desktop): shared primitives load first (`main.tsx`); one `.status` / `Status` (`src/shell/Status.tsx`),
      one `ContentDialog` + `ConfirmDialog` (`src/shell/ContentDialog.tsx`: focus trap, Escape, focus return), one
      `.card.list-card` + `.card-header` + `.list-rows` + `.list-card-empty`; per-view copies and specificity hacks removed.
      Switch and setting row stay local to Settings (only view using them); card-header link stays local to Overview.

## Phase 4 — Docs restructure, t3code style (lead, after Phase 3)

Approved by Luca 2026-10-01. Model: github.com/pingdotgg/t3code (`AGENTS.md`, `docs/{user,internals,operations}`, `docs/README.md`).

- [x] Delete the old-design docs: `FIGMA_COMPONENTS.md`, `DESIGN_GLOSSARY.md`, Graphite research (`direct-ui-motion.md`, the Avalonia date-picker guidance), `docs/design/CLAUDE.md`
- [ ] Delete: `MIGRATION_INVENTORY.md`, `docs/plans/*`, `patterns/neue-buchung.md`, tracked `.agents/*.ps1` scratch, `WEB_DESKTOP_CUTOVER.md`
- [x] Decisions 0001–0037: deleted; the wheel-dash ones (0005–0011, 0015, 0026, 0033, 0035, 0037) and the wheel section of `docs/DESIGN.md` are condensed into `docs/internals/dash-rendering.md`
- [ ] Rewrite `AGENTS.md` t3-style (non-negotiables, glossary, ways to hurt yourself, hit every surface, verifying, docs rules, taste)
- [ ] Make `docs/design/design-system/DESIGN.md` Sprint's (drop budget domain + German rule)
- [ ] `SESSION_PLANNER.md` + `docs/specs/*` → decision-only `docs/internals/*`
- [x] `packages/tokens/README.md` update (the package ships only `windows.css` and `web.css`)
- [ ] Move: RELEASE/DEPLOYMENT/DIAGNOSTICS → `docs/operations/`, SCREEN_PROTOCOLS + kept research → `docs/internals/`, `docs/README.md` index, `docs/internals/glossary.md`
- [ ] `DESKTOP_SMOKE.md` → `.agents/skills/test-sprint-desktop` on the preview harness
- [ ] Move this checklist into a GitHub issue and delete it from the repo
