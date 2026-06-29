# Sprint UI Rebuild — match `docs/Sprint.fig` (Flat UI, dark, pill)

Date: 2026-06-20 · Branch: `feat/figma-flat-ui-theme`

## 0. Goal

Rebuild the desktop UI and component library so it matches the Figma file **exactly**, and arrange/
use those components per **macOS Human Interface Guidelines** (placement & usage), since Sprint is a
desktop app.

Three laws, in priority order:
1. **Figma = visual truth.** Tokens, fonts, component anatomy, and shapes are reproduced exactly.
2. **Apple design *approach* = the product philosophy.** Every screen is genuinely re-designed to be
   **decluttered, modern, rounded, and calm**: content-first, generous spacing, clear hierarchy,
   progressive disclosure (hide secondary controls until needed), one obvious primary action per
   context, restraint over density. This is **not** a re-skin — page information architecture,
   content, flows, and view logic are reworked where they improve the experience.
3. **macOS HIG = placement & usage.** Which component is used when, and where it lives — window/
   toolbar/sidebar/inspector conventions, control selection, spacing rhythm, keyboard/focus.

> **Why this matters / what went wrong before:** the prior "Apple Graphite" pass kept the old page
> content, density, IA, and logic and merely repainted it. The deliverable here is redesigned *pages*,
> not retinted ones.

## 1. Source of truth (extracted from the .fig)

Decoded `docs/Sprint.fig` directly (fig-kiwi → zstd → kiwi; 57,064 nodes). Full spec is in
`tmp/figma-extract/SPEC.md` (+ `components.txt`, `layout.txt`, `tokens.txt`). Re-extraction method is
recorded in memory `decode-sprint-fig-file`.

The design is **dark-only, single mode**, flat (solid fills + 1px hairlines, no glass/blur/glow), and
**pill-heavy**. Gradients appear only in the brand mark.

**Scope of each Figma page (confirmed with the user):**
- **"Components" page** = the component library — used **exactly**, app-wide.
- **"Layout" page** = a reference for the **Dash Studio / Dash Editor screen ONLY** (its car photo is just a
  background reference; not all content is final). It is **not** a template for any other screen.
- **All other screens** (Live/Telemetry, Engineer, Setup, Devices, Settings, Help, Dash list) have **no Figma
  layout** — they are designed fresh from the Components library + Apple's decluttered approach + macOS HIG
  placement. Do not extrapolate the Dash Editor layout onto them; design each for its own job.

### Fonts (self-host; offline Wails app cannot use a CDN)
- **Inter** — primary UI: Regular 400 / Medium 500 / Semi Bold 600 / Bold 700
- **Space Grotesk** — Bold 700 — SPRINT wordmark only
- **Saira** — Regular 400 / Bold 700 — tagline, input hint/counter text
- **Saira SemiCondensed** — Medium 500 / Bold 700 — badges/chips (uppercase)
- **Sora** — Regular 400 — incidental
- Base size 13px; tabular numerals for telemetry.
- Inter & Space Grotesk TTFs already exist at `app/internal/core/dashboard/fonts/`; need woff2 for the
  frontend + add Saira / Saira SemiCondensed / Sora.

### Tokens (Primitive → Semantic → Component)
- **Neutral** ramp: 50 #F6F6F6 · 100 #E4E4E4 · 200 #C6C6C6 · 300 #A0A0A0 · 400 #7A7A7A · 500 #5A5A5A ·
  600 #424242 · 700 #2E2E2E · 800 #1F1F1F · 850 #1A1A1A · 900 #141414 · 925 #0F0F0F · 950 #0A0A0A · 990 #050505
- **Orange** (accent): 400 #FF8636 · **500 #FF6A00** · 600 #E65D00 · 700 #BF4D00 · 950 #421A02
- **Green** 500 #16B566 / 700 #0E7445 / 950 #05281A · **Red** 500 #F02744 / 800 #851727 / 950 #3A0A10 ·
  **Blue** 500 #1F7FE6 / 700 #114F99 / 950 #091D38 · **Yellow** 500 #E0A30C / 700 #8F6406 / 950 #2E2002
  (full 50→950 ramps for all six families incl. Purple are in SPEC.md)
- **Radius**: xxs 4 · xs 6 · sm 8 · md 12 · lg 16 · xl 18 · pill 999
- **Space**: 2 · 4 · 6 · 8 · 10 · 14 · 16 · 18 · 20 · 22 · 36
- **Semantic**: Surface/Screen #050505 · App #0F0F0F · Panel #141414 · Tile #1F1F1F · Tile2 #2E2E2E ·
  Tile3 #424242 · Text/Default #F6F6F6 · Muted #A0A0A0 · Subtle #7A7A7A · Dark #141414 ·
  Border/Default #2E2E2E · Strong #424242 · Primary #FF6A00 (on-primary text #141414) · Primary/BG-Soft #FF6A001A.
  Status families Success/Error/Warning/Info map to {500 text, 700 border, 950 soft-bg}.
- **Component**: Button {padX 16, padY 6, radius 18, gap 4}; Input {radius 18, padX 10, padY 8};
  Badge {Icon=family500, Border=family700, BG=family950}; Toast {bg Tile, title Default, msg Muted}.

## 2. Strategy

- **Rebuild in place; reuse the wiring.** Keep Tailwind v4 + `class-variance-authority` + Radix and the
  CSS-variable consumption model. Replace token *values*, swap fonts, and reshape every component to the
  exact Figma spec. This is a re-skin-to-spec + recomposition, not a framework change — fastest route to
  fidelity, least regression of already-working focus/keyboard behavior.
- **One token vocabulary.** Collapse the parallel naming systems (new `--primitive/--semantic/--component`
  *and* legacy `--bg/--panel/--text/--line/--r` *and* `graphite.ts` *and* WinUI `platform.winui.*`) down to
  the Figma-named semantic set, keeping a thin back-compat alias layer only as long as needed to migrate
  consumers, then deleting it.
- **Icons = Tabler.** The Figma uses Tabler glyphs (`tabler/chevron-left`, `home`, `search`, `check`, `x`,
  `lock`, `trash`, `minus`, `square-dashed`, `layout-sidebar`, `brand-speedtest`, `wheel`…). Standardize UI
  on `@tabler/icons-react` (already a dep); retire `lucide-react` from UI usage.
- **Dark-only.** Remove light-mode scaffolding and the unused `mode (light/dark)` + empty `tw/*` Figma sets.

## 3. Workstreams

### A. Foundations — tokens & fonts  (`packages/tokens`, `app/frontend`)
1. **Fonts vendored offline**
   - Add `app/frontend/public/fonts/*.woff2`: Inter (400/500/600/700), Space Grotesk (700), Saira
     (400/700), Saira SemiCondensed (500/700), Sora (400).
   - Add `app/frontend/src/fonts.css` with `@font-face` (local `/fonts/…woff2`, `font-display: swap`).
   - `app/frontend/src/index.css`: replace the Google-Fonts `@import url(https://…)` with `@import './fonts.css'`.
   - Mirror for `web/` if it must run offline too (else leave its CDN import).
2. **Rewrite primitives** `src/atoms/colors.ts` (Neutral 50→990 + 6 ramps to Figma hex), `radii.ts`
   (4/6/8/12/16/18/pill), `typography.ts` (font families above; sizes 9/10/11/12/13/22/28; weights), and a
   spacing scale (2→36).
3. **Rewrite semantic** `src/semantic/index.ts` to the Surface/Text/Border/Primary/Status aliases above.
4. **Rewrite component** `src/component/index.ts` to Button/Input/Badge/Toast/Toggle/Segmented/Nav recipes.
5. **Rewrite `globals.css`** to emit the Figma-named CSS vars and base typography; keep a temporary
   `--bg/--panel/--text/--line/--r` alias block pointing at the new values for migration.
6. **`tailwind.config.ts`** fontFamily + theme keys point at the new families/scales.
7. **Delete cruft:** `platform.winui.*`, light-mode bits, and—after consumers migrate—`graphite.ts` +
   legacy alias block. Update `figma.ts` DTCG export to the new values. Fix the token tests
   (`surfaces.test.ts`, `tokenHierarchy.test.ts`) to assert the new hex/scale.

### B. Component library — exact Figma anatomy  (`packages/ui/src/components`)
Each rebuilt to the spec in §1/SPEC.md; macOS-HIG usage noted per component.

1. **Button** (`primitives/Button.tsx`) — `cva` variants `primary|secondary|destructive|disabled|success|error`
   × sizes `default(h~25, pad 6×16, r18)|icon(32, circle)`; `iconPosition left|right`, gap 4; Inter Medium 13;
   primary #FF6A00/#141414, secondary #1F1F1F/#F6F6F6, destructive #1F1F1F/#F02744, disabled #141414/#7A7A7A;
   primary icon-button adds 1px inner #FF8636. *HIG:* default push button = primary; one primary per
   region; destructive confirmed; min 28px hit target.
2. **IconButton** (`primitives/IconButton.tsx`) — 32 circle, Tile bg + #2E2E2E inner border (or #FF6A00/
   #FF8636 for primary save). Requires `aria-label` + tooltip. *HIG:* toolbar affordances.
3. **Input** (`primitives/input.tsx`) + **FieldGroup** (label/hint/error wrapper) — field bg #1F1F1F,
   border #2E2E2E, r18, h32, pad 8×10, gap 6, value Inter Regular 13 #F6F6F6, trailing icon 16; label Inter
   Regular 11 #A0A0A0; hint Saira Regular 12 #7A7A7A (right); states default/focus(#FF6A00)/error(#F02744 +
   message)/disabled. *HIG:* label above field, helper/error below.
4. **Badge / Chip** (`primitives/Badge.tsx`) — transparent bg, 1px colored inner border, r4, pad 4×10,
   Saira SemiCondensed Bold 12 uppercase; colors Red/Green/Blue/Orange/Neutral via {500/700/950}.
5. **StatusPill / Indicator** (`primitives/StatusPill.tsx` + new `Indicator.tsx`) — 32 circle, tinted bg +
   1px OUTER colored border, centered 24 icon; Green/Red/Orange/Blue/Neutral tints from §1.
6. **Switch / Toggle** (`primitives/switch.tsx`) — pill track pad 4; On #16B566 (knob right) / Off #1F1F1F
   (knob left); knob #F6F6F6 (disabled #424242); On-disabled track #0F5B38. *HIG:* switches for instant
   on/off settings (not deferred form submits).
7. **SegmentedControl** (`primitives/SegmentedControl.tsx`) — pill container #1F1F1F; segment pad 6×16, r-pill,
   Inter Medium 13; active #FF6A00/#141414 (and a light variant #F6F6F6/#141414 for page tabs); supports a
   per-segment trailing icon/options slot (lock, page move/delete) as seen in Layout. *HIG:* segmented for
   mutually-exclusive view switching inside one context.
8. **Tabs / TabView** (`primitives/tabs.tsx`) — pill container #1F1F1F, border #2E2E2E, r18, pad 4, 1px
   #2E2E2E dividers between items. *HIG:* tabs for peer categories, not global nav.
9. **Progress** (`primitives/progress.tsx`) — track #1F1F1F r-pill h8, fill #FF6A00 r-pill.
10. **Segments** (new `primitives/Segments.tsx`) — row of small pill segments (h8), filled #FF6A00 / #1F1F1F.
11. **Toast** (`primitives/Toast.tsx` + provider) — bg #1F1F1F, r-pill, pad 6/16/6/8, leading Indicator 32,
    Title Inter Bold 13 / Message Inter Regular 11 #A0A0A0; Success/Danger. *HIG:* transient, non-modal.
12. **Alert** (new `primitives/Alert.tsx`) — tinted bg (e.g. Success #05281A), r12, pad 6/16/6/8, Indicator 28
    + check 16, Title/Message. Inline status block.
13. **NavigationItem** (new `primitives/NavigationItem.tsx` or in NavRail) — h32, pad 8×10, gap 8–10, icon 16,
    Inter Medium 13; default text #A0A0A0; selected bg #2E2E2E r18 text #FF6A00 (+ optional 2px accent bar).
    *HIG:* macOS source-list selection styling.
14. **Tile / Card / SettingsCard / SettingsRow** — restyle to Surface/Tile #1F1F1F, r12 (widget tiles) / r18
    (panels), border #2E2E2E, Inter labels. Section labels Inter Semi/Bold 10 uppercase #7A7A7A.
15. **Modal / ConfirmDialog / Dialog / Popover / Select / Tooltip / Stepper / KeyChip / Separator / Checkbox /
    Sheet / Skeleton / Table / Textarea** — restyle to new tokens, pill/r18 surfaces, Inter, #2E2E2E borders,
    #FF6A00 focus. Modals keep the only allowed shadows. *HIG:* sheets/dialogs for blocking flows; Escape cancels.
16. **Telemetry components** (`components/telemetry/*`) — **keep** (domain-specific, not in Figma); only
    re-point colors/fonts to new tokens (red #F02744, blue #1F7FE6, Inter/Saira numerics).
17. Update `controlClasses.ts`, `panelClasses.ts`, `tabsClasses.ts` and the contract tests
    (`controlVariants.test.ts`, `primitiveContract.test.ts`, `tabsClasses.test.ts`, `panelClasses.test.ts`)
    to the new variants/values.

### C. App shell — window, sidebar, toolbar, panels  (`packages/ui/organisms`, `app/frontend`)
Match the Layout page; arrange per macOS HIG.
1. **AppShell / window chrome** — app body Surface/App #0F0F0F, content radius 18, 1px #2E2E2E framing; the
   outer window radius 12 + #404040 border + drop-shadows apply to the drawn frame (Wails frameless). Keep
   Wails drag regions.
2. **Sidebar** (`organisms/NavRail.tsx`) — 220px, bg #141414, border #2E2E2E, r18 inner corners, pad 14, gap
   14. Logo row: ember gradient icon tile 24 + wordmark (SPRINT Space Grotesk Bold 28 #FF6A00 / "TELEMETRY
   SYSTEM" Saira Bold 9 #CDCDCD + gradient underline) + collapse IconButton. Nav groups space-between with
   "DEVICES"-style section labels; NavigationItem selection per §B.13. *HIG:* macOS source list; primary nav
   lives here only.
3. **Header / Toolbar** (`organisms/Titlebar.tsx` + `PageHeader.tsx`, h45) — left navigation cluster (circular
   Back IconButton + search Input + Chip), center page SegmentedControl / TabView, right circular Save
   IconButton (#FF6A00/#FF8636) and window controls (minimize/maximize/close, Tabler 16). Replace the
   hardcoded `minmax` grid with flex + gap slots. *HIG:* toolbar = current-context actions; window controls
   conventional for the platform; group related controls, separators between groups.
4. **Body/Editor regions** (`organisms/BodyTray.tsx`) — formalize the 3-column inspector layout (left palette
   / canvas / right properties) as named regions. *HIG:* inspector on the right, library on the left.
5. **StatusStrip** — keep; re-point to new tokens.

### D. Per-view redesign — declutter & rethink every page  (`app/frontend/src/views`, `components`)
This is a real redesign of each screen, not a recompose. **Method per view:**
1. **Audit** — inventory the data shown, the actions, the current IA, and the specific clutter/UX problems
   (too much at once, weak hierarchy, buried primary action, redundant chrome, inconsistent controls).
2. **Decluttered IA** — decide the one primary job of the screen; promote primary content, group or hide
   secondary controls behind disclosure/segments/inspector; cut redundancy; pick a calm density.
3. **Redesign** with the rebuilt Figma components, placed per macOS HIG (toolbar = contextual actions,
   left source-list nav, right inspector, segmented for view switches), Apple-approach spacing & rounding.
4. **Refactor logic** — restructure the view's state/flow to support the new IA (frontend logic/IA changes
   are in scope). Backend/Go/Wails-binding changes only when a screen genuinely needs a cleaner data
   contract — each such change is called out and confirmed before implementation.
5. **Verify** all states (empty/loading/error/selected/disabled/destructive) and keyboard/focus.

Each view gets a short **redesign spec** (problems → new IA → layout → component map → logic deltas) written
before its build. Views & their redesign focus:
- **Dash Editor** (`views/DashEditor.tsx`, `components/DashEditMode.tsx`, `dash-editor/*`, `DashCanvas.tsx`,
  `WidgetPalette.tsx`, `WidgetProperties.tsx`, `PageTabs.tsx`) — the one screen the Figma Layout specifies;
  rebuild it **1:1** with the Layout (left palette 248px #141414 r18 with Pages/Widgets segmented + search +
  category groups + widget tiles 107×46 #1F1F1F r12; center canvas #050505 r18 with pill-dot grid; right
  Properties 155px). Migrate `.ds-*` in `styles/graphite-layout.css` to the new tokens; drop hardcoded
  hex/transitions. This is also the reference for the Apple-approach density everywhere else.
- **Home / Live Telemetry** (`Home.tsx`, `Telemetry.tsx`) — calm, glanceable dashboard; promote the few
  numbers that matter, demote the rest; consistent tiles; remove demo clutter.
- **Engineer** (`Engineer.tsx`) — group controls logically, progressive disclosure for advanced, clean
  race/radio log.
- **Setup / Controls** (`Controls.tsx`) — structured field groups + A/B comparison without overwhelming
  density.
- **Devices** (`Devices.tsx`, `devices/*`) — source-list picker + detail/inspector; clearer binding flow.
- **Settings** (`Settings.tsx`) — grouped settings cards, defaults only, no inline clutter.
- **Help** (`Help.tsx`) — scannable reference cards + shortcuts.
- **Dash list** (`DashList.tsx`) — card grid with live previews + clear create/duplicate/delete.
- **SplashScreen** — re-point to tokens, add `aria-live`.

### E. Cleanup, docs, verification
1. Rewrite `docs/DESIGN.md` to the real system (Inter/Space Grotesk/Saira; #050505→#F6F6F6 ramp; radii
   4/6/8/12/16/18/pill; red #F02744 / blue #1F7FE6); supersede the "Apple Graphite / IBM Plex" direction.
2. Grep-gate: no raw Figma hex outside `packages/tokens`; no `lucide-react` in UI; no IBM Plex / CDN font
   imports; no leftover `--panel/--line/--r` once migrated.
3. Tests/build: `pnpm --filter @sprint/tokens test`, `@sprint/ui test` + `type-check`, `@sprint/desktop
   type-check`, build the desktop frontend (`pnpm --filter @sprint/desktop build`) since Go embeds `dist/`.
4. Visual QA via Playwright MCP at `http://localhost:5173` (`cd app; wails dev`): verify each component's
   focus/hover/selected/disabled/empty/loading/destructive states and the Layout screen 1:1.

## 4. macOS HIG application (cross-cutting)
- Window: frameless drawn chrome, draggable toolbar, conventional traffic-light/window controls, content
  inset & rounded.
- Navigation: single source-list sidebar for primary nav; segmented controls for in-context view switches;
  tabs only for peer categories; toolbar for contextual actions.
- Controls: one primary action per region; switches for instant settings; clear destructive styling +
  confirmation; sentence-case labels; concise, no marketing copy.
- Layout & rhythm: consistent 14px panel padding / 6–14px gaps from the Space scale; right-side inspector;
  left-side library.
- Interaction & a11y: visible #FF6A00 focus ring on every control; full keyboard operability; Enter/Space
  activate, Escape cancels; predictable tab order; color never the sole status signal; reduced-motion respect;
  120–160ms functional transitions.

## 5. Sequencing & gates
1. A (tokens+fonts) → typecheck + token tests green. Gate: fonts render offline; new vars resolve.
2. B (components) in waves: Button/IconButton/Input/Badge → Switch/Segmented/Tabs/Progress/Segments →
   Indicator/Toast/Alert/Nav → Tile/Card/Settings/overlays. Gate: `@sprint/ui` tests + type-check; visual QA.
3. C (shell). Gate: Layout shell matches Figma; window controls + drag work in `wails dev`.
4. D (Dash Editor, then other views). Gate: editor 1:1 with Layout; other views consistent.
5. E (cleanup/docs/verify). Gate: grep-gates clean; full build embeds `dist/`.

Each wave is independently shippable behind the existing tokens, minimizing regression risk.

## 6. Risks
- **Offline fonts** are the top runtime risk (CDN import currently breaks embedded builds) — fix first.
- **Token alias migration**: many consumers use legacy `--bg/--panel/--line/--r`; migrate via alias layer,
  then delete, to avoid a big-bang break.
- **Pixel fidelity vs responsiveness**: Figma metrics are fixed-size; preserve exact metrics at the design
  resolution, add sensible min/scale behavior without altering the look.
- **Don't regress telemetry/dash runtime** — those are domain components; only re-token them.

## 7. Open items for confirmation
- **Logic-change boundary** (default assumed): frontend IA/state/flow changes are in scope for the per-view
  redesigns; backend Go / Wails-binding contract changes only when a screen genuinely needs them, called out
  and confirmed first. Confirm this is the boundary you want.
- **Per-view redesign depth**: every screen redesigned (default) — confirm, or name screens to prioritize/defer.
- Reuse-in-place vs from-scratch for components/tokens (defaulting to **reuse**).
- Whether `web/` (Next.js) must also adopt the new system now or later (default: later).
