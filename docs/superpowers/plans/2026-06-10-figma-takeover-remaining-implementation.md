# Figma Theme Takeover Remaining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Sprint Figma migration from the current committed state (`516a327`) through desktop verification and web migration.

**Architecture:** Foundation is already committed: brand assets, tokens, shared primitives, shared organisms, desktop shell, desktop navigation, and the first Dash Editor palette/grid slice. Continue in strict order: finish desktop UI, verify desktop, then migrate web. Every task must stage only the files named in that task because this checkout has substantial unrelated dirty work.

**Tech Stack:** TypeScript, React 19, Tailwind CSS 4, pnpm workspaces, Wails/Vite desktop app, Next.js web app, shared `@sprint/tokens` and `@sprint/ui`.

---

## Current State

Completed commits:
- `6fe5041` `feat: add figma brand assets`
- `507ddab` final token parity fix after token foundation commits
- `7a3356d` `feat: migrate shared primitives to figma metrics`
- `d84da76` `feat: align shared organisms with figma`
- `2c4fca6` `feat: migrate desktop shell to figma frame`
- `aae4198` `feat: align desktop navigation with figma`
- `516a327` `feat: align dash editor palette with figma metrics`

Important constraints:
- Do not use Figma MCP. Use `docs/DESIGN.md` and local `docs/Sprint.fig`.
- Do not revert unrelated dirty worktree changes.
- Do not stage broad directories unless the task explicitly requires them and `git diff --cached --name-only` has been checked.
- Run the smallest relevant checks after each task.
- Do not claim completion without command evidence.

## Remaining File Map

Dash Editor:
- Modify: `app/frontend/src/views/DashEditor.tsx`
- Modify: `app/frontend/src/components/DashEditMode.tsx`
- Modify: `app/frontend/src/components/DashCanvas.tsx`
- Modify: `app/frontend/src/components/DashList.tsx`
- Modify: `app/frontend/src/components/WidgetProperties.tsx`
- Modify: `app/frontend/src/components/AdditionalSettingsPanel.tsx`
- Modify: `app/frontend/src/components/AlertsEditor.tsx`
- Modify: `app/frontend/src/components/dash-editor/EditorEdgeHandle.tsx`
- Modify/Test: `app/frontend/src/components/dash-editor/*.test.ts`

Desktop Views:
- Modify: `app/frontend/src/views/Telemetry.tsx`
- Modify: `app/frontend/src/views/Devices.tsx`
- Modify: `app/frontend/src/views/Settings.tsx`
- Modify: `app/frontend/src/views/Help.tsx`
- Modify: `app/frontend/src/components/devices/*.tsx`
- Modify: `app/frontend/src/components/UpdateToast.tsx`
- Modify: `app/frontend/src/components/ConfirmDialog.tsx`
- Test: `app/frontend/src/views/telemetryHandoff.test.ts`
- Test: `app/frontend/src/views/appHandoffSource.test.ts`

Web:
- Modify: `web/app/globals.css`
- Modify: `web/app/layout.tsx`
- Modify: `web/components/WebNavRail.tsx`
- Modify: `web/components/nav.tsx`
- Modify: `web/tailwind.config.ts`
- Modify: `web/app/page.tsx`
- Modify: `web/app/sessions/page.tsx`
- Modify: `web/app/engineer/page.tsx`
- Modify: `web/app/setups/page.tsx`
- Modify: `web/app/dash/page.tsx`

Verification:
- Use `pnpm --filter @sprint/ui build`
- Use `pnpm --filter @sprint/desktop type-check`
- Use `pnpm --filter @sprint/desktop build`
- Use `pnpm --filter @sprint/web type-check`
- Use `pnpm --filter @sprint/web build`
- Use browser-safe desktop target `http://localhost:5173/` while `cd app && wails dev` is running.
- Use web target `http://localhost:3000/` while `make dev-web` is running.

---

## Task 1: Finish Dash Editor Canvas And Inspector Figma Metrics

**Files:**
- Modify: `app/frontend/src/components/DashCanvas.tsx`
- Modify: `app/frontend/src/components/DashEditMode.tsx`
- Modify: `app/frontend/src/components/WidgetProperties.tsx`
- Modify: `app/frontend/src/components/dash-editor/EditorEdgeHandle.tsx`
- Modify: `app/frontend/src/components/dash-editor/dashCanvasChrome.test.ts`
- Modify: `app/frontend/src/components/dash-editor/widgetInspectorSections.test.ts`
- Modify: `app/frontend/src/components/dash-editor/dashEditorSidebarChrome.test.ts`

- [ ] **Step 1: Add failing tests for selected widget chrome and inspector flat styling.**

Patch `app/frontend/src/components/dash-editor/dashCanvasChrome.test.ts` with:

```ts
test('selected widgets use Figma orange outlines and badge labels', () => {
  assert.match(dashCanvasSource, /outline-\[var\(--orange\)\]/)
  assert.match(dashCanvasSource, /rounded-badge bg-\[var\(--orange\)\]/)
  assert.match(dashCanvasSource, /font-saira-sc text-\[10px\] font-bold text-\[var\(--bg\)\]/)
  assert.doesNotMatch(dashCanvasSource, /ring-|shadow-lg|border-primary\/40/)
})
```

Patch `app/frontend/src/components/dash-editor/widgetInspectorSections.test.ts` with:

```ts
test('widget inspector sections use Figma panel and field tokens', () => {
  assert.match(dashEditModeSource, /rounded-panel border border-\[var\(--border\)\] bg-\[var\(--panel\)\]/)
  assert.match(widgetPropertiesSource, /border-\[var\(--border\)\]/)
  assert.match(widgetPropertiesSource, /bg-\[var\(--panel-2\)\]/)
  assert.doesNotMatch(widgetPropertiesSource, /bg-bg-panel|border-border-input|text-text-muted/)
})
```

- [ ] **Step 2: Run tests and confirm they fail.**

Run:

```powershell
pnpm dlx tsx app\frontend\src\components\dash-editor\dashCanvasChrome.test.ts
pnpm dlx tsx app\frontend\src\components\dash-editor\widgetInspectorSections.test.ts
```

Expected: failures reference missing `outline-[var(--orange)]`, badge label classes, or old token classes.

- [ ] **Step 3: Update `DashCanvas.tsx` selected state classes.**

Use this target for selected widget containers and labels:

```tsx
className={cn(
  'absolute overflow-hidden rounded-badge border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_86%,transparent)]',
  rect.selected && 'outline outline-2 outline-[var(--orange)]',
)}
```

Use this selected label class:

```tsx
className="rounded-badge bg-[var(--orange)] px-1.5 py-0.5 font-saira-sc text-[10px] font-bold text-[var(--bg)]"
```

Keep drag, resize, overlay, and stack click behavior unchanged.

- [ ] **Step 4: Update inspector section and edge handle classes.**

In `DashEditMode.tsx`, use:

```tsx
<section className="overflow-hidden rounded-panel border border-[var(--border)] bg-[var(--panel)]">
```

For disclosure headers:

```tsx
className="flex w-full items-center justify-between gap-3 bg-[var(--panel-2)] px-[10px] py-2 text-left transition-colors hover:bg-[var(--panel-3)]"
```

In `EditorEdgeHandle.tsx`, use a 25px icon-tile style:

```tsx
"flex size-[25px] items-center justify-center rounded-tile border border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:border-[var(--orange)] hover:text-[var(--orange)]"
```

- [ ] **Step 5: Update `WidgetProperties.tsx` fields to Figma field tokens.**

Use:

```tsx
className="h-8 rounded-control border border-[var(--border)] bg-[var(--panel-2)] px-[10px] font-saira text-[13px] tabular-nums text-[var(--text)] outline-none focus:border-[var(--orange)]"
```

Use labels:

```tsx
className="font-inter text-[11px] text-[var(--muted)]"
```

- [ ] **Step 6: Run checks.**

Run:

```powershell
pnpm dlx tsx app\frontend\src\components\dash-editor\dashCanvasChrome.test.ts
pnpm dlx tsx app\frontend\src\components\dash-editor\widgetInspectorSections.test.ts
pnpm dlx tsx app\frontend\src\components\dash-editor\dashEditorSidebarChrome.test.ts
pnpm --filter @sprint/desktop type-check
```

Expected: all pass.

- [ ] **Step 7: Commit.**

Run:

```powershell
git add app\frontend\src\components\DashCanvas.tsx app\frontend\src\components\DashEditMode.tsx app\frontend\src\components\WidgetProperties.tsx app\frontend\src\components\dash-editor\EditorEdgeHandle.tsx app\frontend\src\components\dash-editor\dashCanvasChrome.test.ts app\frontend\src\components\dash-editor\widgetInspectorSections.test.ts app\frontend\src\components\dash-editor\dashEditorSidebarChrome.test.ts
git diff --cached --name-only
git commit -m "feat: align dash editor canvas chrome with figma"
```

Expected: staged files are only the Task 1 files and commit succeeds.

## Task 2: Hide Default Theme And Font Gallery From Dash Editor

**Files:**
- Modify: `app/frontend/src/views/DashEditor.tsx`
- Modify: `app/frontend/src/components/DashEditMode.tsx`
- Modify: `app/frontend/src/components/AdditionalSettingsPanel.tsx`
- Modify: `app/frontend/src/components/dash-editor/dashEditorUIPreferences.test.ts`

- [ ] **Step 1: Add failing source test for hidden gallery.**

Patch `app/frontend/src/components/dash-editor/dashEditorUIPreferences.test.ts` with:

```ts
import { readFileSync } from 'node:fs'

const dashEditModeSource = readFileSync(new URL('../DashEditMode.tsx', import.meta.url), 'utf8')

test('default editor path does not expose theme or font gallery controls', () => {
  assert.doesNotMatch(dashEditModeSource, /setEditorTab\('settings'\)/)
  assert.doesNotMatch(dashEditModeSource, />Settings<\/button>/)
  assert.match(dashEditModeSource, /const defaultDashBrand/)
  assert.match(dashEditModeSource, /numericFont: 'Saira'/)
  assert.match(dashEditModeSource, /accent: 'var\(--orange\)'/)
})
```

- [ ] **Step 2: Run test and confirm it fails.**

Run:

```powershell
pnpm dlx tsx app\frontend\src\components\dash-editor\dashEditorUIPreferences.test.ts
```

Expected: fails because the settings tab is still visible or `defaultDashBrand` is missing.

- [ ] **Step 3: Remove the settings tab from default editor tabs.**

In `DashEditMode.tsx`, keep persisted settings handlers but remove the visible Designer/Settings tab switch from default navigation. Add:

```ts
const defaultDashBrand = {
  accent: 'var(--orange)',
  numericFont: 'Saira',
} as const
```

Keep `AdditionalSettingsPanel` reachable only from non-default/global settings paths already owned by `DashEditor.tsx`, not from the default edit screen.

- [ ] **Step 4: Ensure hardcoded theme defaults remain Figma-facing.**

Where local editor defaults are displayed, use:

```ts
const defaultDashBrand = {
  accent: 'var(--orange)',
  numericFont: 'Saira',
} as const
```

Do not delete persisted `theme`, `domainPalette`, `typography`, or `formatPreferences` data.

- [ ] **Step 5: Run checks.**

Run:

```powershell
pnpm dlx tsx app\frontend\src\components\dash-editor\dashEditorUIPreferences.test.ts
pnpm --filter @sprint/desktop type-check
```

Expected: both pass.

- [ ] **Step 6: Commit.**

Run:

```powershell
git add app\frontend\src\views\DashEditor.tsx app\frontend\src\components\DashEditMode.tsx app\frontend\src\components\AdditionalSettingsPanel.tsx app\frontend\src\components\dash-editor\dashEditorUIPreferences.test.ts
git diff --cached --name-only
git commit -m "feat: simplify dash editor defaults for figma"
```

Expected: staged files are only Task 2 files and commit succeeds.

## Task 3: Finish Dash List, Alerts, And Editor Runtime Chrome

**Files:**
- Modify: `app/frontend/src/views/DashEditor.tsx`
- Modify: `app/frontend/src/components/DashList.tsx`
- Modify: `app/frontend/src/components/AlertsEditor.tsx`
- Modify: `app/frontend/src/components/WidgetPreview.tsx`
- Modify: `app/frontend/src/components/dash-editor/dashEditorCatalogLoading.test.ts`

- [ ] **Step 1: Add failing tests for list cards and loading states.**

In `app/frontend/src/components/dash-editor/dashEditorCatalogLoading.test.ts`, assert:

```ts
assert.match(dashListSource, /rounded-panel border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[14px\]/)
assert.match(alertsEditorSource, /rounded-alert border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[10px\]/)
assert.doesNotMatch(`${dashListSource}\n${alertsEditorSource}`, /bg-bg-container|bg-bg-panel|border-border-input|shadow-lg/)
```

- [ ] **Step 2: Run test and confirm failure.**

Run:

```powershell
pnpm dlx tsx app\frontend\src\components\dash-editor\dashEditorCatalogLoading.test.ts
```

Expected: fails on old card or border classes.

- [ ] **Step 3: Repaint `DashList.tsx` cards.**

Use:

```tsx
<div className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
```

For layout metadata:

```tsx
<span className="font-saira text-[12px] tabular-nums text-[var(--muted)]">
```

- [ ] **Step 4: Repaint `AlertsEditor.tsx` alert rows.**

Use:

```tsx
<div className="flex gap-[10px] rounded-alert border border-[var(--border)] bg-[var(--panel)] p-[10px]">
  <div className="flex size-[28px] items-center justify-center rounded-tile border border-[var(--amber-ring)] bg-[var(--amber-tint)] text-[var(--amber)]" />
</div>
```

- [ ] **Step 5: Repaint `WidgetPreview.tsx` placeholder/content shell.**

Use:

```tsx
className="rounded-alert border border-[var(--border)] bg-[var(--panel-2)]"
```

For captions:

```tsx
className="font-saira text-[10px] tabular-nums text-[var(--muted-2)]"
```

- [ ] **Step 6: Run checks and commit.**

Run:

```powershell
pnpm dlx tsx app\frontend\src\components\dash-editor\dashEditorCatalogLoading.test.ts
pnpm --filter @sprint/desktop type-check
pnpm --filter @sprint/desktop build
```

Commit:

```powershell
git add app\frontend\src\views\DashEditor.tsx app\frontend\src\components\DashList.tsx app\frontend\src\components\AlertsEditor.tsx app\frontend\src\components\WidgetPreview.tsx app\frontend\src\components\dash-editor\dashEditorCatalogLoading.test.ts
git diff --cached --name-only
git commit -m "feat: finish dash editor figma chrome"
```

Expected: checks and commit succeed.

## Task 4: Migrate Dashboard View

**Files:**
- Modify: `app/frontend/src/views/Telemetry.tsx`
- Modify: `app/frontend/src/views/telemetryHandoff.test.ts`

- [ ] **Step 1: Add failing Dashboard view source tests.**

In `app/frontend/src/views/telemetryHandoff.test.ts`, assert:

```ts
assert.match(telemetrySource, /Dashboard/)
assert.match(telemetrySource, /grid h-full min-h-0 grid-cols-12 gap-\[14px\]/)
assert.match(telemetrySource, /rounded-panel border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[14px\]/)
assert.match(telemetrySource, /font-saira[^'"]*tabular-nums/)
assert.match(telemetrySource, /rounded-alert border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[10px\]/)
assert.doesNotMatch(telemetrySource, /Live Session|bg-bg-|text-text-|font-mono|cyan|purple/)
```

- [ ] **Step 2: Run test and confirm failure.**

Run:

```powershell
pnpm dlx tsx app\frontend\src\views\telemetryHandoff.test.ts
```

Expected: fails on legacy labels/classes.

- [ ] **Step 3: Repaint `Telemetry.tsx` as Dashboard.**

Use this top-level layout:

```tsx
<section className="grid h-full min-h-0 grid-cols-12 gap-[14px]">
  <div className="col-span-8 flex min-h-0 flex-col gap-[14px]">
    ...
  </div>
  <aside className="col-span-4 flex min-h-0 flex-col gap-[14px]">
    ...
  </aside>
</section>
```

Use metric cards:

```tsx
<div className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
  <div className="font-inter text-[10px] font-bold uppercase tracking-[.12em] text-[var(--muted)]">Speed</div>
  <div className="font-saira text-[32px] tabular-nums text-[var(--text)]">{speed}</div>
</div>
```

Use alert rows:

```tsx
<div className="flex gap-[10px] rounded-alert border border-[var(--border)] bg-[var(--panel)] p-[10px]">
  <div className="flex size-[28px] items-center justify-center rounded-tile border border-[var(--red-ring)] bg-[var(--red-tint)] text-[var(--red)]" />
  <div>
    <div className="font-inter text-[13px] font-bold text-[var(--text)]">Low Fuel</div>
    <div className="font-inter text-[11px] text-[var(--muted)]">8 laps remaining at current pace.</div>
  </div>
</div>
```

- [ ] **Step 4: Run checks and commit.**

Run:

```powershell
pnpm dlx tsx app\frontend\src\views\telemetryHandoff.test.ts
pnpm --filter @sprint/desktop type-check
```

Commit:

```powershell
git add app\frontend\src\views\Telemetry.tsx app\frontend\src\views\telemetryHandoff.test.ts
git diff --cached --name-only
git commit -m "feat: migrate desktop dashboard view to figma"
```

Expected: checks and commit succeed.

## Task 5: Migrate Devices View And Device Components

**Files:**
- Modify: `app/frontend/src/views/Devices.tsx`
- Modify: `app/frontend/src/components/devices/CatalogPanel.tsx`
- Modify: `app/frontend/src/components/devices/DeviceCommandRow.tsx`
- Modify: `app/frontend/src/components/devices/DeviceDetail.tsx`
- Modify: `app/frontend/src/components/devices/DeviceSection.tsx`
- Modify: `app/frontend/src/components/devices/DriverMissingBanner.tsx`
- Modify: `app/frontend/src/components/devices/ScanPicker.tsx`
- Test: create or modify `app/frontend/src/views/appHandoffSource.test.ts`

- [ ] **Step 1: Add source test for devices chrome.**

Add assertions:

```ts
assert.match(devicesSource, /rounded-panel border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[14px\]/)
assert.match(deviceComponentsSource, /rounded-alert border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[10px\]/)
assert.match(deviceComponentsSource, /h-8[^'"]*rounded-control/)
assert.doesNotMatch(`${devicesSource}\n${deviceComponentsSource}`, /bg-bg-|border-border-input|shadow-lg|cyan|purple/)
```

- [ ] **Step 2: Run test and confirm failure.**

Run:

```powershell
pnpm dlx tsx app\frontend\src\views\appHandoffSource.test.ts
```

Expected: fails on old classes.

- [ ] **Step 3: Repaint devices components using Figma panels and alerts.**

Use panel:

```tsx
className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]"
```

Use command rows:

```tsx
className="flex items-center justify-between gap-[10px] rounded-alert border border-[var(--border)] bg-[var(--panel)] p-[10px]"
```

Use missing driver banner:

```tsx
className="flex gap-[10px] rounded-alert border border-[var(--amber-ring)] bg-[var(--amber-tint)] p-[10px] text-[var(--amber)]"
```

- [ ] **Step 4: Run checks and commit.**

Run:

```powershell
pnpm dlx tsx app\frontend\src\views\appHandoffSource.test.ts
pnpm --filter @sprint/desktop type-check
```

Commit:

```powershell
git add app\frontend\src\views\Devices.tsx app\frontend\src\components\devices app\frontend\src\views\appHandoffSource.test.ts
git diff --cached --name-only
git commit -m "feat: migrate desktop devices view to figma"
```

Expected: checks and commit succeed.

## Task 6: Migrate Settings, Help, Toasts, And Dialogs

**Files:**
- Modify: `app/frontend/src/views/Settings.tsx`
- Modify: `app/frontend/src/views/Help.tsx`
- Modify: `app/frontend/src/components/UpdateToast.tsx`
- Modify: `app/frontend/src/components/ConfirmDialog.tsx`
- Modify: `app/frontend/src/views/appHandoffSource.test.ts`

- [ ] **Step 1: Add source tests for system views and overlays.**

Add:

```ts
assert.match(settingsSource, /rounded-panel border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[14px\]/)
assert.match(helpSource, /font-inter text-\[13px\] font-bold text-\[var\(--text\)\]/)
assert.match(updateToastSource, /rounded-alert border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[10px\]/)
assert.match(confirmDialogSource, /rounded-panel border border-\[var\(--border\)\] bg-\[var\(--panel\)\]/)
assert.doesNotMatch(`${settingsSource}\n${helpSource}\n${updateToastSource}\n${confirmDialogSource}`, /shadow-lg|backdrop-blur|bg-bg-|text-text-/)
```

- [ ] **Step 2: Run test and confirm failure.**

Run:

```powershell
pnpm dlx tsx app\frontend\src\views\appHandoffSource.test.ts
```

Expected: fails on old classes.

- [ ] **Step 3: Repaint Settings and Help.**

Use panel:

```tsx
<section className="space-y-[14px]">
  <div className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
    <h2 className="font-inter text-[13px] font-bold text-[var(--text)]">Settings</h2>
  </div>
</section>
```

- [ ] **Step 4: Repaint `UpdateToast.tsx` and `ConfirmDialog.tsx`.**

Use alert/dialog surface:

```tsx
className="rounded-alert border border-[var(--border)] bg-[var(--panel)] p-[10px]"
```

For dialog body:

```tsx
className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px] shadow-none"
```

- [ ] **Step 5: Run checks and commit.**

Run:

```powershell
pnpm dlx tsx app\frontend\src\views\appHandoffSource.test.ts
pnpm --filter @sprint/desktop type-check
pnpm --filter @sprint/desktop build
```

Commit:

```powershell
git add app\frontend\src\views\Settings.tsx app\frontend\src\views\Help.tsx app\frontend\src\components\UpdateToast.tsx app\frontend\src\components\ConfirmDialog.tsx app\frontend\src\views\appHandoffSource.test.ts
git diff --cached --name-only
git commit -m "feat: migrate desktop system views to figma"
```

Expected: checks and commit succeed.

## Task 7: Desktop Visual Verification And Fixes

**Files:**
- Modify only files needed for focused visual fixes.

- [ ] **Step 1: Run desktop verification commands.**

Run:

```powershell
pnpm --filter @sprint/ui build
pnpm --filter @sprint/desktop type-check
pnpm --filter @sprint/desktop build
```

Expected: all exit 0.

- [ ] **Step 2: Run browser-safe desktop.**

Run in a long-running shell:

```powershell
cd app
wails dev
```

Open `http://localhost:5173/`.

Expected visual facts:
- Race-car wallpaper behind the app frame.
- 1570×883 base frame with 14px radius.
- 32px titlebar.
- 220px sidebar.
- 41px content topbar.
- Dash Editor default landing.
- Dash Editor palette is 240px wide.
- Widget tiles are 107×46.
- No visible cyan/purple/glass/elevated legacy chrome.

- [ ] **Step 3: Fix any visual defects with focused commits.**

For each defect:

```powershell
git add <only-files-fixed>
git diff --cached --name-only
git commit -m "fix: resolve desktop figma verification issue"
```

Expected: no broad staging.

## Task 8: Migrate Web Shell And Navigation

**Files:**
- Modify: `web/app/globals.css`
- Modify: `web/app/layout.tsx`
- Modify: `web/components/WebNavRail.tsx`
- Modify: `web/components/nav.tsx`
- Modify: `web/tailwind.config.ts`

- [ ] **Step 1: Add web shell source assertions.**

Create or update `web/components/webShellFigma.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const globalsSource = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
const navSource = readFileSync(new URL('./WebNavRail.tsx', import.meta.url), 'utf8')

test('web shell imports shared Figma tokens and uses flat app layout', () => {
  assert.match(globalsSource, /@import ["']@sprint\/tokens\/globals\.css["']/)
  assert.match(layoutSource, /bg-\[var\(--bg\)\]/)
  assert.match(layoutSource, /font-inter/)
  assert.match(layoutSource, /p-\[14px\]/)
})

test('web nav rows match Figma sidebar metrics', () => {
  assert.match(navSource, /h-8/)
  assert.match(navSource, /gap-\[10px\]/)
  assert.match(navSource, /rounded-control/)
  assert.match(navSource, /border-\[var\(--orange\)\]/)
  assert.match(navSource, /bg-\[var\(--panel-3\)\]/)
})
```

- [ ] **Step 2: Run test and confirm failure.**

Run:

```powershell
pnpm dlx tsx web\components\webShellFigma.test.ts
```

Expected: fails on old web shell/nav classes.

- [ ] **Step 3: Import shared tokens in `web/app/globals.css`.**

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

- [ ] **Step 4: Rebuild web layout without desktop chrome.**

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

- [ ] **Step 5: Rebuild web nav rows.**

Use:

```tsx
className={cn(
  "flex h-8 items-center gap-[10px] rounded-control border px-[10px] py-2 font-inter text-[13px] font-medium",
  active
    ? "border-[var(--orange)] bg-[var(--panel-3)] text-[var(--orange)]"
    : "border-transparent text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]",
)}
```

- [ ] **Step 6: Run checks and commit.**

Run:

```powershell
pnpm dlx tsx web\components\webShellFigma.test.ts
pnpm --filter @sprint/web type-check
```

Commit:

```powershell
git add web\app\globals.css web\app\layout.tsx web\components\WebNavRail.tsx web\components\nav.tsx web\tailwind.config.ts web\components\webShellFigma.test.ts
git diff --cached --name-only
git commit -m "feat: migrate web shell to figma foundation"
```

Expected: checks and commit succeed.

## Task 9: Migrate Web Routes

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/app/sessions/page.tsx`
- Modify: `web/app/engineer/page.tsx`
- Modify: `web/app/setups/page.tsx`
- Modify: `web/app/dash/page.tsx`
- Test: create `web/app/webRoutesFigma.test.ts`

- [ ] **Step 1: Add route source assertions.**

Create `web/app/webRoutesFigma.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sources = [
  readFileSync(new URL('./page.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('./sessions/page.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('./engineer/page.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('./setups/page.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('./dash/page.tsx', import.meta.url), 'utf8'),
].join('\n')

test('web routes use Figma page, card, and numeric styling', () => {
  assert.match(sources, /space-y-\[14px\]/)
  assert.match(sources, /rounded-panel border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[14px\]/)
  assert.match(sources, /font-inter text-\[13px\] font-bold text-\[var\(--text\)\]/)
  assert.match(sources, /font-saira[^'"]*tabular-nums/)
  assert.doesNotMatch(sources, /#ff906c|#5af8fb|cyan|purple|shadow-lg|backdrop-blur|glass/)
})
```

- [ ] **Step 2: Run test and confirm failure.**

Run:

```powershell
pnpm dlx tsx web\app\webRoutesFigma.test.ts
```

Expected: fails on old route classes.

- [ ] **Step 3: Repaint each route page header.**

Use on every page:

```tsx
<section className="space-y-[14px]">
  <header className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
    <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Sprint</p>
    <h1 className="font-inter text-[13px] font-bold text-[var(--text)]">Page title</h1>
  </header>
</section>
```

- [ ] **Step 4: Repaint web cards, tables, forms, and dash preview.**

Use cards:

```tsx
<div className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]" />
```

Use primary buttons:

```tsx
<button className="h-[25px] rounded-control border border-[var(--orange)] bg-[var(--orange)] px-[14px] py-[6px] font-inter text-[13px] font-bold text-[#141414]" />
```

Use numeric values:

```tsx
<span className="font-saira tabular-nums text-[var(--orange)]" />
```

- [ ] **Step 5: Run checks and commit.**

Run:

```powershell
pnpm dlx tsx web\app\webRoutesFigma.test.ts
pnpm --filter @sprint/web type-check
pnpm --filter @sprint/web build
```

Commit:

```powershell
git add web\app
git diff --cached --name-only
git commit -m "feat: migrate web routes to figma theme"
```

Expected: checks and commit succeed.

## Task 10: Final Desktop And Web Visual Verification

**Files:**
- Modify only focused fix files if verification fails.

- [ ] **Step 1: Run full relevant checks.**

Run:

```powershell
pnpm --filter @sprint/ui build
pnpm --filter @sprint/desktop type-check
pnpm --filter @sprint/desktop build
pnpm --filter @sprint/web type-check
pnpm --filter @sprint/web build
```

Expected: all exit 0.

- [ ] **Step 2: Run final source drift scan.**

Run:

```powershell
Select-String -Path app\frontend\src\**,packages\ui\src\**,packages\tokens\**,web\** -Pattern 'JetBrains|#33D27E|#FF4D63|#ff906c|#5af8fb|backdrop-blur|shadow-lg|glass|cyan|purple' -CaseSensitive:$false
```

Expected: matches are either removed, compatibility-only aliases, old unused files outside visible routes, or explicitly documented exceptions. Any visible UI match must be fixed.

- [ ] **Step 3: Verify desktop visually.**

Run:

```powershell
cd app
wails dev
```

Open `http://localhost:5173/`.

Expected:
- Desktop shell, Dash Editor, Dashboard, Devices, Settings, Help match `docs/DESIGN.md` metrics.
- No legacy titlebar controls except min/max/close.
- No Home or Controls route in primary shell.
- Wails update/settings/device flows remain callable.

- [ ] **Step 4: Verify web visually.**

Run:

```powershell
make dev-web
```

Open `http://localhost:3000/`.

Expected:
- Web uses shared Figma tokens and nav metrics.
- Web does not include desktop titlebar/window chrome.
- All routes use panel/card/button/numeric Figma styling.

- [ ] **Step 5: Commit verification fixes if any.**

If fixes were made:

```powershell
git add <focused-files>
git diff --cached --name-only
git commit -m "fix: resolve figma verification issues"
```

Expected: no empty commit if no fixes were needed.

## Task 11: Final Handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-06-10-figma-takeover-remaining-implementation.md`

- [ ] **Step 1: Mark plan tasks complete.**

Update each completed checkbox in this plan.

- [ ] **Step 2: Capture final evidence.**

Record the final successful commands in the final response:

```text
pnpm --filter @sprint/ui build
pnpm --filter @sprint/desktop type-check
pnpm --filter @sprint/desktop build
pnpm --filter @sprint/web type-check
pnpm --filter @sprint/web build
```

- [ ] **Step 3: Summarize residual risks.**

If Go files remain dirty from unrelated work, state they were not part of the Figma UI migration unless touched by this plan.

