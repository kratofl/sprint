# Design System

Visual design system for the sprint sim racing telemetry platform.

**Stack:** Next.js · shadcn/ui · Tailwind CSS · Radix UI · Inter

---

## 1. Design Philosophy

### Principles

- **Data first.** Every visual decision serves legibility of telemetry data. Decoration is a liability.
- **Density without clutter.** Sim racers need many data points at a glance. Use spacing and hierarchy to separate signal from noise — not whitespace for its own sake.
- **Dark as default.** Racers use this app after sessions, often in low-light environments and alongside game software. Dark reduces eye strain and frames data visualizations better.
- **Layered depth.** Surfaces float above the background through blur and translucency, not just color. The background shows through glass panels, creating a sense of physical space.
- **Predictable, not surprising.** Interactions behave consistently. A button always looks like a button. A chart always reads the same direction.
- **Speed matters.** UI transitions must feel instant or intentional — never sluggish.

### Inspiration

Apple's visionOS and macOS Sonoma glass aesthetic — translucent frosted surfaces, generous border radius, soft layered shadows — combined with the information-dense minimal character of linear.app. Surfaces feel physical and layered; content stays front and center.

---

## 2. Color System

Implemented as CSS custom properties on `:root` (dark theme only), following the shadcn/ui variable convention.

### 2.1 Background

The page background is not flat black — a subtle radial gradient gives glass surfaces something to blur against, creating perceived depth.

```css
body {
  background-color: #080809;
  background-image: radial-gradient(
    ellipse 80% 60% at 50% -10%,
    rgba(239, 129, 24, 0.06) 0%,
    transparent 70%
  );
  min-height: 100vh;
}
```

| Token | Value | Usage |
|---|---|---|
| `--background` | `#080809` | Page background color |
| Gradient | Accent-tinted radial, 6% opacity | Depth behind glass surfaces |

### 2.2 Accent — Orange (Primary)

`#EF8118` is the primary action color. Use it sparingly so it always signals interactivity or important data.

| Token | Hex | Usage |
|---|---|---|
| `--accent` | `#EF8118` | Primary buttons, links, active nav items, focus rings |
| `--accent-hover` | `#F59132` | Hover state |
| `--accent-active` | `#D4700F` | Pressed / active state |
| `--accent-subtle` | `#EF811815` | Tinted backgrounds (selected row, badge fill) |
| `--accent-foreground` | `#0A0A0B` | Text on `--accent` backgrounds |

### 2.3 Secondary Accent — Teal

`#1EA58C` is the secondary action color. A cool teal counterpart to the warm orange — use it for secondary CTAs, comparison mode highlights, and alternate interactive states.

| Token | Hex | Usage |
|---|---|---|
| `--secondary` | `#1EA58C` | Secondary buttons, comparison highlights, alternate badges |
| `--secondary-hover` | `#22BC9F` | Hover state |
| `--secondary-active` | `#198A76` | Pressed / active state |
| `--secondary-subtle` | `#1EA58C15` | Tinted backgrounds (secondary selected states) |
| `--secondary-foreground` | `#F2F2F3` | Text on `--secondary` backgrounds |

> **Orange vs Teal:** Orange = primary action / user-owned data. Teal = secondary action / comparative or alternative context. Never use both at the same visual weight on the same element.

### 2.4 Neutral Palette

| Token | Value | Usage |
|---|---|---|
| `--foreground` | `#F2F2F3` | Primary text |
| `--muted-foreground` | `#8A8A95` | Secondary text, labels, timestamps |
| `--subtle-foreground` | `#52525C` | Disabled text, placeholders |
| `--border` | `rgba(255, 255, 255, 0.08)` | Glass surface borders, dividers |
| `--border-solid` | `#27272D` | Non-glass borders (table rows, inputs) |
| `--input` | `rgba(255, 255, 255, 0.06)` | Form field backgrounds |

### 2.5 Semantic Colors

| Token | Hex | Usage |
|---|---|---|
| `--success` | `#34D399` | Personal best, improvements, online status |
| `--warning` | `#FBBF24` | Caution states, yellow flag, near-limit values |
| `--destructive` | `#F87171` | Errors, deleted items, sector time losses |
| `--info` | `#60A5FA` | Informational badges, neutral highlights |

### 2.6 Data Visualization Palette

Used exclusively for chart series, lap comparisons, and driver color coding. These colors are chosen to be distinct from the `#EF8118` accent and from each other, and to remain distinguishable for common color vision deficiencies.

| Index | Hex | Name | Primary use |
|---|---|---|---|
| `--data-1` | `#60A5FA` | Sky blue | Lap 1 / Driver A / Reference |
| `--data-2` | `#A78BFA` | Violet | Lap 2 / Driver B |
| `--data-3` | `#34D399` | Emerald | Lap 3 / Driver C / Best |
| `--data-4` | `#FBBF24` | Amber | Lap 4 / Driver D |
| `--data-5` | `#F472B6` | Pink | Lap 5 / Driver E |
| `--data-6` | `#22D3EE` | Cyan | Lap 6 / Driver F |

> Never use `--accent` (`#EF8118`) as a data series color — it is reserved for UI interactivity.

### 2.7 Glass Surfaces

Three glass levels replace the previous solid surface scale. Each uses `backdrop-filter: blur()` over the gradient background, a translucent white fill, and a thin light border.

| Level | Fill | Blur | Border | Usage |
|---|---|---|---|---|
| **Base glass** | `rgba(255,255,255,0.04)` | `blur(12px)` | `rgba(255,255,255,0.08)` | Cards, main panels, sidebar |
| **Elevated glass** | `rgba(255,255,255,0.07)` | `blur(20px)` | `rgba(255,255,255,0.10)` | Dropdowns, popovers, tooltips |
| **Overlay glass** | `rgba(255,255,255,0.10)` | `blur(32px)` | `rgba(255,255,255,0.14)` | Modals, sheets, command palette |

```css
/* globals.css — glass utility classes */
.glass {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.glass-elevated {
  background: rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.10);
}

.glass-overlay {
  background: rgba(255, 255, 255, 0.10);
  backdrop-filter: blur(32px);
  -webkit-backdrop-filter: blur(32px);
  border: 1px solid rgba(255, 255, 255, 0.14);
}
```

> **Tables and data rows** use solid non-glass surfaces (`--border-solid`) to maintain text legibility when content updates rapidly.

### 2.8 CSS Variable Block

```css
:root {
  /* Background */
  --background: 0 0% 3%;          /* #080809 */

  /* Glass surface tokens (used via utility classes above) */
  --glass-base: rgba(255, 255, 255, 0.04);
  --glass-elevated: rgba(255, 255, 255, 0.07);
  --glass-overlay: rgba(255, 255, 255, 0.10);

  /* Primary accent — Orange */
  --primary: 28 88% 52%;          /* #EF8118 */
  --primary-foreground: 0 0% 3%;

  /* Secondary accent — Teal */
  --secondary: 168 68% 38%;       /* #1EA58C */
  --secondary-foreground: 240 5% 95%;

  /* Neutrals */
  --foreground: 240 5% 95%;       /* #F2F2F3 */
  --muted: 240 4% 16%;
  --muted-foreground: 240 4% 56%; /* #8A8A95 */
  --border: rgba(255, 255, 255, 0.08);
  --input: rgba(255, 255, 255, 0.06);
  --ring: 28 88% 52%;             /* Focus ring = primary accent */

  /* Semantic */
  --destructive: 0 91% 71%;       /* #F87171 */
  --destructive-foreground: 0 0% 3%;

  /* Radius */
  --radius: 0.75rem;              /* 12px default */
}
```

---

## 3. Shadow & Depth

Apple-style shadows are soft, layered, and never hard. They work with glass to reinforce the sense of physical elevation.

### 3.1 Shadow Scale

| Level | CSS | Usage |
|---|---|---|
| **Subtle** | `0 1px 2px rgba(0,0,0,0.4)` | Inline elements, badges |
| **Card** | `0 4px 16px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)` | Base glass cards, panels |
| **Elevated** | `0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.4)` | Dropdowns, popovers |
| **Modal** | `0 24px 64px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.5)` | Modals, sheets |

```css
.shadow-card     { box-shadow: 0 4px 16px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3); }
.shadow-elevated { box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.4); }
.shadow-modal    { box-shadow: 0 24px 64px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.5); }
```

### 3.2 Inset Glow (glass highlight)

A subtle inset top border simulates the light refraction on real frosted glass.

```css
.glass-highlight {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.10);
}
```

Apply `.glass-highlight` on cards and panels alongside `.glass` for the full glass effect:
```tsx
<div className="glass glass-highlight rounded-2xl shadow-card p-4">
```

### 3.3 Border Radius Scale

| Token | Value | Usage |
|---|---|---|
| `rounded-lg` | `0.75rem` (12px) | Default — buttons, badges, inputs, small cards |
| `rounded-xl` | `1rem` (16px) | Cards, panels, table wrappers |
| `rounded-2xl` | `1.25rem` (20px) | Modals, large panels, sidebar |
| `rounded-full` | `9999px` | Avatars, dot indicators, pill badges |

`--radius` is set to `0.75rem` in the CSS variable block. shadcn/ui uses `--radius` as its base — components will automatically use 12px corners.

---

## 4. Typography

### 4.1 Typeface

**Inter** — loaded via `next/font/google` with the variable font (`wght` 100–900).

```tsx
// app/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})
```

Apply as `className={inter.variable}` on `<html>` and reference as `font-sans` (configured in Tailwind config).

For raw data values (lap times, sector times, speed, g-force), use **Inter Mono** or Tailwind's `font-mono` class to ensure consistent numeric column alignment.

### 4.2 Type Scale

| Class | Size | Line height | Weight | Usage |
|---|---|---|---|---|
| `text-xs` | 12px | 16px | 400 | Fine print, axis labels, metadata |
| `text-sm` | 14px | 20px | 400 | Body text, table rows, descriptions |
| `text-base` | 16px | 24px | 400 | Default prose |
| `text-lg` | 18px | 28px | 500 | Section subheadings |
| `text-xl` | 20px | 28px | 600 | Card titles, panel headers |
| `text-2xl` | 24px | 32px | 600 | Page headings |
| `text-3xl` | 30px | 36px | 700 | Hero values (best lap display) |

### 4.3 Usage Rules

- **Primary text:** `text-foreground` (`--foreground`)
- **Secondary/label text:** `text-muted-foreground` — used for column headers, timestamps, helper text
- **Disabled/placeholder:** `text-subtle-foreground`
- **Telemetry numbers:** always `font-mono tabular-nums` to prevent layout shift as values update
- **Large stat values** (lap times, top speed): `text-3xl font-bold font-mono tabular-nums`
- **Avoid mixing weights within a sentence.** Use muted color to create hierarchy, not font-weight variation.

---

## 5. Spacing & Layout

### 5.1 Base Grid

Tailwind's default 4px base unit. Stick to the scale — do not use arbitrary values unless unavoidable.

| Tailwind | px | Use |
|---|---|---|
| `p-1` | 4px | Icon padding, tight badge insets |
| `p-2` | 8px | Small component insets |
| `p-3` | 12px | Compact table cell padding |
| `p-4` | 16px | Standard card padding |
| `p-6` | 24px | Panel/section padding |
| `p-8` | 32px | Page-level padding |
| `gap-2` | 8px | Tight item spacing (tags, icons) |
| `gap-4` | 16px | Standard component gap |
| `gap-6` | 24px | Section gap |

### 5.2 Page Layout

```
┌─────────────────────────────────────────────────────┐
│  Sidebar  │           Main Content                  │
│  240px    │  max-w-screen-xl  px-8  py-6           │
│  fixed    │                                         │
└─────────────────────────────────────────────────────┘
```

| Token | Value | Notes |
|---|---|---|
| Sidebar width | `240px` | Collapses to `64px` (icon-only) on compact mode |
| Content max-width | `1280px` (`max-w-screen-xl`) | Centered in remaining space |
| Content horizontal padding | `px-8` (32px) | |
| Content vertical padding | `py-6` (24px) | |
| Top nav height | `48px` | If a top bar is used instead of / alongside sidebar |

### 5.3 Common Container Patterns

```tsx
// Page wrapper
<main className="ml-60 px-8 py-6 max-w-screen-xl">

// Glass card
<div className="glass glass-highlight rounded-xl shadow-card p-4">

// Section with header
<section className="space-y-4">
  <h2 className="text-xl font-semibold">Section Title</h2>
  {/* content */}
</section>

// Stat row (label + value inline) — solid border for data legibility
<div className="flex items-center justify-between py-2 border-b border-[#27272D]">
  <span className="text-sm text-muted-foreground">Best Lap</span>
  <span className="font-mono tabular-nums text-sm">1:42.831</span>
</div>
```

---

### 6. Component Patterns

### 6.1 shadcn/ui Theme Config

All shadcn/ui components consume the CSS variables defined in §2.8. No direct color values in component code.

Install and configure:
```bash
npx shadcn@latest init
# Style: Default | Base color: Zinc | CSS variables: yes
```

Then override the generated `globals.css` with the color tokens from §2.8 and add the `.glass`, `.glass-elevated`, `.glass-overlay`, `.glass-highlight`, `.shadow-card`, `.shadow-elevated`, `.shadow-modal` utility classes from §2.7 and §3.

### 6.2 Button

| Variant | Use |
|---|---|
| `default` | Primary action — filled orange accent |
| `secondary` | Secondary action — filled teal accent |
| `outline` | Tertiary / glass-bordered |
| `ghost` | Nav items, icon buttons, inline actions |
| `destructive` | Delete / irreversible actions |

```tsx
// Primary CTA
<Button>Start Session</Button>

// Secondary CTA
<Button variant="secondary">Compare Laps</Button>

// Icon button
<Button variant="ghost" size="icon">
  <Settings className="h-4 w-4" />
</Button>
```

Minimum tap target: `h-9` (36px) for all interactive elements.

### 6.3 Badge

Used for lap type, sector delta, session status.

```tsx
// Lap type
<Badge variant="outline">Out Lap</Badge>

// Personal best — primary accent
<Badge className="bg-[#EF8118]/15 text-[#EF8118] border-[#EF8118]/20">PB</Badge>

// Comparison active — secondary accent
<Badge className="bg-[#1EA58C]/15 text-[#1EA58C] border-[#1EA58C]/20">Comparing</Badge>

// Time loss — destructive
<Badge className="bg-destructive/15 text-destructive border-destructive/20">-0.342</Badge>
```

### 6.4 Card

Cards use base glass — translucent frosted surface with inset highlight and soft shadow.

```tsx
<div className="glass glass-highlight rounded-xl shadow-card p-4">
  <CardHeader>
    <CardTitle>Last Session</CardTitle>
    <CardDescription>Spa-Francorchamps · 24 laps</CardDescription>
  </CardHeader>
  <CardContent>
    {/* content */}
  </CardContent>
</div>
```

For nested content within a card that needs further separation, use `glass-elevated` with `rounded-lg`.

### 6.5 Table

Tables stay on solid surfaces — glass + rapidly-updating numbers = illegible. Always use `font-mono tabular-nums` for numeric columns.

```tsx
<div className="rounded-xl border border-[#27272D] overflow-hidden">
  <Table>
    <TableHeader className="bg-white/[0.03]">
      <TableRow className="border-[#27272D]">
        <TableHead className="w-12">Lap</TableHead>
        <TableHead>Time</TableHead>
        <TableHead>S1</TableHead>
        <TableHead>S2</TableHead>
        <TableHead>S3</TableHead>
        <TableHead>Delta</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow className="font-mono tabular-nums text-sm border-[#27272D] hover:bg-white/[0.03]">
        <TableCell className="text-muted-foreground">12</TableCell>
        <TableCell className="font-medium">1:42.831</TableCell>
        {/* ... */}
      </TableRow>
    </TableBody>
  </Table>
</div>
```

### 6.6 Telemetry-Specific Patterns

#### Stat Card — single key metric

```tsx
<div className="glass glass-highlight rounded-xl shadow-card p-4 space-y-1">
  <p className="text-xs text-muted-foreground uppercase tracking-wide">Best Lap</p>
  <p className="text-3xl font-bold font-mono tabular-nums">1:42.831</p>
  <p className="text-sm text-[#1EA58C]">↓ 0.241s from last session</p>
</div>
```

#### Session List Item

```tsx
<div className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer">
  <div className="w-2 h-2 rounded-full bg-[#1EA58C]" /> {/* online indicator */}
  <div className="flex-1 min-w-0">
    <p className="text-sm font-medium truncate">Spa-Francorchamps</p>
    <p className="text-xs text-muted-foreground">LeMans Ultimate · 24 laps</p>
  </div>
  <span className="font-mono tabular-nums text-sm text-muted-foreground">1:42.831</span>
</div>
```

#### Comparison Panel — side-by-side driver/lap data

```tsx
<div className="glass glass-highlight rounded-xl shadow-card overflow-hidden">
  <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
    <div className="p-4">
      <p className="text-xs text-[#EF8118] font-medium mb-3 uppercase tracking-wide">LAP 1</p>
      {/* stats */}
    </div>
    <div className="p-4">
      <p className="text-xs text-[#1EA58C] font-medium mb-3 uppercase tracking-wide">LAP 2</p>
      {/* stats */}
    </div>
  </div>
</div>
```

> The comparison panel uses orange (primary) for the user's reference lap and teal (secondary) for the compared lap — reinforcing the two-accent semantic distinction.

---

## 7. Data Visualization

### 6.1 Chart Library

Use **Recharts** (included in shadcn/ui charts via `shadcn add chart`). Consume the `--data-N` CSS variables for all series colors.

```tsx
const CHART_COLORS = [
  'var(--data-1)', // Sky blue  — Lap 1 / Driver A
  'var(--data-2)', // Violet    — Lap 2 / Driver B
  'var(--data-3)', // Emerald   — Lap 3 / Driver C
  'var(--data-4)', // Amber     — Lap 4 / Driver D
  'var(--data-5)', // Pink      — Lap 5 / Driver E
  'var(--data-6)', // Cyan      — Lap 6 / Driver F
]
```

### 6.2 Chart Styling Defaults

```tsx
// Common props for all Recharts charts
const chartDefaults = {
  style: { background: 'transparent' },
  margin: { top: 8, right: 8, bottom: 8, left: 8 },
}

// CartesianGrid
<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />

// Axes
<XAxis stroke="var(--border)" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
<YAxis stroke="var(--border)" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />

// Tooltip — glass style
<Tooltip
  contentStyle={{
    background: 'rgba(255, 255, 255, 0.07)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.10)',
    borderRadius: '12px',
    fontSize: 12,
  }}
/>
```

### 6.3 Chart Type Guidelines

| Data | Chart type | Notes |
|---|---|---|
| Delta time (lap vs lap) | Line chart | Zero line at `y=0`; positive = slower, negative = faster |
| Sector times | Grouped bar chart | One bar per sector per lap/driver |
| Speed trace | Line chart | Multiple series (one per lap); highlight braking zones |
| Tire wear | Radial progress or gauge | 4 corners; color shifts from `--success` → `--warning` → `--destructive` |
| Fuel load | Linear progress bar | `--accent` fill, depletes left to right |
| Lap time trend | Line chart | Dots at each lap; connect outliers with dashed line |
| Mini sector breakdown | Horizontal stacked bar | S1, S2, S3 segments in different data colors |

### 6.4 Accessibility Rules

- Never use color alone to convey meaning — add labels, patterns, or shapes.
- All charts must have a legend when showing multiple series.
- Tooltip must always identify the series by name, not just color.
- The six `--data-N` colors have been chosen for contrast against `--background` (verified ≥ 3:1 contrast ratio).

---

## 8. Icons

**Library:** [Lucide React](https://lucide.dev) — bundled with shadcn/ui.

### 7.1 Size Conventions

| Context | Size class | px |
|---|---|---|
| Inline with text | `h-3 w-3` | 12px |
| Inline action / button | `h-4 w-4` | 16px |
| Standard button icon | `h-5 w-5` | 20px |
| Navigation items | `h-5 w-5` | 20px |
| Empty state / illustration | `h-8 w-8` or `h-12 w-12` | 32–48px |

### 7.2 Usage Rules

- Always pair icons with text labels in primary navigation (not icon-only unless space is critically constrained).
- In icon-only contexts, always add `aria-label` or wrap in a `<Tooltip>`.
- Match icon stroke width to the text weight in context (Lucide default `strokeWidth={2}` is appropriate for most cases; use `strokeWidth={1.5}` for large/display sizes).

```tsx
import { Timer, Gauge, Flag, TrendingDown } from 'lucide-react'

// Nav item
<a className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-overlay text-sm">
  <Timer className="h-5 w-5" />
  Sessions
</a>

// Inline with stat
<div className="flex items-center gap-1.5 text-success text-sm">
  <TrendingDown className="h-4 w-4" />
  -0.241s
</div>
```

---

## 9. Motion & Animation

### 8.1 Principle

Motion is purposeful. It communicates state changes, not aesthetics. When in doubt, don't animate.

### 8.2 Duration Tokens

| Name | Duration | Use |
|---|---|---|
| Instant | `0ms` | Data value updates, live telemetry numbers |
| Fast | `100ms` | Tooltips appearing, badge transitions |
| Normal | `200ms` | Modals, drawers, dropdowns, sidebar collapse |
| Slow | `300ms` | Page transitions (if used) |

```css
/* Tailwind config additions */
transitionDuration: {
  'fast': '100ms',
  'normal': '200ms',
}
transitionTimingFunction: {
  'ui': 'cubic-bezier(0.4, 0, 0.2, 1)',
}
```

### 8.3 What Animates

| Element | Animation |
|---|---|
| Modal / Sheet | Fade + slide in from bottom (`normal`, `ease-out`) |
| Dropdown / Popover | Fade + scale from `0.95` → `1` (`fast`) |
| Sidebar collapse | Width transition (`normal`) |
| Toast / notification | Slide in from edge (`fast`) |
| Button press | Scale to `0.97` on active (`instant`) |

### 8.4 What Does NOT Animate

- Live telemetry value updates (numbers must update instantly — no counter animations)
- Chart data redraws on new session data
- Table row content changes
- Any element that updates more than once per second

---

## 10. Desktop App (Wails)

The Wails desktop frontend shares the same design system as the web app — same tokens, same components from `/packages`, same glassmorphism patterns. A few platform-specific considerations apply.

### 10.1 Window & Chrome

- The Wails window uses a **frameless** or **transparent title bar** to let the glass aesthetic extend to the window edge.
- Minimum window size: `1024 × 680px`. Designed primarily for desktop monitors and secondary displays.
- A custom drag region sits at the top of the sidebar for window movement.

### 10.2 Compact Mode

When the window is narrower than `1280px` (e.g. on a secondary monitor), the layout switches to compact mode:
- Sidebar collapses to icon-only (`64px`)
- Stat cards reduce padding to `p-3`
- Chart height reduced to `h-40` minimum

### 10.3 Desktop-Only Surfaces

These UI sections only exist in the desktop app and are not part of the shared `/packages`:

| Surface | Purpose |
|---|---|
| VoCore config panel | Set VoCore IP, port, frame rate, image dimensions |
| Wheel button mapping | Assign game buttons to actions (set target lap, etc.) |
| LAN engineer invite | Display local IP + port, show QR code for engineer to scan |
| Game selector | Choose active game adapter |

### 10.4 Race Engineer Session UI

#### Engineer Status Bar

A persistent status bar at the bottom of the desktop app when an engineer session is active.

```tsx
<div className="fixed bottom-0 left-0 right-0 h-9 glass border-t border-white/[0.06]
                flex items-center px-4 gap-3 text-sm z-50">
  <div className="w-2 h-2 rounded-full bg-[#1EA58C] animate-pulse" />
  <span className="text-muted-foreground">Race Engineer:</span>
  <span className="font-medium">Marco</span>
  <span className="text-muted-foreground ml-auto">Connected · 42ms</span>
</div>
```

#### Target Lap Indicator (on VoCore + local GUI)

Shows the currently active reference lap for delta calculation. Updated by engineer command or wheel button press.

```tsx
<div className="glass glass-highlight rounded-xl shadow-card p-4 flex items-center gap-4">
  <div>
    <p className="text-xs text-muted-foreground uppercase tracking-wide">Target Lap</p>
    <p className="text-2xl font-bold font-mono tabular-nums">1:42.831</p>
    <p className="text-xs text-muted-foreground">Lap 12 · Set by wheel button</p>
  </div>
  <Button variant="ghost" size="icon" className="ml-auto">
    <RefreshCw className="h-4 w-4" />
  </Button>
</div>
```

#### Engineer Command Toast

When an engineer pushes a command, the driver sees a non-blocking toast notification.

```tsx
// Applied command
<Toast className="glass glass-highlight border-[#1EA58C]/30">
  <div className="flex items-center gap-3">
    <div className="w-2 h-2 rounded-full bg-[#1EA58C]" />
    <div>
      <p className="text-sm font-medium">Target lap updated</p>
      <p className="text-xs text-muted-foreground">Marco set target to Lap 8 · 1:43.204</p>
    </div>
  </div>
</Toast>
```

Use the **teal secondary accent** (`#1EA58C`) consistently for all engineer-originated actions — it visually distinguishes "engineer did this" from "driver did this" (orange accent).

---



| Decision | Value |
|---|---|
| Background | `#080809` + accent-tinted radial gradient |
| Glass surface (base) | `rgba(255,255,255,0.04)` + `blur(12px)` |
| Primary accent | `#EF8118` (Burnt Sienna Orange) |
| Secondary accent | `#1EA58C` (Deep Teal) |
| Font | Inter (variable) |
| Mono font | Inter Mono / `font-mono` |
| Border radius | `0.75rem` default / `1rem` cards / `1.25rem` modals |
| Base spacing unit | 4px |
| Sidebar width | 240px |
| Max content width | 1280px |
| Icon library | Lucide React |
| Chart library | Recharts (via shadcn/ui chart) |
| Component library | shadcn/ui + Radix UI |
