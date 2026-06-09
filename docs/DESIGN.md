# Sprint — Telemetry System · DESIGN.md
**Exported from `Sprint.fig`.** This document mirrors the Figma file — its pages, its variable names, its auto-layout values — and maps each piece to the CSS extract. It does not restate anything the Figma doesn't contain.

Precedence: **Figma → `dash-app/sprint-ds.css` → this document.** If they disagree, fix downstream, never upstream.

File map:
- `Sprint Style Guide.html` — interactive style guide; loads `dash-app/sprint-ds.css` directly so it cannot drift.
- `Sprint Dashboard.html` — app shell (`dash-app/sprint-ds.css` components + `dash-app/app.css` layout only + `dash-app/app.js`).
- `assets/` — `sprint-wallpaper.png` (desktop backdrop), `sprint-icon.svg`/`.png` (racing-line app icon), `sprint-square.svg`, `sprint-pattern.svg`.

---

## 1. Figma file structure

| Page | Contents |
|---|---|
| **Components** | Every shared component (buttons, segmented, nav, badges, icon tiles, alerts, inputs, bars, brand) — extracted 1:1 into `sprint-ds.css` |
| **Layout** | The `application` frame: window 1570×883, titlebar, sidebar, content screen, topbar |

All components are auto-layout frames, **Hug** on the text axis, fixed heights. Strokes are real 1px strokes (position noted per component) — never effects/shadow rings. The only drop shadow in the file is on the window frame itself.

## 2. Variables

Naming convention: `Collection/Group/Name`. Names marked ✓ are read directly off the Figma inspector; the rest follow the same pattern — confirm in the Variables panel before adding new ones. **Never use a raw hex in a mockup; always go through the token.**

### Color/Surface
| Figma variable | Hex | CSS var |
|---|---|---|
| `Color/Surface/Screen` | `#0a0a0a` | `--bg` |
| `Color/Surface/Deep` | `#050505` | `--bg-deep` |
| `Color/Surface/Panel` ✓ | `#0f0f0f` | `--win` / `--panel` / `--tile` |
| `Color/Surface/Tile 2` ✓ | `#141414` | `--panel-2` / `--tile-2` |
| `Color/Surface/Tile 3` | `#1a1a1a` | `--panel-3` / `--tile-3` |
| `Color/Surface/Tile 4` | `#1f1f1f` | `--panel-4` / `--tile-4` |

### Color/Border
| Figma variable | Hex | CSS var |
|---|---|---|
| `Color/Border/Default` ✓ | `#2e2e2e` | `--border` |
| `Color/Border/Strong` | `#424242` | `--border-2` |
| `Color/Border/Window` | `#404040` | `--win-edge` |

### Color/Text
| Figma variable | Hex | CSS var |
|---|---|---|
| `Color/Text/Primary` | `#f6f6f6` | `--text` |
| `Color/Text/Muted` | `#7a7a7a` | `--muted` |
| `Color/Text/Muted 2` | `#5a5a5a` | `--muted-2` |
| white | `#ffffff` | titlebar app name only |

### Color/{Hue}/500 — signal anchors
Signal colours are referenced at the **500 step** (e.g. `Color/Red/500` ✓). Never substitute brighter 400s.

| Figma variable | Hex | Meaning |
|---|---|---|
| `Color/Orange/500` | `#ff6a00` | primary / active / selected / key value |
| `Color/Green/500` | `#16b566` | ready · healthy · dry · PB · positive Δ |
| `Color/Red/500` ✓ | `#f02744` | stop · fault · invalid · negative Δ |
| `Color/Amber/500` | `#e0a30c` | caution · assist |
| `Color/Blue/500` | `#1f7fe6` | info · cold |

### Badges/{Hue} — dark severity pairs
Severity fills on icon tiles / alert indicators / danger buttons come from the **Badges** collection (dark tint + ring), not from alpha washes.

| Figma variables | Background / Border | CSS vars |
|---|---|---|
| `Badges/Green/Background` + `Border` | `#05281a` / `#0e7445` | `--green-tint` / `--green-ring` |
| `Badges/Red/Background` ✓ + `Border` ✓ | `#3a0a10` / `#851727` | `--red-tint` / `--red-ring` |
| `Badges/Amber/…` | `#2b2003` / `#8a6507` | `--amber-tint` / `--amber-ring` |
| `Badges/Blue/…` | `#071a30` / `#11457f` | `--blue-tint` / `--blue-ring` |
| `Badges/Orange/…` | `#33170a` / `#9c4505` | `--orange-tint` / `--orange-ring` |

### Button/Primary
`Button/Primary/Background` ✓ = `#ff6a00`, ink on it = `#141414`.

`-soft` ≈12–14% alpha washes exist in CSS for subtle hovers only — they are not Figma fills.

## 3. Typography

| Family | Role |
|---|---|
| **Inter** | All UI strings. Titles **700/13** · body/values **13** · nav labels **500/13** · secondary **11** · micro group labels **700/10–12 UPPERCASE muted** |
| **Saira** (tabular) | All numbers: lap times, deltas, speeds, temps, fuel, table figures · hints/counters **12** · sidebar section labels **11** · topbar context title **11 white** |
| **Saira Semi Condensed** | Badges/mode tags **700/12** · segmented & page-tab labels **500/13** · SPRINT wordmark **700** |
| **Space Grotesk** | Titlebar `S` tile glyph **700/13** · big lockup wordmark |

`body{font-family:'Inter';font-variant-numeric:tabular-nums}` · `.mono{font-family:'Saira';font-feature-settings:"tnum" 1}`.

## 4. Radius & spacing

Radius scale — each size has exactly one job:
`14` window · content screen · cards · topbar · panels — `10` alerts · widget tiles · tab-group container — `8` buttons · inputs · nav items · seg/badge-group containers — `6` icon tiles · seg items · `S` tile — `4` badges · add-tab tile — `999` pills (progress, toggle).

Spacing scale: `2 · 4 · 6 · 8 · 10 · 14` (every padding/gap in the inspector lands on this scale). Layout is always auto-layout / flex+grid with `gap` — never inline-flow spacing.

## 5. Components (Figma inspector values → `sprint-ds.css`)

Format: frame size · padding x/y · item spacing · radius · fill · stroke (position). CSS padding-compensates inside strokes by 1px so box sizes match Figma.

- **Button** `.btn` — Hug×**25** · pad **14/6** · **r8** · Inter 700/13. Primary = `Button/Primary/Background`, ink `#141414` (one per view) · Secondary/Ghost = `Surface/Tile 2` + `Border/Default` (inside 1) · Danger = `Badges/Red/Background` + `Badges/Red/Border`, text `Red/500` · Disabled = `Surface/Panel` + `Border/Default`, text `Text/Muted 2` · `.sm` pad 10/4, 12px.
- **Badge / Mode tag** `.tag`/`.mpill` — Hug×**20** · pad **10/4** · spacing 10 · **r4** · Saira SC 700/12. Outline (default): **no fill**, stroke `Color/{Hue}/500` (inside 1) + matching text (`SPORT` red, `DRY` green). Solid variant: fill `{Hue}/500`, ink `#0a0a0a` — one per view max.
- **Icon tile** `.ictile` — **25×25** · pad **6** · **r6** · icon 13. Fill `Badges/{Hue}/Background`, stroke `Badges/{Hue}/Border` (**outside 1** in Figma; CSS draws it inside keeping the 25px box). `.lg` = 28×28, icon 16 — the alert indicator. Greyed when inactive.
- **Segmented / Button group** `.seg > button` — container `Surface/Panel` · **r8** · pad 4 · gap 2 · `Border/Default`; items Hug×**25** · pad 14/6 · **r6** · Saira SC 500/13. `.on` = `Surface/Tile 3` + 1px `Orange/500` + orange text; rest transparent muted.
- **Navigation item** `.nav-item` — Hug(150–220)×**32** · pad **10/8** · spacing **10** · **r8** · 16px icon + Inter 500/13. Rest: transparent, muted · hover: `Surface/Tile 2` (`Border/Default` on the raised Figma variant) · `.active`: `Surface/Tile 3` + 1px `Orange/500` + orange icon/label. Sidebar-width (220) row variant: fill `Surface/Panel` + `Border/Default`, same metrics. Sidebar section label = Saira 11 muted, 6px x-inset.
- **Alert** `.alert.(danger|ok|caution|info)` — **r10** · fill `Surface/Panel` · **neutral** `Border/Default` · pad 10 · gap 10. Severity lives only in the 28px indicator tile (Badges pair). Title Inter 700/13 · body Inter 11 muted.
- **Input** `.field > label + .input` — label Inter 11 muted · field H**32** · **r8** · fill `Surface/Tile 2` + `Border/Default` · pad-x 10 · gap 6 · value Inter 13 · optional 16px trailing icon. Focus = `Orange/500` border · error = red label + red border + `.msg` Inter 11 red. `.hint` counter Saira 12 `Text/Muted 2` right-aligned. Numeric fields right-aligned Saira. Slider fill is painted orange L→thumb by JS (`paintRange`) — never hardcode the %.
- **Progress** `.progbar` — H8 · pill · track `Surface/Tile 3` · orange fill. **Segment bar** `.segbar` — H8 · gap 2 · seg r10 · orange.
- **Card** `.card` — fill `Surface/Panel` · `Border/Default` · **r14** · pad 14 · title Inter 700/13 + `.card-sub` 11 muted · selected = orange border. **Chip** `.chip` (+ `.live` green pulse-dot).
- **Widget tile** (editor palette) — **107×46** · **r10** · `Surface/Tile 3` + `Border/Strong` · pad 8 · 13px icon · title Inter 700/11 muted · group label Inter 700/10 `Text/Muted 2` UPPERCASE.
- **Toggle** `.toggle` — 44×24 pill · 18px knob · `.on` = `Badges/Green` pair + green knob. *(CSS extension — not on the Components page yet; add it there when touched.)*

View system (app, not Figma): `.view{display:none}`/`.view.active{display:block}`; active view persists to URL hash + localStorage; entrance animations never start at `opacity:0`.

## 6. Layout page — `application` frame, 1:1

- **Window** — **1570×883** · **r14** · `Surface/Panel` · 1px `Border/Window` ring + soft drop shadows (`0 4 2` and `0 8 16`, black 14%) · floats on `assets/sprint-wallpaper.png`. Stage scales via `transform: scale()`; controls outside the scaled node.
- **Titlebar** — H**32** · pad-x 14 · gap 8. Left: orange `S` tile **20×20 r6** (Space Grotesk 700/13, ink `Surface/Panel`) + `Sprint` (Inter 700/13 white) + `— Telemetry System` (Inter 13 muted — the suffix slot carries the window context). Right: caption cluster min/max/close (close hovers red). Nothing else lives in the titlebar.
- **Sidebar** — **220** wide · pad 10 · gap 14 · transparent on the window surface · **no logo block**. Sections top (Saira 11 label, 6px gap to items), Settings + Help pinned bottom (column is space-between).
- **Content screen** — fills right of sidebar (1350×851 at base) · **r14** · `Surface/Screen` · inset 1px `Border/Default` · pad 14 · gap 14.
- **Topbar** — H**41** · **r14** · `Surface/Panel` + `Border/Default` · pad 4/8. Left: back tile 21×21 r6 `Surface/Tile 2` + context title (Saira 11 white). Center: page tabs — container r10 `Surface/Tile 2`; items r8; selected `Surface/Tile 4` + orange border + orange text; locked tab 10px lock glyph; closable tabs 10px ×; add-tab 18×18 r4 dashed tile. Right: action cluster gap 4 — secondary button(s) + the view's single primary.

## 7. Brand & icons

- In-chrome mark = the titlebar `S` tile (above). The `SPRINT` wordmark lockup (Saira SC 700 upright orange + `TELEMETRY`/`SYSTEM` sub + orange strip) is for brand docs only. `assets/sprint-icon.svg` (racing line) is the marketing/app icon.
- Line icons **16px, stroke 1.8–2** (Tabler-style geometry, 24 viewBox; the Figma ships Tabler / Lucide / Remix / Huge sets — pick Tabler first). 13px in dense tiles, 10px in tab affordances. Never hand-draw complex illustrations; track maps, gauges, simple car schematics are fine as clean vectors. Photographic content = striped placeholder + monospace caption.

## 8. App views (shell content, brief)

Sidebar: **Developer → Dashboard** (live-telemetry sim, dev-only) · **Configure → Dash Editor** (home) + **Devices** · **System → Settings**. Default landing = Dash Editor (builder for a VoCore 5″ 800×480 wheel display; left Widgets palette panel 240w r14 `Surface/Panel` with search + grouped widget tiles; theme/font gallery is an end-user feature — brand defaults stay racing orange + Saira). Dashboard runs a rAF telemetry simulation (~10× sim clock, lap/sector/fuel/tyre models, LIVE/PAUSE freeze).
