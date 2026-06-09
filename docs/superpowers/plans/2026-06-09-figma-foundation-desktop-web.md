# Figma Foundation Desktop Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Sprint to the local `docs/Sprint.fig` design in strict sequence: foundation, Wails desktop, then web.

**Architecture:** Build a shared Figma-faithful foundation first, then consume it from the desktop app, then migrate the web app. Preserve runtime behavior and use the 1570x883 Figma application frame as the desktop base coordinate system.

**Tech Stack:** TypeScript, React 19, Tailwind CSS 4, pnpm workspaces, Wails/Vite desktop app, Next.js web app, shared `@sprint/tokens` and `@sprint/ui`.

---

## File Structure

- Create: `scripts/generate-brand-assets.mjs` for deterministic icon PNG/ICO generation from SVG if existing tooling cannot produce app assets directly.
- Create: `packages/ui/src/assets/brand/` for shared SVG brand assets.
- Create: `app/frontend/src/assets/brand/` for desktop runtime brand assets and wallpaper.
- Modify: `package.json` or `app/frontend/package.json` only if asset generation needs project-local `sharp` and `png-to-ico` dependencies.
- Modify: `packages/tokens/globals.css`, `packages/tokens/tailwind.config.ts`, and `packages/tokens/src/**` for exact Figma tokens.
- Modify: `packages/tokens/src/tokenHierarchy.test.ts` and `packages/tokens/src/molecules/surfaces.test.ts` to lock token values.
- Modify: `packages/ui/src/components/primitives/**` for buttons, badges, cards, fields, tabs, alerts, progress, table, and panel helpers.
- Modify: `packages/ui/src/components/organisms/**` for nav, page/header/topbar/status patterns.
- Modify: `packages/ui/src/components/telemetry/**` for Saira numeric typography and Figma semantic colors.
- Modify: `app/frontend/src/App.tsx`, `app/frontend/src/index.css`, `app/frontend/src/lib/appShell.ts`, `app/frontend/src/lib/windowControls.ts`, and related tests for the Figma desktop shell.
- Modify: `app/frontend/src/views/**` and `app/frontend/src/components/**` for desktop screen migration.
- Modify: `web/app/**` and `web/components/**` only after foundation and desktop verification pass.

## Phase Gate Rules

- Finish and verify foundation before editing desktop screens.
- Finish and verify desktop before editing web screens.
- Do not revert unrelated dirty worktree changes.
- Use `docs/DESIGN.md` for exact readable measurements and values; cite `docs/Sprint.fig` as canonical.
- Do not use Figma MCP.

## Task 1: Brand Assets And Local Figma Extraction

**Files:**
- Create: `packages/ui/src/assets/brand/sprint-icon.svg`
- Create: `packages/ui/src/assets/brand/sprint-square.svg`
- Create: `packages/ui/src/assets/brand/sprint-pattern.svg`
- Create: `packages/ui/src/assets/brand/sprint-wordmark.svg`
- Create: `app/frontend/src/assets/brand/sprint-icon.svg`
- Create: `app/frontend/src/assets/brand/sprint-square.svg`
- Create: `app/frontend/src/assets/brand/sprint-pattern.svg`
- Create: `app/frontend/src/assets/brand/sprint-wordmark.svg`
- Create: `app/frontend/src/assets/brand/sprint-wallpaper.png`
- Modify: `app/build/appicon.png`
- Modify: `app/build/windows/icon.ico`
- Optional create: `scripts/generate-brand-assets.mjs`

- [ ] **Step 1: Copy exported SVG assets into shared and desktop locations.**

Run:

```powershell
New-Item -ItemType Directory -Force packages\ui\src\assets\brand, app\frontend\src\assets\brand
Copy-Item docs\sprint-ico.svg packages\ui\src\assets\brand\sprint-icon.svg
Copy-Item docs\sprint-square.svg packages\ui\src\assets\brand\sprint-square.svg
Copy-Item docs\sprint-pattern.svg packages\ui\src\assets\brand\sprint-pattern.svg
Copy-Item docs\sprint-wordmark.svg packages\ui\src\assets\brand\sprint-wordmark.svg
Copy-Item docs\sprint-ico.svg app\frontend\src\assets\brand\sprint-icon.svg
Copy-Item docs\sprint-square.svg app\frontend\src\assets\brand\sprint-square.svg
Copy-Item docs\sprint-pattern.svg app\frontend\src\assets\brand\sprint-pattern.svg
Copy-Item docs\sprint-wordmark.svg app\frontend\src\assets\brand\sprint-wordmark.svg
```

Expected: all eight SVG files exist and match their source exports.

- [ ] **Step 2: Extract the full wallpaper PNG from `docs/Sprint.fig`.**

Run:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path docs\Sprint.fig))
$entry = $zip.GetEntry('images/4bdb329e0980af2e649010dd0f4b86689b0ad655')
[IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Resolve-Path app\frontend\src\assets\brand).Path + '\sprint-wallpaper.png', $true)
$zip.Dispose()
```

Expected: `app/frontend/src/assets/brand/sprint-wallpaper.png` is a full-size blurred race-car desktop backdrop.

- [ ] **Step 3: Generate app PNG/ICO from `docs/sprint-ico.svg`.**

If `sharp` and `png-to-ico` are not available through current workspace dependencies, add them as project-local dev dependencies:

```powershell
pnpm add -D -w sharp png-to-ico
```

Create `scripts/generate-brand-assets.mjs`:

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const source = 'docs/sprint-ico.svg'
const pngTarget = 'app/build/appicon.png'
const icoTarget = 'app/build/windows/icon.ico'

await mkdir('app/build/windows', { recursive: true })

const svg = await readFile(source)
const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngBuffers = await Promise.all(
  sizes.map((size) => sharp(svg).resize(size, size).png().toBuffer()),
)

await sharp(svg).resize(1024, 1024).png().toFile(pngTarget)
await writeFile(icoTarget, await pngToIco(pngBuffers))
```

Run:

```powershell
node scripts\generate-brand-assets.mjs
```

Expected: `app/build/appicon.png` and `app/build/windows/icon.ico` are regenerated from the new racing-line icon.

- [ ] **Step 4: Verify asset references can resolve.**

Run:

```powershell
Test-Path app\frontend\src\assets\brand\sprint-wallpaper.png
Test-Path app\build\appicon.png
Test-Path app\build\windows\icon.ico
```

Expected: all three commands print `True`.

- [ ] **Step 5: Commit the asset foundation.**

Run:

```powershell
git add docs\Sprint.fig docs\DESIGN.md docs\sprint-ico.svg docs\sprint-square.svg docs\sprint-pattern.svg docs\sprint-wordmark.svg packages\ui\src\assets\brand app\frontend\src\assets\brand app\build\appicon.png app\build\windows\icon.ico scripts\generate-brand-assets.mjs package.json pnpm-lock.yaml
git commit -m "feat: add figma brand assets"
```

Expected: commit succeeds. If `package.json`, `pnpm-lock.yaml`, or `scripts/generate-brand-assets.mjs` were not needed, omit them from `git add`.

## Task 2: Exact Figma Token Foundation

**Files:**
- Modify: `packages/tokens/src/primitive/index.ts`
- Modify: `packages/tokens/src/atoms/colors.ts`
- Modify: `packages/tokens/src/atoms/radii.ts`
- Modify: `packages/tokens/src/atoms/typography.ts`
- Modify: `packages/tokens/src/semantic/index.ts`
- Modify: `packages/tokens/src/component/index.ts`
- Modify: `packages/tokens/src/molecules/borders.ts`
- Modify: `packages/tokens/src/molecules/surfaces.ts`
- Modify: `packages/tokens/src/molecules/shadows.ts`
- Modify: `packages/tokens/globals.css`
- Modify: `packages/tokens/tailwind.config.ts`
- Modify: `packages/tokens/src/tokenHierarchy.test.ts`
- Modify: `packages/tokens/src/molecules/surfaces.test.ts`

- [ ] **Step 1: Add token tests before source edits.**

Update `packages/tokens/src/tokenHierarchy.test.ts` with assertions equivalent to:

```ts
assert.equal(primitive.color.orange[500], '#ff6a00')
assert.equal(primitive.color.green[500], '#16b566')
assert.equal(primitive.color.red[500], '#f02744')
assert.equal(primitive.color.yellow[500], '#e0a30c')
assert.equal(primitive.color.blue[500], '#1f7fe6')
assert.equal(primitive.color.neutral[950], '#0a0a0a')
assert.equal(primitive.radius.panel, '14px')
assert.equal(primitive.radius.alert, '10px')
assert.equal(primitive.radius.control, '8px')
assert.equal(primitive.radius.tile, '6px')
assert.equal(primitive.radius.badge, '4px')
```

Update `packages/tokens/src/molecules/surfaces.test.ts` with assertions equivalent to:

```ts
assert.equal(surfaces.screen, '#0a0a0a')
assert.equal(surfaces.deep, '#050505')
assert.equal(surfaces.panel, '#0f0f0f')
assert.equal(surfaces.tile2, '#141414')
assert.equal(surfaces.tile3, '#1a1a1a')
assert.equal(surfaces.tile4, '#1f1f1f')
```

- [ ] **Step 2: Run the available token-adjacent check and confirm it fails or reports drift.**

Run:

```powershell
pnpm exec tsx packages\tokens\src\tokenHierarchy.test.ts
pnpm exec tsx packages\tokens\src\molecules\surfaces.test.ts
```

Expected: tests fail on current June 4 values such as `#33D27E`, `#FF4D63`, `9px`, or missing surface names.

- [ ] **Step 3: Replace primitive color, radius, and spacing values.**

Set `packages/tokens/src/primitive/index.ts` to expose these exact anchors:

```ts
export const primitiveColor = {
  orange: { 500: '#ff6a00' },
  green: { 500: '#16b566' },
  red: { 500: '#f02744' },
  yellow: { 500: '#e0a30c' },
  blue: { 500: '#1f7fe6' },
  neutral: {
    950: '#0a0a0a',
    900: '#050505',
    850: '#0f0f0f',
    800: '#141414',
    750: '#1a1a1a',
    700: '#1f1f1f',
    600: '#2e2e2e',
    500: '#424242',
    400: '#7a7a7a',
    300: '#5a5a5a',
    50: '#f6f6f6',
  },
} as const

export const primitiveRadius = {
  panel: '14px',
  alert: '10px',
  control: '8px',
  tile: '6px',
  badge: '4px',
  pill: '999px',
} as const

export const primitiveSpace = {
  0: '0px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3.5: '14px',
} as const
```

Keep any existing ramp keys required by consumers, but make the exported semantic/component values resolve to the Figma anchors above.

- [ ] **Step 4: Update `globals.css` public variables.**

Ensure `:root` includes:

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
--border: #2e2e2e;
--border-2: #424242;
--win-edge: #404040;
--text: #f6f6f6;
--muted: #7a7a7a;
--muted-2: #5a5a5a;
--orange: #ff6a00;
--green: #16b566;
--red: #f02744;
--amber: #e0a30c;
--blue: #1f7fe6;
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

Replace the font import with:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Saira:wght@400;500;600;700&family=Saira+Semi+Condensed:wght@500;700&family=Space+Grotesk:wght@700&display=swap');
```

Update utilities:

```css
.mono,
.ui-value {
  font-family: 'Saira', sans-serif;
  font-feature-settings: "tnum" 1;
  font-variant-numeric: tabular-nums;
}

.ui-wordmark {
  font-family: 'Saira Semi Condensed', Inter, sans-serif;
  font-weight: 700;
}
```

- [ ] **Step 5: Update Tailwind aliases and compatibility names.**

In `packages/tokens/tailwind.config.ts`, map these aliases:

```ts
colors: {
  background: 'var(--bg)',
  foreground: 'var(--text)',
  primary: 'var(--orange)',
  'primary-foreground': '#141414',
  success: 'var(--green)',
  destructive: 'var(--red)',
  warning: 'var(--amber)',
  info: 'var(--blue)',
  border: 'var(--border)',
  'border-strong': 'var(--border-2)',
  'bg-panel': 'var(--panel)',
  'bg-panel-2': 'var(--panel-2)',
  'bg-panel-3': 'var(--panel-3)',
  'bg-panel-4': 'var(--panel-4)',
}
```

Map radii:

```ts
borderRadius: {
  panel: '14px',
  alert: '10px',
  control: '8px',
  tile: '6px',
  badge: '4px',
  pill: '999px',
}
```

- [ ] **Step 6: Run token and downstream checks.**

Run:

```powershell
pnpm exec tsx packages\tokens\src\tokenHierarchy.test.ts
pnpm exec tsx packages\tokens\src\molecules\surfaces.test.ts
pnpm --filter @sprint/ui type-check
```

Expected: tests and UI type-check pass.

- [ ] **Step 7: Commit token foundation.**

Run:

```powershell
git add packages\tokens
git commit -m "feat: align tokens to figma export"
```

Expected: commit succeeds.

## Task 3: Shared Figma Component Primitives

**Files:**
- Modify: `packages/ui/src/components/primitives/Button.tsx`
- Modify: `packages/ui/src/components/primitives/Badge.tsx`
- Modify: `packages/ui/src/components/primitives/Card.tsx`
- Modify: `packages/ui/src/components/primitives/controlClasses.ts`
- Modify: `packages/ui/src/components/primitives/input.tsx`
- Modify: `packages/ui/src/components/primitives/select.tsx`
- Modify: `packages/ui/src/components/primitives/textarea.tsx`
- Modify: `packages/ui/src/components/primitives/progress.tsx`
- Modify: `packages/ui/src/components/primitives/table.tsx`
- Modify: `packages/ui/src/components/primitives/tabsClasses.ts`
- Modify: `packages/ui/src/components/primitives/panelClasses.ts`
- Modify: primitive tests in `packages/ui/src/components/primitives/*.test.ts`

- [ ] **Step 1: Update primitive tests for Figma metrics.**

Assert these class contracts in existing primitive tests:

```ts
assert.match(buttonVariants({ size: 'default' }), /h-\[25px\]/)
assert.match(buttonVariants({ size: 'default' }), /px-\[14px\]/)
assert.match(buttonVariants({ size: 'default' }), /rounded-control/)
assert.match(buttonVariants({ variant: 'primary' }), /bg-\[var\(--orange\)\]/)
assert.doesNotMatch(panelClassName, /shadow|backdrop-blur/)
```

- [ ] **Step 2: Rework button sizes and variants.**

Use Figma button defaults in `Button.tsx`:

```ts
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap border font-bold outline-none transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-[var(--orange)] bg-[var(--orange)] text-[#141414]",
        primary: "border-[var(--orange)] bg-[var(--orange)] text-[#141414]",
        secondary: "border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] hover:bg-[var(--panel-3)]",
        ghost: "border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]",
        destructive: "border-[var(--red-ring)] bg-[var(--red-tint)] text-[var(--red)]",
        disabled: "border-[var(--border)] bg-[var(--panel)] text-[var(--muted-2)]",
      },
      size: {
        default: "h-[25px] gap-1.5 rounded-control px-[14px] py-[6px] text-[13px]",
        sm: "h-[21px] gap-1 rounded-control px-[10px] py-[4px] text-[12px]",
        icon: "size-[25px] rounded-tile p-[6px] [&_svg:not([class*='size-'])]:size-[13px]",
        "icon-lg": "size-[28px] rounded-tile p-[6px] [&_svg:not([class*='size-'])]:size-4",
      },
    },
  },
)
```

Preserve exported `Button`, `buttonVariants`, `ButtonVariant`, `ButtonSize`, and `ButtonProps` names.

- [ ] **Step 3: Rework badges, cards, fields, progress, tabs, and panels.**

Use these target classes:

```ts
export const tagBase = "inline-flex h-5 items-center rounded-badge border px-[10px] py-1 font-saira-sc text-xs font-bold uppercase"
export const cardBase = "rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px] text-[var(--text)] shadow-none"
export const fieldBase = "h-8 rounded-control border border-[var(--border)] bg-[var(--panel-2)] px-[10px] text-[13px] text-[var(--text)] outline-none focus:border-[var(--orange)]"
export const progressBase = "h-2 rounded-pill bg-[var(--panel-3)]"
export const progressFill = "h-full rounded-pill bg-[var(--orange)]"
export const tabGroupBase = "rounded-alert border border-[var(--border)] bg-[var(--panel-2)] p-1"
export const tabItemBase = "h-[25px] rounded-control px-[14px] py-[6px] font-saira-sc text-[13px] font-medium"
```

Keep existing public component exports stable.

- [ ] **Step 4: Run shared UI checks.**

Run:

```powershell
pnpm --filter @sprint/ui type-check
pnpm --filter @sprint/ui build
```

Expected: both pass.

- [ ] **Step 5: Commit primitive migration.**

Run:

```powershell
git add packages\ui\src\components\primitives
git commit -m "feat: migrate shared primitives to figma metrics"
```

Expected: commit succeeds.

## Task 4: Shared Organisms, Brand Exports, And Telemetry Typography

**Files:**
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/src/components/organisms/NavRail.tsx`
- Modify: `packages/ui/src/components/organisms/PageHeader.tsx`
- Modify: `packages/ui/src/components/organisms/StatusStrip.tsx`
- Modify: `packages/ui/src/components/organisms/index.ts`
- Modify: `packages/ui/src/components/telemetry/*.tsx`
- Modify: `packages/ui/src/components/telemetry/telemetryTypography.test.ts`
- Modify: `packages/ui/src/components/organisms/shellOrganisms.test.ts`

- [ ] **Step 1: Export brand asset paths through UI package if current bundling supports it.**

Add exports in `packages/ui/src/index.ts`:

```ts
export const sprintBrandAssets = {
  icon: './assets/brand/sprint-icon.svg',
  square: './assets/brand/sprint-square.svg',
  pattern: './assets/brand/sprint-pattern.svg',
  wordmark: './assets/brand/sprint-wordmark.svg',
} as const
```

If the package build cannot emit asset files, keep assets for source consumers and document imports in app/web instead of exporting runtime URLs.

- [ ] **Step 2: Replace collapsible nav rail behavior with Figma sidebar rows.**

Update `NavRail.tsx` to support grouped sections while preserving simple `items` mode:

```ts
export interface NavRailSection {
  label: string
  items: NavRailItem[]
  pinned?: 'top' | 'bottom'
}

export interface NavRailProps {
  items?: NavRailItem[]
  sections?: NavRailSection[]
  activeId: string
  onSelect: (id: string) => void
  className?: string
}
```

Target row class:

```ts
"flex h-8 w-full items-center gap-[10px] rounded-control px-[10px] py-2 text-left font-inter text-[13px] font-medium"
```

Active row class:

```ts
"border border-[var(--orange)] bg-[var(--panel-3)] text-[var(--orange)]"
```

Inactive row class:

```ts
"border border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
```

- [ ] **Step 3: Add a shared topbar/page-tab organism if reuse is cleaner than local app-only code.**

Create or update a topbar component with:

```tsx
<div className="flex h-[41px] items-center gap-2 rounded-panel border border-[var(--border)] bg-[var(--panel)] px-2 py-1">
  <button className="size-[21px] rounded-tile bg-[var(--panel-2)]" />
  <span className="font-saira text-[11px] text-white" />
  <div className="mx-auto rounded-alert bg-[var(--panel-2)] p-1" />
  <div className="flex items-center gap-1" />
</div>
```

Name it `AppTopbar` only if it is app-specific; otherwise export it from `packages/ui`.

- [ ] **Step 4: Convert telemetry components to Saira numeric values.**

Replace JetBrains/class assumptions with:

```ts
const numericClassName = "font-saira tabular-nums"
const positiveClassName = "text-[var(--green)]"
const negativeClassName = "text-[var(--red)]"
const keyClassName = "text-[var(--orange)]"
const mutedClassName = "text-[var(--muted)]"
```

- [ ] **Step 5: Run checks and commit.**

Run:

```powershell
pnpm --filter @sprint/ui type-check
pnpm --filter @sprint/ui build
```

Commit:

```powershell
git add packages\ui
git commit -m "feat: align shared organisms with figma"
```

Expected: checks and commit succeed.

## Task 5: Desktop Shell, Navigation, And Default Landing

**Files:**
- Modify: `app/frontend/src/App.tsx`
- Modify: `app/frontend/src/index.css`
- Modify: `app/frontend/src/lib/appShell.ts`
- Modify: `app/frontend/src/lib/appShell.test.ts`
- Modify: `app/frontend/src/lib/windowControls.ts`
- Modify: `app/frontend/src/lib/windowControls.test.ts`
- Modify: `app/frontend/src/lib/windowControlsLayout.test.ts`

- [ ] **Step 1: Update app shell tests for default landing and visible nav.**

Assert:

```ts
assert.equal(createViewHistory().current, 'dash')
assert.deepEqual(primaryNavIds, ['telemetry', 'dash', 'devices', 'settings', 'help'])
```

If `createViewHistory` currently requires an argument, update it so omitted initial view means `'dash'`.

- [ ] **Step 2: Replace `NAV` with Figma sections in `App.tsx`.**

Use:

```ts
const NAV_SECTIONS = [
  { label: 'Developer', items: [{ id: 'telemetry', label: 'Dashboard', icon: IconGauge }] },
  { label: 'Configure', items: [
    { id: 'dash', label: 'Dash Editor', icon: IconLayoutDashboard },
    { id: 'devices', label: 'Devices', icon: IconUsb },
  ] },
  { label: 'System', pinned: 'bottom', items: [
    { id: 'settings', label: 'Settings', icon: IconSettings },
    { id: 'help', label: 'Help', icon: IconHelp },
  ] },
] as const
```

Remove Home and Controls from primary nav rendering. Keep their components only if references remain during cleanup.

- [ ] **Step 3: Rebuild the shell frame around the Figma application dimensions.**

Replace the root layout with:

```tsx
<div className="min-h-screen overflow-hidden bg-[url('@/assets/brand/sprint-wallpaper.png')] bg-cover bg-center p-4 text-[var(--text)]">
  <div className="mx-auto flex h-[883px] w-[1570px] max-w-full origin-top-left flex-col overflow-hidden rounded-panel border border-[var(--win-edge)] bg-[var(--win)] shadow-[0_4px_2px_rgba(0,0,0,.14),0_8px_16px_rgba(0,0,0,.14)]">
    {/* titlebar, sidebar, content screen */}
  </div>
</div>
```

If CSS `url()` alias resolution is unreliable in Tailwind arbitrary values, import the wallpaper and use inline style:

```tsx
import wallpaperUrl from '@/assets/brand/sprint-wallpaper.png'

<div style={{ backgroundImage: `url(${wallpaperUrl})` }} />
```

- [ ] **Step 4: Rebuild titlebar to 32px.**

Use:

```tsx
<header className="flex h-8 shrink-0 items-center gap-2 px-[14px] [--wails-draggable:drag]">
  <div className="flex size-5 items-center justify-center rounded-tile bg-[var(--orange)] font-space text-[13px] font-bold text-[var(--panel)]">S</div>
  <span className="font-inter text-[13px] font-bold text-white">Sprint</span>
  <span className="font-inter text-[13px] text-[var(--muted)]">- Telemetry System</span>
  <div className="flex-1" />
  <div className={windowControlsRailClassName}>...</div>
</header>
```

Move back/forward buttons, Settings, Help, and nav collapse controls out of the titlebar.

- [ ] **Step 5: Rebuild sidebar/content screen composition.**

Use:

```tsx
<div className="flex min-h-0 flex-1">
  <aside className="flex w-[220px] shrink-0 flex-col justify-between gap-[14px] p-[10px]">
    <NavRail sections={NAV_SECTIONS} activeId={view} onSelect={(id) => switchView(id as View)} />
  </aside>
  <section className="flex min-w-0 flex-1 flex-col gap-[14px] rounded-panel border border-[var(--border)] bg-[var(--bg)] p-[14px]">
    <AppTopbar ... />
    <main className="min-h-0 flex-1 overflow-hidden" />
  </section>
</div>
```

- [ ] **Step 6: Update window control classes.**

Use 32px-titlebar-compatible buttons:

```ts
export const windowControlsRailClassName = "flex h-full items-stretch [--wails-draggable:nodrag]"
export const windowControlMinimiseButtonClassName = "flex w-10 items-center justify-center text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-white"
export const windowControlMaximiseButtonClassName = windowControlMinimiseButtonClassName
export const windowControlCloseButtonClassName = "flex w-10 items-center justify-center text-[var(--muted)] hover:bg-[var(--red)] hover:text-white"
```

- [ ] **Step 7: Run desktop type-check and commit shell migration.**

Run:

```powershell
pnpm --filter @sprint/desktop type-check
```

Commit:

```powershell
git add app\frontend\src\App.tsx app\frontend\src\index.css app\frontend\src\lib\appShell.ts app\frontend\src\lib\appShell.test.ts app\frontend\src\lib\windowControls.ts app\frontend\src\lib\windowControls.test.ts app\frontend\src\lib\windowControlsLayout.test.ts
git commit -m "feat: migrate desktop shell to figma frame"
```

Expected: type-check and commit succeed.

## Task 6: Desktop Topbar And View Routing Cleanup

**Files:**
- Modify: `app/frontend/src/App.tsx`
- Modify: `app/frontend/src/components/PageTabs.tsx`
- Modify: `app/frontend/src/views/Home.tsx`
- Modify: `app/frontend/src/views/Controls.tsx`
- Modify: `app/frontend/src/views/DashEditor.tsx`
- Modify: `app/frontend/src/views/Telemetry.tsx`
- Modify: `app/frontend/src/views/Devices.tsx`
- Modify: `app/frontend/src/views/Settings.tsx`
- Modify: `app/frontend/src/views/Help.tsx`

- [ ] **Step 1: Create a local desktop topbar model.**

In `App.tsx`, derive per-view metadata:

```ts
const VIEW_META = {
  telemetry: { title: 'Developer / Dashboard', primary: 'Pause' },
  dash: { title: 'Configure / Dash Editor', primary: 'Save' },
  devices: { title: 'Configure / Devices', primary: 'Scan' },
  settings: { title: 'System / Settings', primary: 'Save' },
  help: { title: 'System / Help', primary: null },
} as const
```

- [ ] **Step 2: Render Figma topbar anatomy.**

Use:

```tsx
<div className="flex h-[41px] shrink-0 items-center gap-2 rounded-panel border border-[var(--border)] bg-[var(--panel)] px-2 py-1">
  <button className="flex size-[21px] items-center justify-center rounded-tile bg-[var(--panel-2)] text-[var(--muted)]" onClick={stepBackward} disabled={!viewHistory.canGoBack}>
    <IconArrowLeft size={13} />
  </button>
  <span className="font-saira text-[11px] text-white">{VIEW_META[view].title}</span>
  <PageTabs activeView={view} onSelect={switchView} />
  <div className="ml-auto flex items-center gap-1">{/* actions */}</div>
</div>
```

- [ ] **Step 3: Restrict page tabs to Figma-relevant views.**

`PageTabs.tsx` should render Dashboard, Dash Editor, Devices, Settings, and Help only when each is valid for the current shell. Use selected classes:

```ts
"rounded-control border border-[var(--orange)] bg-[var(--panel-4)] text-[var(--orange)]"
```

Use inactive classes:

```ts
"rounded-control border border-transparent text-[var(--muted)] hover:bg-[var(--panel-3)]"
```

- [ ] **Step 4: Remove primary routes for Home and Controls from the shell.**

Do not delete files in this task. Stop rendering Home/Controls in primary shell branches unless tests require a temporary hidden path.

Use:

```tsx
{view === 'telemetry' && <Telemetry frame={frame} />}
{view === 'dash' && <DashEditor ref={dashEditorRef} />}
{view === 'devices' && <Devices />}
{view === 'settings' && <Settings />}
{view === 'help' && <Help />}
```

- [ ] **Step 5: Run desktop checks and commit.**

Run:

```powershell
pnpm --filter @sprint/desktop type-check
```

Commit:

```powershell
git add app\frontend\src\App.tsx app\frontend\src\components\PageTabs.tsx app\frontend\src\views
git commit -m "feat: align desktop navigation with figma"
```

Expected: type-check and commit succeed.

## Task 7: Dash Editor Figma Reference Screen

**Files:**
- Modify: `app/frontend/src/views/DashEditor.tsx`
- Modify: `app/frontend/src/components/DashEditMode.tsx`
- Modify: `app/frontend/src/components/DashCanvas.tsx`
- Modify: `app/frontend/src/components/DashList.tsx`
- Modify: `app/frontend/src/components/WidgetProperties.tsx`
- Modify: `app/frontend/src/components/dash-editor/WidgetPalette.tsx`
- Modify: `app/frontend/src/components/dash-editor/EditorEdgeHandle.tsx`
- Modify: Dash Editor tests under `app/frontend/src/components/dash-editor/*.test.ts`

- [ ] **Step 1: Update Dash Editor tests for Figma metrics.**

Assert:

```ts
assert.match(renderedPaletteClassName, /w-\[240px\]/)
assert.match(renderedWidgetTileClassName, /w-\[107px\]/)
assert.match(renderedWidgetTileClassName, /h-\[46px\]/)
assert.match(renderedCanvasClassName, /800/)
assert.match(renderedCanvasClassName, /480/)
```

- [ ] **Step 2: Repaint editor root and palette.**

Use:

```tsx
<div className="grid h-full min-h-0 grid-cols-[240px_minmax(0,1fr)_286px] gap-[14px]">
  <aside className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]" />
  <section className="min-h-0 rounded-panel border border-[var(--border)] bg-[var(--bg-deep)] p-[14px]" />
  <aside className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]" />
</div>
```

- [ ] **Step 3: Repaint widget palette tiles.**

Use:

```tsx
<button className="flex h-[46px] w-[107px] items-center gap-2 rounded-alert border border-[var(--border-2)] bg-[var(--panel-3)] p-2 text-left hover:border-[var(--orange)]">
  <Icon className="size-[13px] text-[var(--muted)] group-hover:text-[var(--orange)]" />
  <span className="font-inter text-[11px] font-bold text-[var(--muted)]">{widget.name}</span>
</button>
```

- [ ] **Step 4: Repaint canvas frame.**

Keep current behavior and size semantics. The VoCore preview remains 800x480. Selected widgets use:

```ts
"outline outline-2 outline-[var(--orange)]"
```

Selected label uses:

```ts
"rounded-badge bg-[var(--orange)] px-1.5 py-0.5 font-saira-sc text-[10px] font-bold text-[var(--bg)]"
```

- [ ] **Step 5: Remove or hide end-user theme/font gallery from the default editor path.**

Keep brand defaults:

```ts
const defaultDashBrand = {
  accent: 'var(--orange)',
  numericFont: 'Saira',
}
```

Do not delete persisted settings in this task; only prevent the default UI from presenting a theme/font gallery not present in Figma.

- [ ] **Step 6: Run checks and commit.**

Run:

```powershell
pnpm --filter @sprint/desktop type-check
pnpm --filter @sprint/desktop build
```

Commit:

```powershell
git add app\frontend\src\views\DashEditor.tsx app\frontend\src\components\DashEditMode.tsx app\frontend\src\components\DashCanvas.tsx app\frontend\src\components\DashList.tsx app\frontend\src\components\WidgetProperties.tsx app\frontend\src\components\dash-editor
git commit -m "feat: migrate dash editor to figma reference"
```

Expected: type-check, build, and commit succeed.

## Task 8: Dashboard, Devices, Settings, Help Desktop Views

**Files:**
- Modify: `app/frontend/src/views/Telemetry.tsx`
- Modify: `app/frontend/src/views/Devices.tsx`
- Modify: `app/frontend/src/views/Settings.tsx`
- Modify: `app/frontend/src/views/Help.tsx`
- Modify: `app/frontend/src/components/devices/*.tsx`
- Modify: `app/frontend/src/components/AdditionalSettingsPanel.tsx`
- Modify: `app/frontend/src/components/AlertsEditor.tsx`
- Modify: `app/frontend/src/components/UpdateToast.tsx`
- Modify: `app/frontend/src/components/ConfirmDialog.tsx`

- [ ] **Step 1: Rename the visual role of `Telemetry` to Dashboard without changing route ID yet.**

Keep component name if renaming creates unnecessary churn, but make UI labels read `Dashboard`.

Use:

```tsx
<section className="grid h-full min-h-0 grid-cols-12 gap-[14px]">
  <div className="col-span-8 flex min-h-0 flex-col gap-[14px]" />
  <aside className="col-span-4 flex min-h-0 flex-col gap-[14px]" />
</section>
```

- [ ] **Step 2: Apply Figma card/metric anatomy.**

Use:

```tsx
<div className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
  <div className="font-inter text-[10px] font-bold uppercase tracking-[.12em] text-[var(--muted)]">Speed</div>
  <div className="font-saira text-[32px] tabular-nums text-[var(--text)]">124</div>
</div>
```

- [ ] **Step 3: Apply Figma alert anatomy.**

Use:

```tsx
<div className="flex gap-[10px] rounded-alert border border-[var(--border)] bg-[var(--panel)] p-[10px]">
  <div className="flex size-[28px] items-center justify-center rounded-tile border border-[var(--red-ring)] bg-[var(--red-tint)] text-[var(--red)]" />
  <div>
    <div className="font-inter text-[13px] font-bold text-[var(--text)]">Low Fuel</div>
    <div className="font-inter text-[11px] text-[var(--muted)]">8 laps remaining at current pace.</div>
  </div>
</div>
```

- [ ] **Step 4: Repaint Devices, Settings, and Help using shared primitives.**

Use shared `Button`, `Card`, inputs, tags, and alert rows. Do not change Wails calls, settings persistence, update install behavior, or device scan/bind behavior.

- [ ] **Step 5: Run checks and commit.**

Run:

```powershell
pnpm --filter @sprint/desktop type-check
pnpm --filter @sprint/desktop build
```

Commit:

```powershell
git add app\frontend\src\views\Telemetry.tsx app\frontend\src\views\Devices.tsx app\frontend\src\views\Settings.tsx app\frontend\src\views\Help.tsx app\frontend\src\components
git commit -m "feat: migrate desktop views to figma components"
```

Expected: type-check, build, and commit succeed.

## Task 9: Desktop Visual Verification

**Files:**
- No planned source edits unless verification exposes a focused fix.

- [ ] **Step 1: Run final desktop checks.**

Run:

```powershell
pnpm --filter @sprint/ui build
pnpm --filter @sprint/desktop type-check
pnpm --filter @sprint/desktop build
```

Expected: all pass.

- [ ] **Step 2: Inspect browser-safe desktop UI.**

Run:

```powershell
cd app
wails dev
```

Open `http://localhost:5173/`.

Expected visual facts:

- Stage uses the race-car wallpaper.
- App frame is 1570x883 at base with 14px radius.
- Titlebar is 32px.
- Sidebar is 220px.
- Content screen uses 14px padding and `#0a0a0a`.
- Topbar is 41px.
- Dash Editor is default landing.
- No old cyan/purple/glass/elevated look remains in visible desktop UI.

- [ ] **Step 3: Inspect desktop-bound runtime if needed.**

Run:

```powershell
make dev-app-agent
pwsh -File .\app\scripts\wait-desktop-browser.ps1
```

Open `http://127.0.0.1:34115` or the port from `SPRINT_WAILS_DEVSERVER_PORT`.

Expected: Wails-bound actions still work, including window controls, update toast dismissal, settings, device actions, and Dash Editor dirty-state guard.

- [ ] **Step 4: Commit visual verification fixes if any.**

If fixes were made:

```powershell
git add app\frontend packages\ui packages\tokens
git commit -m "fix: resolve desktop figma verification issues"
```

Expected: commit succeeds. If no fixes were needed, do not create an empty commit.

## Task 10: Web Shell And Navigation Migration

**Files:**
- Modify: `web/app/globals.css`
- Modify: `web/app/layout.tsx`
- Modify: `web/components/WebNavRail.tsx`
- Modify: `web/components/nav.tsx`
- Modify: `web/tailwind.config.ts`

- [ ] **Step 1: Import shared tokens and fonts in web globals.**

Use:

```css
@import "@sprint/tokens/globals.css";

html,
body {
  min-height: 100%;
  background: var(--bg);
  color: var(--text);
}
```

- [ ] **Step 2: Rebuild web layout without desktop chrome.**

Use:

```tsx
<body className="min-h-screen overflow-hidden bg-[var(--bg)] font-inter text-[var(--text)] antialiased">
  <div className="flex h-screen">
    <WebNavRail />
    <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--bg)] p-[14px]">
      {children}
    </main>
  </div>
</body>
```

- [ ] **Step 3: Align web nav rows with shared nav metrics.**

Use:

```tsx
<a className="flex h-8 items-center gap-[10px] rounded-control px-[10px] py-2 font-inter text-[13px] font-medium text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]" />
```

Active:

```tsx
"border border-[var(--orange)] bg-[var(--panel-3)] text-[var(--orange)]"
```

- [ ] **Step 4: Run web shell checks and commit.**

Run:

```powershell
pnpm --filter @sprint/web type-check
```

Commit:

```powershell
git add web\app\globals.css web\app\layout.tsx web\components web\tailwind.config.ts
git commit -m "feat: migrate web shell to figma foundation"
```

Expected: type-check and commit succeed.

## Task 11: Web Route Migration And Verification

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/app/sessions/page.tsx`
- Modify: `web/app/engineer/page.tsx`
- Modify: `web/app/setups/page.tsx`
- Modify: `web/app/dash/page.tsx`

- [ ] **Step 1: Repaint route page containers.**

Each page starts with:

```tsx
<section className="space-y-[14px]">
  <header className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
    <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Sprint</p>
    <h1 className="font-inter text-[13px] font-bold text-[var(--text)]">Page title</h1>
  </header>
</section>
```

- [ ] **Step 2: Repaint web cards, tables, forms, and dash preview.**

Use the same shared primitives and classes from desktop:

```tsx
<div className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]" />
<button className="h-[25px] rounded-control border border-[var(--orange)] bg-[var(--orange)] px-[14px] py-[6px] font-inter text-[13px] font-bold text-[#141414]" />
<span className="font-saira tabular-nums text-[var(--orange)]" />
```

Do not add desktop titlebar or Wails-only behavior.

- [ ] **Step 3: Run web final checks.**

Run:

```powershell
pnpm --filter @sprint/web type-check
pnpm --filter @sprint/web build
```

Expected: both pass.

- [ ] **Step 4: Inspect web visually.**

Run:

```powershell
make dev-web
```

Open the local Next.js URL, normally `http://localhost:3000/`.

Expected: all routes use Figma colors, typography, border/radius system, and no legacy cyan/purple/glass defaults.

- [ ] **Step 5: Commit web route migration.**

Run:

```powershell
git add web
git commit -m "feat: migrate web routes to figma theme"
```

Expected: commit succeeds.

## Final Verification

- [ ] Run full relevant checks:

```powershell
pnpm --filter @sprint/ui build
pnpm --filter @sprint/desktop type-check
pnpm --filter @sprint/desktop build
pnpm --filter @sprint/web type-check
pnpm --filter @sprint/web build
```

- [ ] Run Go checks only if implementation touched Go files:

```powershell
make test
```

- [ ] Final source scan for legacy visual drift:

```powershell
Select-String -Path app\frontend\src\**,packages\ui\src\**,packages\tokens\**,web\** -Pattern 'JetBrains|#33D27E|#FF4D63|#ff906c|#5af8fb|backdrop-blur|shadow-lg|glass' -CaseSensitive:$false
```

Expected: matches are either removed, compatibility-only token aliases, or intentionally documented exceptions.
