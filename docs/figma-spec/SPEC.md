# Sprint — Figma Design Spec (extracted from docs/Sprint.fig)

Source of truth: decoded directly from `docs/Sprint.fig` (fig-kiwi → zstd → kiwi message,
617 defs, 57,064 nodes). Pages: **Layout** (basic app layout; car photo is a reference
background only), **Components** (the component library — use exactly), plus icon libraries.

This is a **dark-only, single-mode** design. Heavy use of **pill** radii and flat fills with
1px hairline borders. No glass/blur/gradient surfaces (gradients only in the brand logo mark).

## Fonts (all open-source / Google Fonts — self-host for offline Wails app)
- **Inter** — primary UI: Regular 400, Medium 500, Semi Bold 600, Bold 700
- **Space Grotesk** — Bold 700 — SPRINT wordmark only
- **Saira** — Regular 400, Bold 700 — tagline ("TELEMETRY SYSTEM"), input hints/counters
- **Saira SemiCondensed** — Medium 500, Bold 700 — badges/chips (uppercase, e.g. "SPORT")
- **Sora** — Regular 400 — minor/incidental
- Base UI size **13px**. Tabular numerals for telemetry.

## Token Hierarchy (Primitive → Semantic → Component)

### Primitive — Neutral ramp
| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| Neutral/50 | #F6F6F6 | | Neutral/600 | #424242 |
| Neutral/100 | #E4E4E4 | | Neutral/700 | #2E2E2E |
| Neutral/200 | #C6C6C6 | | Neutral/800 | #1F1F1F |
| Neutral/300 | #A0A0A0 | | Neutral/850 | #1A1A1A |
| Neutral/400 | #7A7A7A | | Neutral/900 | #141414 |
| Neutral/500 | #5A5A5A | | Neutral/925 | #0F0F0F |
| | | | Neutral/950 | #0A0A0A |
| | | | Neutral/990 | #050505 |

### Primitive — color ramps (50→950/990; key stops)
- **Orange** (accent): 50 #FFF4EC · 100 #FFE3CF · 200 #FFC59A · 300 #FFA363 · 400 #FF8636 · **500 #FF6A00** · 600 #E65D00 · 700 #BF4D00 · 800 #983D00 · 900 #7A3204 · 950 #421A02 · 990 #230E01
- **Green**: 50 #E6FFF2 · 300 #52EAA3 · 400 #2ED47C · **500 #16B566** · 600 #0F9355 · 700 #0E7445 · 800 #0F5B38 · 900 #0C4A2E · 950 #05281A
- **Red**: 50 #FFF0F2 · 300 #FF8493 · 400 #FF4D62 · **500 #F02744** · 600 #C91A34 · 700 #A4172C · 800 #851727 · 900 #6D1421 · 950 #3A0A10
- **Yellow**: 400 #FFC21A · **500 #E0A30C** · 700 #8F6406 · 950 #2E2002
- **Blue**: 50 #ECF5FF · 300 #6BB4FF · 400 #3B9EFF · **500 #1F7FE6** · 600 #1564BF · 700 #114F99 · 950 #091D38
- **Purple**: **500 #8F76FF** · 700 #5943B3 · 950 #120D2A  *(NOTE: the `#8A38F5` purple seen on component frames is Figma's variant-container stroke, NOT a design color — ignore it.)*

### Primitive — radius & spacing
- Radius: **xxs 4 · xs 6 · sm 8 · md 12 · lg 16 · xl 18 · pill 999**
- Space: **1=2 · 2=4 · 3=6 · 4=8 · 5=10 · 6=14 · 7=16 · 8=18 · 9=20 · 10=22 · 12=36**

### Semantic aliases
| Semantic | → Primitive | Hex |
|---|---|---|
| Surface/Screen | Neutral/990 | #050505 (dash canvas, darkest) |
| Surface/App | Neutral/925 | #0F0F0F (app window body) |
| Surface/Panel | Neutral/900 | #141414 (sidebar, side panels) |
| Surface/Tile | Neutral/800 | #1F1F1F (controls, inputs, tiles) |
| Surface/Tile 2 | Neutral/700 | #2E2E2E (hover/selected) |
| Surface/Tile 3 | Neutral/600 | #424242 |
| Text/Default | Neutral/50 | #F6F6F6 |
| Text/Muted | Neutral/300 | #A0A0A0 |
| Text/Subtle | Neutral/400 | #7A7A7A |
| Text/Dark | Neutral/900 | #141414 (text on accent/light fills) |
| Border/Default | Neutral/700 | #2E2E2E |
| Border/Strong | Neutral/600 | #424242 |
| Primary/Primary | Orange/500 | #FF6A00 |
| Primary/Border | Orange/700 | #BF4D00 (icon-button uses Orange/400 #FF8636) |
| Primary/BG-Soft | — | #FF6A001A (10% orange) |
| Success/* | Green 500/700/950 | #16B566 / #0E7445 / #05281A |
| Error/* | Red 500/800/950 | #F02744 / #851727 / #3A0A10 |
| Warning/* | Yellow 500/700/950 | #E0A30C / #8F6406 / #2E2002 |
| Info/* | Blue 500/700/950 | #1F7FE6 / #114F99 / #091D38 |

### Component tokens
- **Button**: PaddingX=16, PaddingY=6, Radius=18, Gap=4. Primary bg=#FF6A00 text=#141414 · Secondary bg=#1F1F1F text=#F6F6F6 · Danger bg=#1F1F1F text=#F02744 · Disabled bg=#141414 text=#7A7A7A
- **Input**: Radius=18, PaddingX=10, PaddingY=8
- **Badges** (Red/Green/Orange/Neutral): Icon/Border/Background trios using {500 / 700 / 950} of the family (neutral = 300/700/900)
- **Toast**: bg=#1F1F1F, Title=#F6F6F6, Message=#A0A0A0

## Components (Components page — 12 components, build EXACTLY)

1. **Button** — variant-set, props {Label, Icon(swap), Variant, Size, Icon(show), Icon Position}.
   - Default size: h≈25, pad 6×16, radius 18, Inter Medium 13, gap 4 (icon↔label). Icon left or right.
   - Variants: Primary (#FF6A00/#141414), Secondary (#1F1F1F/#F6F6F6), Destructive (#1F1F1F/#F02744), Disabled (#141414/#7A7A7A), Primary_Success (#16B566), Primary_Error (#F02744).
   - Size=Icon: 32×32 circle (radius pill). Primary icon-btn adds 1px inner stroke #FF8636; secondary #2E2E2E.
2. **Navigation Item** — props {Label, Icon(swap), State}. h32, pad 8×10, gap 8–10, icon 16, Inter Medium 13.
   - Default: transparent, text #A0A0A0. Selected: bg #2E2E2E, radius 18, text #FF6A00 (+ optional 2×18 accent bar / focus outline variants, hidden by default).
3. **Input w Label** — props {Text, Label, Hint, Error Message, Icon, Show Icon/Hint/Label, State}.
   - Label: Inter Regular 11 #A0A0A0. Field: bg #1F1F1F, border #2E2E2E, radius 18, h32, pad 8×10, gap 6; value Inter Regular 13 #F6F6F6; trailing icon 16. Hint: Saira Regular 12 #7A7A7A ("0/20", right).
   - Focus: border #FF6A00. Error: border #F02744 + message Inter Regular 11 #F02744. Disabled: value #7A7A7A.
4. **Chip / Badge** — props {Label, Color(Red/Green/Blue)}. Transparent bg, 1px colored inner border, radius 4, pad 4×10. Text Saira SemiCondensed Bold 12, uppercase, colored (Red #F02744, Green #16B566, Blue #1F7FE6).
5. **Toast** — props {Title, Message, Type(Success/Danger)}. bg #1F1F1F, radius pill, pad 6/16/6/8, gap 10. Leading Indicator circle 32 (Success #05281A/#0E7445, Danger #3A0A10/#A4172C). Title Inter Bold 13 #F6F6F6, Message Inter Regular 11 #A0A0A0.
6. **Alert** — props {Title, Message, Type}. Tinted bg (Success #05281A), radius 12, pad 6/16/6/8. Indicator 28 circle with check icon 16. Same Title/Message styles.
7. **Indicator** — props {Icon, Color(Green/Red/Orange/Blue/Neutral)}. 32×32 circle (radius pill), tinted bg + 1px OUTER colored border, centered 24 icon. (Green #05281A/#0E7445 · Red #3A0A10/#A4172C · Orange #421A02/#BF4D00 · Blue #091D38/#114F99 · Neutral #141414/#2E2E2E).
8. **Toggle (Switch)** — props {State: On/On_Disabled/Off/Off_Disabled}. Track ≈ pill, pad 4. On #16B566 (knob right), Off #1F1F1F (knob left). Knob #F6F6F6 (disabled #424242). On_Disabled track #0F5B38.
9. **Segmented Control** — container #1F1F1F radius pill. Segments pad 6×16/18, radius pill, Inter Medium 13. Active: bg #FF6A00 text #141414 (or bg #F6F6F6 text #141414 for the light/page-tab variant). Inactive: text #F6F6F6/#A0A0A0.
10. **Tab View** — pill container #1F1F1F, border #2E2E2E, radius 18, pad 4; items separated by 1px #2E2E2E dividers.
11. **Progress Bar** — track #1F1F1F radius pill h8; fill #FF6A00 radius pill.
12. **Segments** — row of small pill segments (h8), filled #FF6A00 (active) / #1F1F1F (inactive) — a step/progress indicator.

## Layout (Layout page — the Dash Studio Editor screen; basic layout reference)

- **App window**: 1570×883, radius 12, bg #0F0F0F, 1px outer border #404040, drop shadows (0/8 blur16, 0/4 blur2 @ #00000024). (In Wails the OS frame is hidden; app draws its own chrome.)
- **Sidebar** (220px, bg #141414, border #2E2E2E, radius 18 on inner corners, pad 14, gap 14):
  - Logo row: gradient ember icon tile 24 + wordmark ("SPRINT" Space Grotesk Bold 28 #FF6A00 / "TELEMETRY SYSTEM" Saira Bold 9 #CDCDCD + gradient underline) + sidebar-collapse icon button (24).
  - Nav (space-between): Top group (nav items + sectioned group with "DEVICES" label Inter Bold 10 #7A7A7A) and Bottom group. Selected item bg #2E2E2E radius 18.
- **Content** → **Header** (h45) + **Main**.
  - Header: Navigation cluster (circular Back button 32 #1F1F1F/#2E2E2E + search Input 220 + Chip), page Segmented Control (page tabs w/ lock + per-page options buttons), Tab View, circular Save button 32 (#FF6A00/#FF8636), and window controls (minimize/maximize/close, tabler icons 16).
  - Main → **Dash Editor**: three columns —
    - **Left palette** (248px, #141414, border #2E2E2E, radius 18): Pages/Widgets segmented control, search Input, category groups ("DRIVING" Inter SemiBold 10 #7A7A7A) of Widget tiles (107×46, #1F1F1F, radius 12, icon 13 + title Inter SemiBold 11 #A0A0A0).
    - **Canvas** (center): grid Container 800×480, bg #050505, border #2E2E2E, radius 18, dotted placement grid (4×4 pill dots #1F1F1F).
    - **Properties** (155px, #141414, border #2E2E2E, radius 18): "PROPERTIES" title + property rows (icon tile 29 #1F1F1F radius 12 + label).

## Notes vs. current repo (docs/DESIGN.md "Graphite")
- DESIGN.md says **IBM Plex Sans** + surfaces #070707/#0D0D0D/#131313 + radius 10 + red #F5483D + blue #4F9CFF. The Figma actually uses **Inter** + surfaces #050505/#0F0F0F/#141414/#1F1F1F + radii 4/8/12/18/pill + red #F02744 + blue #1F7FE6. The whole token set and font stack must be replaced to match Figma.
