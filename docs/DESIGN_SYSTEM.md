# Design System

Visual design system for the Sprint sim racing telemetry platform.

**Stack:** Next.js · shadcn/ui · Tailwind CSS · Radix UI · Space Grotesk + JetBrains Mono

---

## 1. Design Philosophy

### Creative North Star: "The Kinetic Monolith"

The UI should feel like a telemetry dashboard mounted on a carbon-fibre chassis — engineered for speed, precision, and aggressive technical dominance. We move away from the soft aesthetics of modern SaaS and embrace the uncompromising rigidity of elite motorsport engineering.

**Aggressive Asymmetry** — break the standard centred grid in favour of forward-leaning compositions, italicised momentum, and overlapping technical layers. Every element should look as if it were wind-tunnel tested.

### Principles

- **Data first.** Every visual decision serves legibility of telemetry data. Decoration is a liability.
- **Density without clutter.** Sim racers need many data points at a glance. Use spacing and visual hierarchy to separate signal from noise — not whitespace for its own sake.
- **Dark as default.** Racers use this app after sessions, in low-light environments alongside game software. Dark reduces eye strain and frames data visualisations better.
- **Tonal depth, not borders.** Depth is expressed by stacking surfaces of different tonal values — no 1px solid outlines for sectioning. Borders are reserved for functional separation only.
- **Purposeful motion.** Transitions communicate state changes, not aesthetics. When in doubt, don't animate.
- **Speed matters.** UI transitions must feel instant or intentional — never sluggish.

### Inspiration

Elite motorsport HUDs, carbon-fibre instrument panels, and high-contrast race data systems. Typography is forward-leaning (italic) and authoritative (all caps for headings). The palette is built on the tension between heat (orange) and technical precision (teal).

---

## 2. Color System

Implemented as CSS custom properties on `:root` (dark theme only).

### 2.1 Surface Hierarchy

Surfaces stack from dark base to lighter containers. A structural `outline` border (`#2a2a2a`) is used for all section edges — header bars, sidebar, card borders, table rows, chart containers.

| Role | Token | Hex | Usage |
|---|---|---|---|
| Base | `--bg-base` | `#0a0a0a` | Page background |
| Container | `--bg-container` | `#141414` | Cards, panels, sidebar |
| Elevated | `--bg-elevated` | `#1f1f1f` | Active widgets, emphasized cards |
| Overlay | `--bg-overlay` | `#262626` | Top-level emphasis |
| Outline | `--outline` | `#2a2a2a` | All structural borders and dividers |

### 2.2 Primary Accent — Orange

`#ff906c` is the primary action color — a warm coral that represents the friction of the track.

| Token | Hex | Usage |
|---|---|---|
| `--accent` | `#ff906c` | Primary buttons, links, active nav, focus rings |
| `--accent-dark` | `#ff784d` | Gradient end, pressed state |
| `--accent-muted` | `rgba(255,144,108,0.08)` | Tinted backgrounds (active nav item bg) |

**CTA Gradient:** Primary buttons use a 135° gradient from `#ff906c` to `#ff784d`.

```css
background: linear-gradient(135deg, #ff906c 0%, #ff784d 100%);
```

### 2.3 Secondary Accent — Cyan

`#5af8fb` is the secondary color — electric cyan representing system status, technical data, and comparison highlights.

| Token | Hex | Usage |
|---|---|---|
| `--secondary` | `#5af8fb` | System status, secondary buttons, comparison data, chart series 2 |
| `--secondary-dark` | `#2ae4e8` | Gradient end |
| `--secondary-muted` | `rgba(90,248,251,0.08)` | Tinted backgrounds |

> **Orange vs Cyan:** Orange = primary action / driver-owned data. Cyan = system status / engineer-originated / comparison. Never use both at the same visual weight on the same element.

### 2.4 Tertiary — Alert Purple

`#f1afff` is a technical alert accent reserved for telemetry chip badges (e.g. "LIVE", "PIT", "GEAR").

| Token | Hex | Usage |
|---|---|---|
| `--tertiary` | `#f1afff` | Telemetry status chips, alert badges |

### 2.5 Neutrals

| Token | Hex | Usage |
|---|---|---|
| `--on-surface` | `#ffffff` | Primary text |
| `--on-surface-variant` | `#808080` | Labels, timestamps, secondary metadata, inactive nav |
| `--text-disabled` | `#525252` | Placeholders, inactive elements |

### 2.6 Semantic Colors

| Token | Hex | Usage |
|---|---|---|
| `--success` | `#34D399` | Personal best, improvements, online status |
| `--warning` | `#FBBF24` | Caution states, yellow flag, near-limit values |
| `--destructive` | `#F87171` | Errors, deleted items, sector time losses |
| `--info` | `#60A5FA` | Informational badges, neutral highlights |

### 2.7 Border / Outline Rules

The `outline` token (`#2a2a2a`) is the structural separator for all section edges:
- Header bar bottom border
- Sidebar right border
- Card and panel edges
- Table row dividers
- Chart container borders

`border border-outline` (= `border border-border-base`) is the standard pattern.

For accent call-outs, use colored transparent borders on top:

| Use case | Value | Token |
|---|---|---|
| All structural borders | `#2a2a2a` | `border-border-base` / `border-outline` |
| Accent call-out card | `rgba(255,144,108,0.30)` | `border-accent-border` |
| Cyan call-out card | `rgba(90,248,251,0.30)` | `border-teal-border` |
| Subtle divider | `rgba(255,255,255,0.08)` | `border-border-subtle` |

### 2.8 Tech Grid

The main content workspace uses a subtle grid texture to convey a technical HUD feel.

```css
.tech-grid {
  background-image:
    linear-gradient(to right,  #1a1a1a 1px, transparent 1px),
    linear-gradient(to bottom, #1a1a1a 1px, transparent 1px);
  background-size: 20px 20px;
}
```

Apply `.tech-grid` to the main workspace container, not to cards or sidebars.

### 2.9 Glassmorphism — Floating Surfaces Only

Glass blur effects are reserved for **floating overlays**: modals, sheets, command palette.

```css
.glass-overlay {
  background: rgba(26, 26, 26, 0.80);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid #2a2a2a;
}
```

### 2.10 CSS Variable Block

```css
:root {
  /* Surfaces */
  --bg-base:       #0a0a0a;
  --bg-container:  #141414;
  --bg-elevated:   #1f1f1f;
  --bg-overlay:    #262626;

  /* Structural border */
  --outline:       #2a2a2a;

  /* Primary — orange */
  --accent:        #ff906c;
  --accent-dark:   #ff784d;

  /* Secondary — cyan */
  --secondary:     #5af8fb;
  --secondary-dark:#2ae4e8;

  /* Text */
  --on-surface:          #ffffff;
  --on-surface-variant:  #808080;
}
```

---

## 3. Elevation & Depth

Depth is purely architectural — achieved through the **Tonal Scale**, not drop shadows.

### 3.1 Layering Principle

To lift a card or widget, change its background token, not its shadow or border:

| Level | Token | Hex |
|---|---|---|
| Page base | `bg-bg-base` | `#0e0e0e` |
| Cards / panels | `bg-bg-surface` | `#1a1919` |
| Active widgets | `bg-bg-elevated` | `#1f1f1f` |
| Top-level emphasis | `bg-bg-overlay` | `#262626` |

### 3.2 Ambient Shadows (floating elements only)

If a floating element (Tooltip, Popover) requires separation from a busy background, use a **tinted ambient shadow** at low opacity — never a hard grey shadow:

| Element | Shadow |
|---|---|
| Dropdown / Popover | `0 2px 8px rgba(0,0,0,0.22)` |
| Modal / Sheet | `0 8px 24px rgba(0,0,0,0.32)` |
| Primary CTA glow | `0 0 14px rgba(255,144,108,0.22)` |
| Teal CTA glow | `0 0 14px rgba(30,165,140,0.22)` |

### 3.3 Border Radius

Everything is sharp. Roundness kills the aerodynamic intent.

| Token | Value | Usage |
|---|---|---|
| `rounded-sm` | `0px` | — |
| `rounded` | `2px` | Default — minimal softening |
| `rounded-md` | `2px` | Same |
| `rounded-lg` | `3px` | Larger components |
| `rounded-full` | `9999px` | Avatars, dot indicators only |

---

## 4. Typography

### 4.1 Typeface

**Space Grotesk** — primary UI font. Bold, italic, all-caps for headings to convey forward-leaning movement at 200 mph. Loaded via Google Fonts.

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
```

**JetBrains Mono** — all numeric and monospaced content: lap times, speed readouts, sector data. Ensures consistent column alignment and a precise, technical feel.

### 4.2 Usage Rules

- **Display / headings:** `font-display font-bold italic uppercase` — the italicised slant acts as a visual cue for movement
- **Body / labels:** `font-sans` — Space Grotesk at normal weight, no italic
- **Numbers / data readouts:** `font-mono tabular-nums` — JetBrains Mono, always tabular

> **Do not mix fonts.** The system's strength lies in its consistency. Space Grotesk everywhere except raw data values.

### 4.3 Type Scale

| Role | Class | Size | Weight | Style |
|---|---|---|---|---|
| Hero stat (lap time, top speed) | `text-3xl font-bold font-mono tabular-nums` | 1.875rem | 700 | — |
| Section heading | `text-sm font-bold italic uppercase tracking-wide` | 0.875rem | 700 | italic + CAPS |
| Card title | `text-sm font-medium` | 0.875rem | 500 | — |
| Body / label | `text-xs/relaxed` | 0.75rem | 400 | — |
| Caption / timestamp | `text-[0.625rem] text-text-muted` | 10px | 400 | — |

### 4.4 All-Caps Headings

Section labels and card headers use All Caps with wide letter spacing to maximise the "heads-up display" (HUD) feel:

```tsx
<h2 className="text-[0.625rem] font-bold italic uppercase tracking-widest text-text-muted">
  SECTOR TIMES
</h2>
```

---

## 5. Components

### 5.1 Buttons: High-Velocity CTAs

- **Primary:** All Caps · Bold · Italic · 0px radius · Gradient fill (`#ff906c → #ff784d` at 135°)
- **Secondary:** Ghost style — `outline-variant` at 20% opacity, teal text
- **Interaction:** On hover, a warm `primary` glow appears; gradient angle shifts slightly

```tsx
// Primary CTA
<Button variant="default">LOAD SESSION</Button>

// Secondary CTA
<Button variant="secondary">Compare Lap</Button>
```

### 5.2 Cards: Tonal Depth, No Dividers

Cards use background tonal contrast against the page base for depth — no border. The `accent` and `teal` border variants are explicit opt-in call-outs for highlighted items.

```tsx
// Standard card — no border, tonal contrast only
<Card>…</Card>

// Highlighted (active session)
<Card variant="accent">…</Card>
```

List items within cards are separated by **vertical spacing** (`gap-3`/`gap-4`) or **alternating row tones** — never by `<Separator>` or horizontal rules.

### 5.3 Input Fields: Technical Entry

- **Shape:** 0px radius
- **Resting state:** ghost border bottom only (`rgba(255,255,255,0.15)`)
- **Focused state:** 2px bottom bar in `primary` accent (`#ff906c`)
- **Labels:** All Caps, `font-medium tracking-wide`, positioned inside the top-left for a HUD feel
- **No full-box border** on inputs

```tsx
<label className="text-[0.625rem] uppercase tracking-widest text-text-muted">LAP TARGET</label>
<Input placeholder="1:42.000" />
```

### 5.4 Badges

| Variant | Style | Usage |
|---|---|---|
| `default` | Orange fill | Driver-owned status |
| `secondary` | Teal fill | Engineer-originated status |
| `tertiary` | `#f1afff` fill | Telemetry alerts (Live, Pit, Gear) |
| `outline` | Ghost border | Neutral labels |
| `destructive` | Red tint | Errors, violations |

### 5.5 Modals & Sheets

Floating surfaces use glassmorphism — not solid fills. Apply `.glass-overlay` with a `blur(24px)` backdrop:

```tsx
<div className="glass-overlay rounded p-6">…</div>
```

The dark overlay behind modals uses `bg-black/80` with `backdrop-blur-xs` for the scrim.

---

## 6. Data Visualization

### 6.1 Data Visualization Palette

Used exclusively for chart series, lap comparisons, and driver color coding. Chosen for distinctness from `#ff906c` and common color vision deficiency compatibility.

| Index | Hex | Name | Primary use |
|---|---|---|---|
| `data-1` | `#60A5FA` | Sky blue | Lap 1 / Driver A / Reference |
| `data-2` | `#A78BFA` | Violet | Lap 2 / Driver B |
| `data-3` | `#34D399` | Emerald | Lap 3 / Driver C / Best |
| `data-4` | `#FBBF24` | Amber | Lap 4 / Driver D |
| `data-5` | `#F472B6` | Pink | Lap 5 / Driver E |
| `data-6` | `#22D3EE` | Cyan | Lap 6 / Driver F |

> Never use `--accent` (`#ff906c`) as a data series color — it is reserved for UI interactivity.

### 6.2 Chart Type Guidelines

| Data | Chart type | Notes |
|---|---|---|
| Delta time (lap vs lap) | Line chart | Zero line at `y=0`; positive = slower, negative = faster |
| Sector times | Grouped bar chart | One bar per sector per lap/driver |
| Speed trace | Line chart | Multiple series; highlight braking zones |
| Tire wear | Radial progress / gauge | 4 corners; shifts `--success` → `--warning` → `--destructive` |
| Fuel load | Linear progress bar | `--accent` fill, depletes left to right |
| Lap time trend | Line chart | Dots at each lap; connect outliers with dashed line |

### 6.3 Accessibility Rules

- Never use color alone to convey meaning — add labels, patterns, or shapes.
- All charts must have a legend when showing multiple series.
- Tooltips must always identify the series by name, not just color.
- The six `data-N` colors are verified ≥3:1 contrast ratio against `--bg-base`.

---

## 7. Icons

**Library:** [Lucide React](https://lucide.dev)

### 7.1 Size Conventions

| Context | Class | px |
|---|---|---|
| Inline with text | `size-3` | 12px |
| Inline action / button | `size-3.5` | 14px |
| Standard button icon | `size-4` | 16px |
| Navigation items | `size-4` | 16px |
| Empty state / illustration | `size-8` or `size-12` | 32–48px |

### 7.2 Usage Rules

- Always pair icons with text labels in primary navigation.
- In icon-only contexts, always add `aria-label` or wrap in a `<Tooltip>`.
- Use `strokeWidth={1.5}` for large/display sizes; default `strokeWidth={2}` elsewhere.

---

## 8. Motion & Animation

### 8.1 Principle

Motion is purposeful. It communicates state changes, not aesthetics. When in doubt, don't animate.

### 8.2 Duration Tokens

| Name | Duration | Use |
|---|---|---|
| Instant | `0ms` | Data value updates, live telemetry numbers |
| Fast | `100ms` | Tooltips, badge transitions |
| Normal | `150ms` | Modals, drawers, dropdowns, nav collapse |
| Slow | `200ms` | Page transitions (if used) |

### 8.3 What Animates

| Element | Animation |
|---|---|
| Modal / Sheet | Fade + slide in from bottom (`normal`, `ease-out`) |
| Dropdown / Popover | Fade + scale `0.95 → 1` (`fast`) |
| Nav collapse | Width transition (`normal`) |
| Toast / notification | Slide in from edge (`fast`) |
| Button press | Scale to `0.97` on active (`instant`) |

### 8.4 What Does NOT Animate

- Live telemetry value updates (numbers must update instantly)
- Chart data redraws
- Table row content changes
- Any element that updates more than once per second

---

## 9. Desktop App (Wails)

The Wails desktop frontend shares the same design system as the web app — same tokens, same components from `/packages`. A few platform-specific considerations apply.

### 9.1 Window & Chrome

- Frameless or transparent title bar — the dark surface extends to the window edge.
- Minimum window size: `1024 × 680px`.
- Custom drag region at the top of the sidebar.

### 9.2 Compact Mode

When the window is narrower than `1280px`:
- Sidebar collapses to icon-only (`52px`)
- Stat cards reduce padding to `p-3`
- Chart height reduced to `h-40` minimum

### 9.3 Race Engineer Session UI

#### Engineer Status Bar

```tsx
<div className="fixed bottom-0 left-0 right-0 h-9 glass border-t border-white/10
                flex items-center px-4 gap-3 text-xs z-50">
  <div className="size-2 rounded-full bg-teal animate-pulse" />
  <span className="text-text-muted uppercase tracking-widest text-[0.625rem]">Race Engineer</span>
  <span className="font-medium">Marco</span>
  <span className="text-text-muted ml-auto">Connected · 42ms</span>
</div>
```

#### Target Lap Indicator

```tsx
<div className="surface rounded p-4 flex items-center gap-4">
  <div>
    <p className="text-[0.625rem] uppercase tracking-widest text-text-muted">TARGET LAP</p>
    <p className="text-2xl font-bold font-mono tabular-nums">1:42.831</p>
    <p className="text-[0.625rem] text-text-muted">Lap 12 · Set by wheel button</p>
  </div>
  <Button variant="ghost" size="icon" className="ml-auto">
    <RefreshCw />
  </Button>
</div>
```

Use **teal** (`--teal`) consistently for all engineer-originated actions — it visually distinguishes "engineer did this" from "driver did this" (orange accent).

---

## Quick Reference

| Decision | Value |
|---|---|
| Background | `#0a0a0a` |
| Container surface | `#141414` |
| Structural border | `#2a2a2a` (`border-border-base`) |
| Primary accent | `#ff906c` → `#ff784d` (Coral Orange gradient) |
| Secondary accent | `#5af8fb` → `#2ae4e8` (Electric Cyan) |
| Tertiary accent | `#f1afff` (Alert Purple) |
| Primary font | Space Grotesk (variable, 300–700) |
| Mono / data font | JetBrains Mono |
| Heading style | Bold · Italic · All Caps · wide tracking |
| Label format | UPPER_CASE with underscores (terminal HUD style) |
| Border radius | `0px` everywhere |
| Tech grid | `.tech-grid` on main workspace area |
| Base spacing unit | 4px |
| Sidebar width | 52px (collapsed) / 200px (expanded) |
| Max content width | 1280px |
| Icon library | Lucide React |
| Chart library | Recharts (via shadcn/ui chart) |
| Component library | shadcn/ui + Radix UI |
