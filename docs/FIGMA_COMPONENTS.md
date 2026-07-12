# Historical Sprint.fig Component Extraction

> This document describes the retired Figma baseline and is retained only for
> migration context. `docs/DESIGN.md` and the native Avalonia UI review captures
> are the current product contract. Do not use values below for new work.

Decoded from `docs/Sprint.fig`, pages "Components" and "Layout".

This was the maintainer's visual source of truth. Values below were mechanically
extracted from the Figma file's node tree: fills, strokes, radii, autolayout,
and fonts. Where the current `docs/DESIGN.md` or `Graphite.cs` differ, the
Figma values were the target for the retired baseline.

## Palette

- Window frame fill `#0F0F0F`, outer window border `#404040`, window radius 14, drop shadows (0,8,16 + 0,4,2 at approximately 14% black)
- Content/canvas bg `#0A0A0A`
- Panel (sidebar/toolbar/palette/alert/card) `#0F0F0F`
- Control / inset (inputs, secondary buttons, icon buttons) `#141414`
- Raised / selected `#1A1A1A` (selected segmented item also seen `#1F1F1F`)
- Hairline border `#2E2E2E` everywhere (widget-palette cards use `#424242`)
- Text primary `#F6F6F6` (pure white `#FFFFFF` for brand/title strings), secondary `#7A7A7A`, hint/captions `#5A5A5A`
- Accent ember `#FF6A00`; text on ember = dark `#141414`/`#0F0F0F`
- Danger `#F02744`; danger tint fill `#3A0A10`, tint border `#851727` (indicator variant `#A4172C`)
- Success `#16B566`; tint fill `#05281A`, tint border `#0E7445`
- Warning (ember family): tint fill `#421A02`, tint border `#BF4D00`, icon `#FF6A00`
- Neutral indicator: fill `#141414`, border `#2E2E2E`, icon `#A0A0A0`

## Radii Scale

- 4 = chips/badges, tiny icon buttons (add-page)
- 6 = icon tiles/indicators, logo tile, toolbar icon-button
- 8 = buttons, inputs, nav items, segmented items
- 10 = cards, alerts, widget cards, segmented container (components page shows 8, layout page 10)
- 14 = panels, content tray, toolbar bar, window
- 999 = progress/segment capsules

## Typography

- Inter Regular/Medium/SemiBold/Bold at 10/11/12/13 px (body 13, secondary 11, captions/section labels 10-12); Inter SemiBold 36 for large telemetry values
- Saira Regular 11/12: sidebar section labels, toolbar doc title, numeric hint counters ("0/20")
- Saira SemiCondensed Medium 13 / Bold 12: segmented-control items and chips (uppercase motorsport labels: TOUR/SPORT/RACE/DRY)
- Space Grotesk Bold: brand glyph "S" in logo tile
- Icons: Tabler (primary) + Remix sets, 16px standard, 13px small, 10px inline-in-tab

## Components

### Button

- Height 25
- Padding 6 vertical / 14 horizontal
- Radius 8
- Label Inter Bold 13
- Primary: fill `#FF6A00`, text `#141414`
- Secondary: fill `#141414`, border `#2E2E2E`, text `#F6F6F6`
- Danger: fill `#3A0A10`, border `#851727`, text `#F02744`
- Disabled: fill `#0F0F0F`, border `#2E2E2E`, text `#5A5A5A`

### ButtonGroup / SegmentedControl

- Container fill `#0F0F0F`-`#141414`, border `#2E2E2E`, radius 8-10, padding 4, item spacing 2
- Item height 25, padding 6/14, radius 8
- Selected: fill `#1A1A1A`/`#1F1F1F`, `#2E2E2E` border, 1px ember outline, ember text
- Unselected: transparent, text `#7A7A7A`
- Labels Saira SemiCondensed Medium 13
- Items can host 10px trailing icons (lock = protected page, close = removable page)
- Optional 18x18 radius-4 icon-only add button beside the group

### Input With Label

- Label Inter Regular 11 `#7A7A7A` above, 2px gap
- Field height 32, fill `#141414`, border `#2E2E2E`, radius 8, padding 8/10
- Value Inter Regular 13 `#F6F6F6`
- Optional trailing 16px icon
- Focus: fill `#0F0F0F`, ember 1px border
- Error: border, label, and message `#F02744`
- Message Inter Regular 11, right side
- Hint counter "0/20" Saira Regular 12 `#5A5A5A` bottom-right

### NavigationItem

- 200x32, radius 8, padding 8/10, spacing 10, icon 16px + label Inter Medium 13
- Default: fill `#0F0F0F`, label/icon `#7A7A7A`
- Selected: fill `#1A1A1A`, border `#2E2E2E` + 1px ember outline, label/icon `#FF6A00`

### Alert

- Fill `#0F0F0F`, border `#2E2E2E`, radius 10, padding 10, spacing 10
- Leading Indicator 28x28 radius 6, tinted per severity, 16px icon
- Title Inter Bold 13 `#F6F6F6`
- Body Inter Regular 11 `#7A7A7A`
- Variants shown: Danger (Remix error-warning), Success (Tabler check)

### Chip / Badge

- Height 20
- Radius 4
- Padding 4/10
- No fill
- 1px colored border + same-color text
- Saira SemiCondensed Bold 12
- Uppercase examples: SPORT=`#F02744`, DRY=`#16B566`

### Indicator

- 25x25 (28x28 in alerts)
- Radius 6
- Tinted fill and border per severity
- 13-16px status-colored icon
- Examples: bolt=green, circle-exclamation=red, triangle-exclamation=ember/neutral

### Segments

- Segmented capsule meter
- 8px tall
- Item radius 10/999
- 2px gaps
- Filled `#FF6A00`
- Empty `#1A1A1A`

### ProgressBar

- 8px track `#1A1A1A` radius 999
- Ember fill radius 10

### Shell

- Titlebar 32px, padding 6/14, spacing 14
- Logo tile 20x20 ember radius 6 with Space Grotesk "S" in dark text
- Brand "Sprint" Inter Bold 13 white + breadcrumb " - Home" Inter Regular 13 `#7A7A7A`
- History chevrons (Tabler chevron-left, chevron-right) + sidebar toggle (Tabler layout-sidebar), 16px
- Right: 3 window buttons 32x32 icon-only (Tabler minus, Tabler square-dashed, Remix close), no fills
- Sidebar 220px, padding 10, spacing 14
- Section label Saira Regular 11 `#7A7A7A` with 6px left pad
- NavigationItem instances 200x32
- Bottom-pinned group (settings/help)
- Content tray: fill `#0A0A0A`, border `#2E2E2E`, radius 14, padding 14, gap 14

### Editor Page

- Toolbar height 41, fill `#0F0F0F`, border `#2E2E2E`, radius 14, padding 4/8
- Toolbar zones: nav | page tabs | actions
- Back icon-button 21x21, fill `#141414`, border `#2E2E2E`, radius 6, 13px icon
- Document title Saira Regular 11 white
- Page tabs = ButtonGroup (Idle lock / Main selected / Details close / add)
- Right actions: Secondary button + Primary "Save"
- Widget palette: 240px panel, fill `#0F0F0F`, border `#2E2E2E`, radius 14, padding 10, gap 10
- Palette header "WIDGETS" Inter SemiBold 12 `#7A7A7A`
- Palette caption "Drag onto the grid to place" Inter Regular 10 `#5A5A5A`
- Search = Input instance
- Category label "DRIVING" Inter SemiBold 10 `#5A5A5A`
- Widget card 107x46, fill `#1A1A1A`, border `#424242`, radius 10, padding 8
- Widget-card contents: 13px Tabler icon + title Inter SemiBold 11 `#7A7A7A` (Gear, Tyre Temps)

## Known Deltas Vs `docs/DESIGN.md`

The current design doc is stale relative to the fig.

- Surfaces: `docs/DESIGN.md` `#070707/#0D0D0D/#131313/#1B1B1B` vs fig `#0A0A0A/#0F0F0F/#141414/#1A1A1A`
- Hairlines: `docs/DESIGN.md` `#1A1A1A/#232323` vs fig `#2E2E2E` plus `#424242` special
- Text: `docs/DESIGN.md` `#ECECEC/#9A9A9A/#5C5C5C` vs fig `#F6F6F6/#7A7A7A/#5A5A5A`
- Danger red: `docs/DESIGN.md` `#F5483D` vs fig `#F02744`; fig adds tint fills/borders for danger/success/warning
- Radius: `docs/DESIGN.md` 10 default vs fig scale 4/6/8/10/14
- Titlebar: `docs/DESIGN.md` 40px vs fig 32px; sidebar 208px vs fig 220px
- Fonts: fig additionally requires Saira + Saira SemiCondensed (not bundled today) and a real icon set (Tabler/Remix)

## Canonical Figma Variables

The tokens in this section are defined in the file itself and are authoritative.

### Primitive

- Neutral ramp: 50 `#F6F6F6` · 100 `#E4E4E4` · 200 `#C6C6C6` · 300 `#A0A0A0` · 400 `#7A7A7A` · 500 `#5A5A5A` · 600 `#424242` · 700 `#2E2E2E` · 800 `#1F1F1F` · 850 `#1A1A1A` · 900 `#141414` · 925 `#0F0F0F` · 950 `#0A0A0A` · 990 `#050505`
- Orange/500 `#FF6A00` (700 `#BF4D00`, 950 `#421A02`)
- Red/500 `#F02744` (700 `#A4172C`, 800 `#851727`, 950 `#3A0A10`)
- Green/500 `#16B566` (700 `#0E7445`, 950 `#05281A`)
- Blue/500 `#1F7FE6` (700 `#114F99`, 950 `#091D38`) - not the `#4F9CFF` in `docs/DESIGN.md`
- Yellow/500 `#E0A30C` (700 `#8F6406`, 950 `#2E2002`) - not the `#F5C518` in `docs/DESIGN.md`
- Radius: xs 4 · sm 6 · md 8 · lg 10 · xl 14 · pill 999
- Space: 1=2 · 2=4 · 3=6 · 4=8 · 5=10 · 6=14 · 7=16 · 8=18 · 9=20 · 10=22 · 12=36

### Semantic

- Surface: App `#0A0A0A` · Panel `#0F0F0F` (second mode `#141414`) · Screen `#050505` · Tile `#141414` · Tile2 `#1A1A1A` · Tile3 `#1F1F1F`
- Text: Default `#F6F6F6` · Muted `#7A7A7A` · Subtle `#5A5A5A`
- Border: Default `#2E2E2E` · Strong `#424242`
- Primary `#FF6A00` · Primary/BG-Soft `#FF6A00` at 12% · Primary/Border `#BF4D00`
- Error `#F02744` / BG-Soft `#3A0A10` / Border `#851727`
- Success `#16B566` / BG-Soft `#05281A` / Border `#0E7445`
- Info `#1F7FE6` / BG-Soft `#091D38` / Border `#114F99`
- Warning `#E0A30C` / BG-Soft `#2E2002` / Border `#8F6406`

### Component

- Button: PaddingX 14 · PaddingY 6 · Gap 4 · Radius 8
- Button primary: bg Orange/500, text Neutral/900
- Button default/secondary: bg Neutral/900 `#141414`, border `#2E2E2E`, text `#F6F6F6`
- Button danger: bg `#0F0F0F` token or `#3A0A10` drawn component, border `#851727`, text `#F02744`
- Button disabled: bg `#0F0F0F`, border `#2E2E2E`, text `#5A5A5A`
- Input: Radius 8 · md PaddingX 10 · md PaddingY 8
- Badges/Indicators: Green/Neutral/Orange/Red each = BG(*950/900) + Border(*700) + Icon(*500/300)
