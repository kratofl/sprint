# Apple Graphite Desktop Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Wails desktop app UI and shared `@sprint/ui`/`@sprint/tokens` primitives to match the approved Figma Components and Layout direction.

**Architecture:** Tokens own the visual language, shared UI owns reusable controls and shell primitives, and `app/frontend` composes runtime views without local reusable chrome. The top-level desktop IA becomes Home, Devices group with Devices and Dashboards, plus Settings and Help; Home contains Live, Engineer, and Setup as local views.

**Tech Stack:** React 19, Vite, TypeScript, Wails, Tailwind v4 tokens, `@sprint/ui`, `@sprint/tokens`, Node built-in test runner, `tsx --test`, PowerShell commands.

---

## File Structure

Modify:
- `packages/tokens/globals.css`: token CSS variables, global typography, token-backed utility classes.
- `packages/tokens/src/tokenHierarchy.test.ts`: enforce Apple/Graphite token anchors and no app layout classes in tokens.
- `packages/ui/src/components/primitives/controlClasses.ts`: shared button/card state classes.
- `packages/ui/src/components/primitives/Button.tsx`: Apple-style button sizing and focus rules.
- `packages/ui/src/components/primitives/IconButton.tsx`: icon-only button sizing and tooltip title behavior.
- `packages/ui/src/components/primitives/input.tsx`: compact rounded search/text field style.
- `packages/ui/src/components/primitives/SegmentedControl.tsx`: add `variant` support for accent segmented controls and neutral tab controls.
- `packages/ui/src/components/primitives/switch.tsx`: iOS-style switch dimensions and states.
- `packages/ui/src/components/primitives/Badge.tsx`: chip/badge color parity.
- `packages/ui/src/components/primitives/primitiveContract.test.ts`: source contract for shared controls.
- `packages/ui/src/components/organisms/AppShell.tsx`: desktop frame dimensions and surface stack.
- `packages/ui/src/components/organisms/NavRail.tsx`: optional section labels and grouped sidebar rows.
- `packages/ui/src/components/organisms/Titlebar.tsx`: reference titlebar density.
- `packages/ui/src/components/organisms/BodyTray.tsx`: inset page frame.
- `packages/ui/src/components/organisms/shellOrganisms.test.ts`: shell source contract.
- `app/frontend/src/lib/appShell.ts`: top-level view model.
- `app/frontend/src/lib/appShell.test.ts`: IA and history tests.
- `app/frontend/src/App.tsx`: sidebar IA, route mapping, titlebar labels.
- `app/frontend/src/views/Home.tsx`: Home hub with Live, Engineer, Setup segmented views.
- `app/frontend/src/views/Telemetry.tsx`: imported by Home hub, page header removed or kept local.
- `app/frontend/src/views/Controls.tsx`: imported by Home hub, page header removed or kept compact.
- `app/frontend/src/views/DashEditor.tsx`: user-facing page name becomes Dashboards.
- `app/frontend/src/components/DashList.tsx`: Dashboards list copy and controls.
- `app/frontend/src/components/DashEditMode.tsx`: reference editor shell with left rail, center stage, right properties.
- `app/frontend/src/components/dash-editor/WidgetPalette.tsx`: reference widget search and tile sizing.
- `app/frontend/src/components/PageTabs.tsx`: page controls for the left rail.
- `app/frontend/src/styles/graphite-layout.css`: desktop and editor layout classes.
- `app/frontend/src/views/pageLayoutsSource.test.ts`: app layout source assertions.
- `app/frontend/src/views/appHandoffSource.test.ts`: no legacy visual drift assertions.
- `app/frontend/src/components/dash-editor/dashEditorSidebarChrome.test.ts`: editor rail contract.
- `app/frontend/src/components/dash-editor/dashCanvasChrome.test.ts`: canvas chrome contract.
- `app/frontend/src/components/editorSharedControlsSource.test.ts`: editor shared-control contract.

Create:
- `app/frontend/src/views/Engineer.tsx`: current Engineer workflow moved out of `Home.tsx`.

Do not modify:
- `web/`.
- Backend dashboard/runtime code unless a frontend type requires a generated binding update.

---

### Task 1: Lock Apple/Graphite Tokens And Shared Primitive Visual Contracts

**Files:**
- Modify: `packages/tokens/globals.css`
- Modify: `packages/tokens/src/tokenHierarchy.test.ts`
- Modify: `packages/ui/src/components/primitives/controlClasses.ts`
- Modify: `packages/ui/src/components/primitives/Button.tsx`
- Modify: `packages/ui/src/components/primitives/IconButton.tsx`
- Modify: `packages/ui/src/components/primitives/input.tsx`
- Modify: `packages/ui/src/components/primitives/SegmentedControl.tsx`
- Modify: `packages/ui/src/components/primitives/switch.tsx`
- Modify: `packages/ui/src/components/primitives/Badge.tsx`
- Modify: `packages/ui/src/components/primitives/primitiveContract.test.ts`

- [ ] **Step 1: Write the primitive contract additions**

Add these assertions to `packages/ui/src/components/primitives/primitiveContract.test.ts`:

```ts
test('controls match the Apple Graphite reference scale and natural text casing', () => {
  const buttonSource = sourceFor('Button.tsx')
  const controlClassSource = sourceFor('controlClasses.ts')
  const inputSource = sourceFor('input.tsx')
  const switchSource = sourceFor('switch.tsx')
  const segmentedSource = sourceFor('SegmentedControl.tsx')

  assert.match(buttonSource, /normal-case/)
  assert.match(buttonSource, /tracking-\[0\]/)
  assert.doesNotMatch(buttonSource, /uppercase/)
  assert.doesNotMatch(controlClassSource, /uppercase/)
  assert.match(controlClassSource, /bg-\[var\(--accent\)\] text-\[#050505\]/)
  assert.match(controlClassSource, /bg-\[var\(--panel2\)\] text-\[var\(--text\)\]/)
  assert.match(inputSource, /rounded-\[999px\]/)
  assert.match(inputSource, /focus:border-\[var\(--accent\)\]/)
  assert.match(switchSource, /data-\[size=default\]:h-\[30px\]/)
  assert.match(switchSource, /data-\[size=default\]:w-\[52px\]/)
  assert.match(switchSource, /data-\[state=checked\]:bg-\[var\(--green\)\]/)
  assert.match(segmentedSource, /variant\?:\s*"accent"\s*\|\s*"neutral"/)
  assert.match(segmentedSource, /data-variant=\{variant\}/)
  assert.match(segmentedSource, /data-\[variant=accent\]:/)
  assert.match(segmentedSource, /data-\[variant=neutral\]:/)
})
```

- [ ] **Step 2: Run the shared UI primitive test and verify it fails**

Run:

```powershell
pnpm --filter @sprint/ui test -- src/components/primitives/primitiveContract.test.ts
```

Expected: FAIL because `Button.tsx`, `controlClasses.ts`, `input.tsx`, `switch.tsx`, and `SegmentedControl.tsx` still expose old uppercase/tiny-control contracts.

- [ ] **Step 3: Update control class constants**

Replace the exports in `packages/ui/src/components/primitives/controlClasses.ts` with:

```ts
export const buttonPrimaryClassName =
  "border-[var(--accent)] bg-[var(--accent)] text-[#050505] hover:border-[var(--accent)] hover:bg-[var(--accent)]"

export const buttonNeutralClassName =
  "border-[var(--line)] bg-[var(--panel2)] text-[var(--text)] hover:border-[var(--line2)] hover:bg-[var(--panel3)] hover:text-[var(--text)]"

export const buttonSecondaryClassName =
  "border-[var(--line)] bg-[var(--panel2)] text-[var(--text2)] hover:border-[var(--line2)] hover:bg-[var(--panel3)] hover:text-[var(--text)]"

export const buttonGhostClassName =
  "border-transparent text-[var(--text2)] hover:border-[var(--line)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"

export const buttonDestructiveClassName =
  "border-[var(--red)] bg-[var(--red)] text-[#050505] hover:border-[var(--red)] hover:bg-[var(--red)] hover:text-[#050505]"

export const buttonActiveClassName =
  "border-[var(--accent)] bg-[var(--panel3)] text-[var(--accent)] hover:bg-[var(--panel3)]"

export const cardDefaultClassName = "border-[var(--line)] bg-[var(--panel)] shadow-none"
export const cardAccentClassName = "border-[var(--accent)] bg-[var(--panel)]"
export const cardSecondaryClassName = "border-[var(--line)] bg-[var(--panel2)] shadow-none"
export const cardElevatedClassName = "border-[var(--line)] bg-[var(--panel)] shadow-none"
export const cardDestructiveClassName = "border-[var(--red)] bg-[var(--red-soft)]"
```

- [ ] **Step 4: Update Button sizing and casing**

In `packages/ui/src/components/primitives/Button.tsx`, keep the imports and component body, then replace the `buttonVariants` base and `size` strings with:

```ts
const buttonVariants = cva(
  "btn group/button ui-control inline-flex shrink-0 items-center justify-center border bg-transparent bg-clip-padding whitespace-nowrap text-[13px] font-semibold tracking-[0] normal-case transition-colors outline-none select-none focus-visible:border-[var(--accent)] focus-visible:ring-0 focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-30 aria-invalid:border-[var(--red)] aria-invalid:ring-0 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: buttonPrimaryClassName,
        primary: buttonPrimaryClassName,
        outline: buttonNeutralClassName,
        neutral: buttonNeutralClassName,
        secondary: buttonSecondaryClassName,
        ghost: cn("ghost", buttonGhostClassName),
        destructive: cn("danger", buttonDestructiveClassName),
        active: buttonActiveClassName,
        link: "border-transparent text-[var(--text2)] underline-offset-4 hover:text-[var(--accent)] hover:underline",
      },
      size: {
        default: "h-[36px] gap-1.5 rounded-[999px] px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4 [&_svg:not([class*='size-'])]:size-[15px]",
        xs: "h-[24px] gap-1 rounded-[999px] px-2 text-[11px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[30px] gap-1 rounded-[999px] px-3 text-[12px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-[14px]",
        lg: "h-[40px] gap-1.5 rounded-[999px] px-6 text-[14px] has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-[36px] rounded-full p-0 [&_svg:not([class*='size-'])]:size-[16px]",
        "icon-xs": "size-6 rounded-full p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-[30px] rounded-full p-0 [&_svg:not([class*='size-'])]:size-[14px]",
        "icon-lg": "size-[40px] rounded-full p-0 [&_svg:not([class*='size-'])]:size-[17px]",
      },
    },
    compoundVariants: [
      {
        variant: "link",
        className: "h-auto px-0 py-0",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

- [ ] **Step 5: Update Input and Switch to the reference scale**

Replace the class string in `packages/ui/src/components/primitives/input.tsx` with:

```ts
"h-[36px] w-full min-w-0 rounded-[999px] border border-[var(--line)] bg-[var(--panel2)] px-4 text-[13px] font-normal tracking-[0] text-[var(--text)] transition-colors outline-none"
```

Keep the existing placeholder, hover, file, readout, status, disabled, and invalid class segments, but change the focus segment to:

```ts
"focus:border-[var(--accent)] focus:text-[var(--text)] focus:ring-0 focus:outline-none"
```

In `packages/ui/src/components/primitives/switch.tsx`, replace the root class segments with:

```ts
"group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none"
"focus-visible:border-[var(--accent)] focus-visible:ring-0"
"data-[state=checked]:bg-[var(--green)] data-[state=unchecked]:bg-[var(--panel2)]"
"data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45"
"data-[size=default]:h-[30px] data-[size=default]:w-[52px]"
"data-[size=sm]:h-[24px] data-[size=sm]:w-[42px]"
```

Replace the thumb class segments with:

```ts
"pointer-events-none block rounded-full bg-[#f5f5f5] ring-0 transition-transform"
"data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-[2px]"
"group-data-[size=default]/switch:size-[26px]"
"group-data-[size=sm]/switch:size-5"
```

- [ ] **Step 6: Add accent/neutral variants to SegmentedControl**

In `packages/ui/src/components/primitives/SegmentedControl.tsx`, change the prop type to include:

```ts
variant?: "accent" | "neutral"
```

Set the default in the function signature:

```ts
variant = "accent",
```

Add `data-variant={variant}` to the root element. Replace the root classes with:

```ts
"inline-flex items-center gap-1 rounded-[999px] border border-[var(--line)] bg-[var(--panel2)] p-1"
```

Replace the button classes with:

```ts
"inline-flex h-[28px] min-w-[96px] items-center justify-center rounded-[999px] border border-transparent px-4 text-[13px] font-semibold tracking-[0] text-[var(--text2)] transition-colors outline-none"
"hover:bg-[var(--panel3)] hover:text-[var(--text)]"
"focus-visible:border-[var(--accent)] focus-visible:outline-none"
"data-[selected=true]:text-[var(--text)]"
"data-[variant=accent]:data-[selected=true]:border-[var(--accent)] data-[variant=accent]:data-[selected=true]:bg-[var(--accent)] data-[variant=accent]:data-[selected=true]:text-[#050505]"
"data-[variant=neutral]:data-[selected=true]:border-[var(--line2)] data-[variant=neutral]:data-[selected=true]:bg-[var(--panel3)] data-[variant=neutral]:data-[selected=true]:text-[var(--text)]"
"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
```

Pass the variant to each button with `data-variant={variant}`.

- [ ] **Step 7: Run token and UI checks**

Run:

```powershell
pnpm --filter @sprint/tokens test
pnpm --filter @sprint/ui test
pnpm --filter @sprint/ui type-check
```

Expected: PASS. If `Button.tsx` still matches `uppercase`, remove the uppercase text-transform from the button base or inherited `ui-control` usage.

- [ ] **Step 8: Commit Task 1**

```powershell
git add packages/tokens/globals.css packages/tokens/src/tokenHierarchy.test.ts packages/ui/src/components/primitives/controlClasses.ts packages/ui/src/components/primitives/Button.tsx packages/ui/src/components/primitives/IconButton.tsx packages/ui/src/components/primitives/input.tsx packages/ui/src/components/primitives/SegmentedControl.tsx packages/ui/src/components/primitives/switch.tsx packages/ui/src/components/primitives/Badge.tsx packages/ui/src/components/primitives/primitiveContract.test.ts
git commit -m "feat: align shared controls with apple graphite reference"
```

---

### Task 2: Rebuild Desktop IA And Shell Navigation

**Files:**
- Modify: `app/frontend/src/lib/appShell.ts`
- Modify: `app/frontend/src/lib/appShell.test.ts`
- Modify: `app/frontend/src/App.tsx`
- Modify: `packages/ui/src/components/organisms/NavRail.tsx`
- Modify: `packages/ui/src/components/organisms/shellOrganisms.test.ts`

- [ ] **Step 1: Update failing IA tests**

Replace the last test in `app/frontend/src/lib/appShell.test.ts` with:

```ts
test('default landing and primary nav ids follow the combined reference IA', () => {
  assert.equal(createViewHistory().current, 'home')
  assert.deepEqual(primaryNavIds, ['home', 'devices', 'dashboards', 'settings', 'help'] satisfies AppView[])
})
```

Update other tests in the same file so they use valid views:

```ts
const dash = createViewHistory('dashboards')
const afterDevices = navigateToView(dash, 'devices')
const afterHome = navigateToView(afterDevices, 'home')
const rewound = goBack(afterHome)
const branched = navigateToView(rewound, 'settings')
assert.deepEqual(branched.stack, ['dashboards', 'devices', 'settings'] satisfies AppView[])
```

Also change duplicate view test inputs from `'dashes'` to `'dashboards'`.

- [ ] **Step 2: Run app shell tests and verify they fail**

Run:

```powershell
node --test app/frontend/src/lib/appShell.test.ts
```

Expected: FAIL because `AppView` still contains the old route ids and defaults to `live`.

- [ ] **Step 3: Replace the app view model**

Replace `app/frontend/src/lib/appShell.ts` with:

```ts
export type AppView =
  | 'home'
  | 'devices'
  | 'dashboards'
  | 'settings'
  | 'help'

export const primaryNavIds = ['home', 'devices', 'dashboards', 'settings', 'help'] as const satisfies AppView[]

export interface ViewHistory {
  stack: AppView[]
  index: number
  current: AppView
  canGoBack: boolean
  canGoForward: boolean
}

function toHistory(stack: AppView[], index: number): ViewHistory {
  return {
    stack,
    index,
    current: stack[index],
    canGoBack: index > 0,
    canGoForward: index < stack.length - 1,
  }
}

export function createViewHistory(initialView: AppView = 'home'): ViewHistory {
  return toHistory([initialView], 0)
}

export function navigateToView(history: ViewHistory, nextView: AppView): ViewHistory {
  if (history.current === nextView) {
    return history
  }

  const truncatedStack = history.stack.slice(0, history.index + 1)
  truncatedStack.push(nextView)
  return toHistory(truncatedStack, truncatedStack.length - 1)
}

export function goBack(history: ViewHistory): ViewHistory {
  if (!history.canGoBack) {
    return history
  }

  return toHistory(history.stack, history.index - 1)
}

export function goForward(history: ViewHistory): ViewHistory {
  if (!history.canGoForward) {
    return history
  }

  return toHistory(history.stack, history.index + 1)
}
```

- [ ] **Step 4: Allow NavRail sections without visible labels**

Change `NavRailSection` in `packages/ui/src/components/organisms/NavRail.tsx`:

```ts
export interface NavRailSection {
  label?: string
  items: NavRailItem[]
  pinned?: "top" | "bottom"
}
```

Change `renderSection` to use a stable key:

```ts
const sectionKey = section.label ?? section.items.map((item) => item.id).join("|")
```

Then render the section label only when present:

```tsx
{section.label && (
  <div
    className={cn(
      "px-[8px] text-[8.5px] font-bold uppercase tracking-[0.22em] text-[var(--text3)]",
      collapsed && "mx-[8px] h-px overflow-hidden rounded-[1px] bg-[var(--panel2)] px-0 text-[0px] leading-none",
    )}
  >
    {section.label}
  </div>
)}
```

- [ ] **Step 5: Update shell organism tests**

Add to `packages/ui/src/components/organisms/shellOrganisms.test.ts`:

```ts
test('nav rail supports unlabeled top groups and labeled device groups', () => {
  assert.match(navRailSource, /label\?:\s*string/)
  assert.match(navRailSource, /section\.label &&/)
  assert.match(navRailSource, /section\.label \?\? section\.items\.map/)
})
```

- [ ] **Step 6: Update App sidebar sections and route rendering**

In `app/frontend/src/App.tsx`, change imports:

```ts
import Home from '@/views/Home'
import DashEditor, { type DashEditorHandle } from '@/views/DashEditor'
import Devices from '@/views/Devices'
```

Remove direct imports of `Telemetry` and `Controls`.

Replace `NAV_SECTIONS` with:

```ts
const NAV_SECTIONS: NavRailSection[] = [
  {
    items: [
      { id: 'home', label: 'Home', icon: IconGauge },
    ],
  },
  {
    label: 'Devices',
    items: [
      { id: 'devices', label: 'Devices', icon: IconUsb },
      { id: 'dashboards', label: 'Dashboards', icon: IconLayoutDashboard },
    ],
  },
  {
    pinned: 'bottom',
    items: [
      { id: 'settings', label: 'Settings', icon: IconSettings },
      { id: 'help', label: 'Help', icon: IconHelp },
    ],
  },
]
```

Change the dirty leave guard from:

```ts
if (view === 'dashes' && dashEditorRef.current?.isDirty) {
```

to:

```ts
if (view === 'dashboards' && dashEditorRef.current?.isDirty) {
```

Replace the `BodyTray` route block with:

```tsx
<BodyTray>
  {view === 'home' && <Home frame={frame} connected={connected} fps={fps} />}
  {view === 'devices' && <Devices />}
  {view === 'dashboards' && <DashEditor ref={dashEditorRef} />}
  {view === 'settings' && <Settings />}
  {view === 'help' && <Help />}
</BodyTray>
```

- [ ] **Step 7: Run IA and shell tests**

Run:

```powershell
node --test app/frontend/src/lib/appShell.test.ts
pnpm --filter @sprint/ui test -- src/components/organisms/shellOrganisms.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```powershell
git add app/frontend/src/lib/appShell.ts app/frontend/src/lib/appShell.test.ts app/frontend/src/App.tsx packages/ui/src/components/organisms/NavRail.tsx packages/ui/src/components/organisms/shellOrganisms.test.ts
git commit -m "feat: combine desktop navigation into reference shell"
```

---

### Task 3: Build Home Hub For Live, Engineer, And Setup

**Files:**
- Create: `app/frontend/src/views/Engineer.tsx`
- Modify: `app/frontend/src/views/Home.tsx`
- Modify: `app/frontend/src/views/Telemetry.tsx`
- Modify: `app/frontend/src/views/Controls.tsx`
- Modify: `app/frontend/src/views/pageLayoutsSource.test.ts`
- Modify: `app/frontend/src/views/appHandoffSource.test.ts`

- [ ] **Step 1: Add Home hub source assertions**

Add to `app/frontend/src/views/pageLayoutsSource.test.ts`:

```ts
const homeSource = read('./Home.tsx')
const engineerSource = read('./Engineer.tsx')
const telemetrySource = read('./Telemetry.tsx')
const controlsSource = read('./Controls.tsx')

test('Home combines Live, Engineer, and Setup as local Apple-style views', () => {
  assert.match(homeSource, /type HomeSection = 'live' \| 'engineer' \| 'setup'/)
  assert.match(homeSource, /SegmentedControl/)
  assert.match(homeSource, /variant="neutral"/)
  assert.match(homeSource, /<Telemetry frame=\{frame\} connected=\{connected\} fps=\{fps\}/)
  assert.match(homeSource, /<Engineer connected=\{connected\}/)
  assert.match(homeSource, /<Controls compact/)
  assert.doesNotMatch(homeSource, /onNavigate/)
  assert.match(engineerSource, /export default function Engineer/)
  assert.doesNotMatch(engineerSource, /export default function Home/)
})
```

- [ ] **Step 2: Run the Home layout test and verify it fails**

Run:

```powershell
node --test app/frontend/src/views/pageLayoutsSource.test.ts
```

Expected: FAIL because `Engineer.tsx` does not exist and `Home.tsx` is still the old Engineer page.

- [ ] **Step 3: Create Engineer.tsx from the current Home workflow**

Copy the current contents of `app/frontend/src/views/Home.tsx` into `app/frontend/src/views/Engineer.tsx`, then make these exact edits in `Engineer.tsx`:

```ts
interface EngineerProps {
  connected: boolean
}
```

Replace:

```ts
export default function Home({ connected, onNavigate }: HomeProps) {
  void onNavigate
```

with:

```ts
export default function Engineer({ connected }: EngineerProps) {
```

Remove the `NavigableView` type and `HomeProps` interface from `Engineer.tsx`.

- [ ] **Step 4: Replace Home.tsx with the hub**

Replace `app/frontend/src/views/Home.tsx` with:

```tsx
import { useState } from 'react'
import { SegmentedControl } from '@sprint/ui'
import type { TelemetryFrame } from '@sprint/types'
import Telemetry from './Telemetry'
import Engineer from './Engineer'
import Controls from './Controls'

export interface HomeProps {
  frame: TelemetryFrame | null
  connected: boolean
  fps: number
}

type HomeSection = 'live' | 'engineer' | 'setup'

const HOME_SECTIONS = [
  { value: 'live', label: 'Live' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'setup', label: 'Setup' },
] as const

export default function Home({ frame, connected, fps }: HomeProps) {
  const [section, setSection] = useState<HomeSection>('live')

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-[44px] shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4">
        <div className="min-w-0">
          <h1 className="truncate text-[14px] font-semibold text-[var(--text)]">Home</h1>
        </div>
        <SegmentedControl
          label="Home view"
          value={section}
          variant="neutral"
          options={HOME_SECTIONS}
          onChange={(value) => setSection(value as HomeSection)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-4">
        {section === 'live' && <Telemetry frame={frame} connected={connected} fps={fps} compact />}
        {section === 'engineer' && <Engineer connected={connected} />}
        {section === 'setup' && <Controls compact />}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Add compact props to Telemetry and Controls**

In `app/frontend/src/views/Telemetry.tsx`, update props:

```ts
export interface TelemetryProps {
  frame: TelemetryFrame | null
  connected: boolean
  fps: number
  compact?: boolean
}
```

Change the function signature:

```ts
export default function Telemetry({ frame, connected, fps, compact = false }: TelemetryProps) {
```

Keep current markup, but remove top-level `PageHeader` usage if one is added during implementation. If no header exists, keep the body unchanged. Add `data-compact={compact}` to the top-level wrapper.

In `app/frontend/src/views/Controls.tsx`, update:

```ts
export interface ControlsProps {
  compact?: boolean
}

export default function Controls({ compact = false }: ControlsProps) {
```

Add `data-compact={compact}` to the top-level wrapper. Keep existing state logic unchanged.

- [ ] **Step 6: Update app handoff source list**

In `app/frontend/src/views/appHandoffSource.test.ts`, add `'./Engineer.tsx'` to `sourceFiles`.

Update the page-header assertion to exclude `Home.tsx` because Home now owns local segmented navigation:

```ts
for (const path of ['./Controls.tsx', './Devices.tsx', './Help.tsx', './Settings.tsx']) {
```

- [ ] **Step 7: Run focused Home tests**

Run:

```powershell
node --test app/frontend/src/views/pageLayoutsSource.test.ts
node --test app/frontend/src/views/appHandoffSource.test.ts
pnpm --filter @sprint/desktop type-check
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```powershell
git add app/frontend/src/views/Home.tsx app/frontend/src/views/Engineer.tsx app/frontend/src/views/Telemetry.tsx app/frontend/src/views/Controls.tsx app/frontend/src/views/pageLayoutsSource.test.ts app/frontend/src/views/appHandoffSource.test.ts
git commit -m "feat: combine live engineer setup into home hub"
```

---

### Task 4: Rename Dashes To Dashboards In Navigation And Page Copy

**Files:**
- Modify: `app/frontend/src/views/DashEditor.tsx`
- Modify: `app/frontend/src/components/DashList.tsx`
- Modify: `app/frontend/src/components/DashEditMode.tsx`
- Modify: `app/frontend/src/views/pageLayoutsSource.test.ts`
- Modify: `app/frontend/src/views/appHandoffSource.test.ts`

- [ ] **Step 1: Add source assertions for Dashboards naming**

Add to `app/frontend/src/views/pageLayoutsSource.test.ts`:

```ts
test('Dashboards is the user-facing name for the dash editor area', () => {
  const dashEditorSource = read('./DashEditor.tsx')

  assert.match(dashEditorSource, /heading="Dashboards"/)
  assert.match(dashListSource, /Dashboards/)
  assert.doesNotMatch(dashListSource, /Dash Studio/)
  assert.doesNotMatch(dashListSource, />Dashes</)
  assert.match(dashEditModeSource, />Dashboards</)
})
```

- [ ] **Step 2: Run layout source tests and verify they fail**

Run:

```powershell
node --test app/frontend/src/views/pageLayoutsSource.test.ts
```

Expected: FAIL because the page still uses `Dash Studio` or `Dashes` in user-facing copy.

- [ ] **Step 3: Update DashEditor runtime notice page header**

In `app/frontend/src/views/DashEditor.tsx`, change:

```tsx
heading="Dash Studio"
```

to:

```tsx
heading="Dashboards"
```

Change the runtime caption to:

```tsx
caption="Use the real Wails desktop window for dashboard creation, live preview, and agent-driven UI inspection."
```

- [ ] **Step 4: Update DashList copy**

In `app/frontend/src/components/DashList.tsx`, change user-facing page heading labels to `Dashboards`. Use `Create dashboard`, `Edit dashboard`, `Duplicate dashboard`, and `Delete dashboard` for actions. Keep internal layout IDs and DTO field names unchanged.

- [ ] **Step 5: Update editor back control**

In `app/frontend/src/components/DashEditMode.tsx`, replace the back button text:

```tsx
<span>Dashes</span>
```

with:

```tsx
<span>Dashboards</span>
```

- [ ] **Step 6: Run focused tests**

Run:

```powershell
node --test app/frontend/src/views/pageLayoutsSource.test.ts
pnpm --filter @sprint/desktop type-check
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```powershell
git add app/frontend/src/views/DashEditor.tsx app/frontend/src/components/DashList.tsx app/frontend/src/components/DashEditMode.tsx app/frontend/src/views/pageLayoutsSource.test.ts app/frontend/src/views/appHandoffSource.test.ts
git commit -m "feat: rename dash editor area to dashboards"
```

---

### Task 5: Rebuild Dashboards Editor Around Left Rail, Canvas Stage, And Properties Rail

**Files:**
- Modify: `app/frontend/src/components/DashEditMode.tsx`
- Modify: `app/frontend/src/components/dash-editor/WidgetPalette.tsx`
- Modify: `app/frontend/src/components/PageTabs.tsx`
- Modify: `app/frontend/src/styles/graphite-layout.css`
- Modify: `app/frontend/src/components/dash-editor/dashEditorSidebarChrome.test.ts`
- Modify: `app/frontend/src/components/dash-editor/dashCanvasChrome.test.ts`
- Modify: `app/frontend/src/components/editorSharedControlsSource.test.ts`

- [ ] **Step 1: Update editor chrome source tests**

In `app/frontend/src/components/dash-editor/dashEditorSidebarChrome.test.ts`, add:

```ts
test('dash editor uses the reference left rail and properties rail model', () => {
  assert.match(dashEditModeSource, /type EditorLeftRailView = 'pages' \| 'widgets'/)
  assert.match(dashEditModeSource, /const \[leftRailView, setLeftRailView\] = useState<EditorLeftRailView>\('widgets'\)/)
  assert.match(dashEditModeSource, /<EditorLeftRail/)
  assert.match(dashEditModeSource, /<EditorPropertiesRail/)
  assert.match(dashEditModeSource, /Pages/)
  assert.match(dashEditModeSource, /Widgets/)
  assert.doesNotMatch(dashEditModeSource, /title="WIDGETS"/)
  assert.doesNotMatch(dashEditModeSource, /title=\{inspectorState\.title\}/)
})
```

In `app/frontend/src/components/dash-editor/dashCanvasChrome.test.ts`, add:

```ts
test('dash editor canvas stage matches the reference rounded black board', () => {
  assert.match(dashEditModeSource, /\bds-reference-canvas\b/)
  assert.match(dashEditModeSource, /data-scale=/)
  assert.match(dashEditModeSource, /Scale/)
  assert.match(dashEditModeSource, /100%/)
  assert.match(dashCanvasSource, /showGrid\?: boolean/)
})
```

- [ ] **Step 2: Run editor tests and verify they fail**

Run:

```powershell
node --test app/frontend/src/components/dash-editor/dashEditorSidebarChrome.test.ts
node --test app/frontend/src/components/dash-editor/dashCanvasChrome.test.ts
```

Expected: FAIL because the editor still uses docked palette/sidebar state as the primary structure.

- [ ] **Step 3: Add editor layout CSS**

Replace the editor grid section in `app/frontend/src/styles/graphite-layout.css` with:

```css
.ds-editor {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
  color: var(--text);
}

.ds-etop {
  display: grid;
  min-height: 42px;
  flex-shrink: 0;
  grid-template-columns: minmax(260px, 1fr) auto minmax(260px, 1fr);
  align-items: center;
  gap: 10px;
  overflow: hidden;
}

.ds-ework {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  grid-template-columns: 288px minmax(0, 1fr) 280px;
  gap: 10px;
  overflow: hidden;
}

.ds-col {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line2);
  border-radius: calc(var(--r) + 2px);
  background: var(--panel);
}

.ds-col-bd {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 14px;
}

.ds-canvas-wrap {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: var(--bg);
}

.ds-canvas-stage {
  display: grid;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  place-items: start center;
  overflow: auto;
  background: var(--bg);
  padding: 0 24px 24px;
}

.ds-reference-canvas {
  width: min(100%, 960px);
  aspect-ratio: 800 / 480;
  overflow: hidden;
  border: 1px solid var(--line2);
  border-radius: calc(var(--r) + 8px);
  background: #000;
}

@media (max-width: 1180px) {
  .ds-ework {
    grid-template-columns: minmax(220px, 288px) minmax(0, 1fr);
  }

  .ds-ework .ds-col[data-side="right"] {
    display: none;
  }
}
```

Preserve existing non-editor classes for Dashboards list, Devices, Settings, and Help.

- [ ] **Step 4: Add left rail state and scale state to DashEditMode**

Near the top of `DashEditMode`, add:

```ts
type EditorLeftRailView = 'pages' | 'widgets'
type EditorScale = '50' | '75' | '100' | '125'

const EDITOR_SCALE_OPTIONS = [
  { value: '50', label: '50%' },
  { value: '75', label: '75%' },
  { value: '100', label: '100%' },
  { value: '125', label: '125%' },
] as const
```

Inside the component, add:

```ts
const [leftRailView, setLeftRailView] = useState<EditorLeftRailView>('widgets')
const [editorScale, setEditorScale] = useState<EditorScale>('100')
```

- [ ] **Step 5: Replace docked palette/inspector layout with fixed reference rails**

Keep controller behavior and confirm dialogs. Replace the `ds-ework` rendering branch for `activeEditorView === 'layout'` with this structure:

```tsx
<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
  {controller.editorMode === 'stack' && controller.currentPage && controller.selectedWidgetStack && (
    <FocusModeHeader
      pageName={controller.currentPage.name}
      stackName={controller.selectedWidgetStack.name}
      compareEnabled={controller.compareEnabled}
      compareDisabled={(controller.selectedWidgetStack.layers.length ?? 0) < 2}
      onBack={controller.exitWidgetStackEditMode}
      onToggleCompare={controller.handleToggleCompare}
      onAddLayer={controller.handleAddLayer}
    />
  )}

  <div className="ds-ework" data-layout="reference">
    <EditorLeftRail
      view={leftRailView}
      onViewChange={setLeftRailView}
      pages={(
        <PageTabs
          embedded
          idlePage={controller.layout.idlePage}
          pages={controller.layout.pages}
          activeTab={controller.activeTab}
          livePageIndex={controller.livePageIndex}
          onSelectTab={controller.selectCanvasTab}
          onSelectAlerts={() => controller.selectCanvasTab('alerts')}
          onAddPage={controller.handleAddPage}
          onDeletePage={controller.handleDeletePage}
          onRenamePage={controller.handleRenamePage}
        />
      )}
      widgets={paletteContent}
    />

    <div className="ds-canvas-wrap">
      <div
        ref={controller.canvasPaneRef}
        className="ds-canvas-stage"
        data-scale={editorScale}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            controller.handleCanvasBackgroundClick()
          }
        }}
      >
        <div className="ds-reference-canvas">
          <DashCanvas
            widgets={controller.canvasWidgets}
            gridCols={controller.layout.gridCols}
            gridRows={controller.layout.gridRows}
            selectedId={controller.selectedId}
            catalog={controller.catalog}
            screenW={controller.screenW}
            screenH={controller.screenH}
            theme={controller.resolvedTheme}
            domainPalette={controller.resolvedDomainPalette}
            blockedAreas={[]}
            placementBounds={null}
            overlayRects={controller.overlayRects}
            overlayBlockedAreas={controller.overlayBlockedAreas}
            overlayEditMode={controller.editorMode === 'page'}
            previewUrl={controller.previewUrl ?? undefined}
            showGrid={showGrid}
            paletteDropType={controller.paletteDropType}
            paletteDropPreviewUrl={controller.paletteDropPreviewUrl}
            onSelect={controller.handleSelectWidget}
            onUpdate={controller.handleUpdateWidgets}
            onSelectOverlay={controller.handleSelectWidgetStack}
            onUpdateOverlay={controller.handleUpdateWidgetStacks}
            onOpenOverlay={controller.enterWidgetStackEditMode}
          />
        </div>
      </div>
    </div>

    <EditorPropertiesRail>
      {inspectorContent ?? (
        <div className="space-y-2">
          <h2 className="text-[13px] font-semibold text-[var(--text)]">Properties</h2>
          <p className="text-[12px] text-[var(--text3)]">Select a widget or page to edit its properties.</p>
        </div>
      )}
    </EditorPropertiesRail>
  </div>
</div>
```

Use existing controller handler names where they differ in the current file. If a handler name is different, use the current controller field that already feeds the existing `DashCanvas` call.

- [ ] **Step 6: Add EditorLeftRail and EditorPropertiesRail helpers**

Add these helpers near the bottom of `DashEditMode.tsx`:

```tsx
function EditorLeftRail({
  view,
  onViewChange,
  pages,
  widgets,
}: {
  view: EditorLeftRailView
  onViewChange: (view: EditorLeftRailView) => void
  pages: ReactNode
  widgets: ReactNode
}) {
  return (
    <aside className="ds-col" data-side="left">
      <div className="border-b border-[var(--line)] p-3">
        <SegmentedControl
          label="Editor left rail"
          value={view}
          variant="accent"
          options={[
            { value: 'pages', label: 'Pages' },
            { value: 'widgets', label: 'Widgets' },
          ]}
          onChange={(value) => onViewChange(value as EditorLeftRailView)}
          className="w-full justify-center"
        />
      </div>
      <div className="ds-col-bd">
        {view === 'pages' ? pages : widgets}
      </div>
    </aside>
  )
}

function EditorPropertiesRail({ children }: { children: ReactNode }) {
  return (
    <aside className="ds-col" data-side="right">
      <div className="ds-col-bd">
        {children}
      </div>
    </aside>
  )
}
```

- [ ] **Step 7: Move scale control into the top bar**

In the `ds-etop` top bar, place this between dash title/status and the `Layout / Alerts / Settings` segmented control:

```tsx
<div className="flex items-center justify-center gap-2">
  <span className="text-[10px] font-semibold uppercase text-[var(--text3)]">Scale</span>
  <SegmentedControl
    label="Editor scale"
    value={editorScale}
    variant="neutral"
    options={EDITOR_SCALE_OPTIONS}
    onChange={(value) => setEditorScale(value as EditorScale)}
  />
</div>
```

- [ ] **Step 8: Update WidgetPalette to match the Components reference**

In `app/frontend/src/components/dash-editor/WidgetPalette.tsx`, remove the leading local `Widgets` title because the rail segmented control supplies the context. Replace the search label with a pill Input row:

```tsx
<label className="flex flex-col gap-2">
  <span className="text-[12px] text-[var(--text3)]">Search</span>
  <div className="flex h-[36px] items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel2)] px-3 text-[var(--text3)] focus-within:border-[var(--accent)]">
    <Input
      type="search"
      value={query}
      onChange={event => setQuery(event.target.value)}
      placeholder=""
      aria-label="Search widgets"
      className="h-[32px] min-w-0 flex-1 border-0 bg-transparent px-0 focus:border-transparent"
    />
    <IconSearch size={15} aria-hidden="true" />
  </div>
</label>
```

Change tile class sizing to:

```ts
'group flex h-[54px] min-w-0 cursor-grab select-none flex-col items-start justify-center gap-1 p-3 active:cursor-grabbing'
```

- [ ] **Step 9: Run editor checks**

Run:

```powershell
node --test app/frontend/src/components/dash-editor/dashEditorSidebarChrome.test.ts
node --test app/frontend/src/components/dash-editor/dashCanvasChrome.test.ts
node --test app/frontend/src/components/editorSharedControlsSource.test.ts
pnpm --filter @sprint/desktop type-check
```

Expected: PASS. If type-check fails because a controller handler name differs, use the handler already present in the existing `DashCanvas` call and re-run the same command.

- [ ] **Step 10: Commit Task 5**

```powershell
git add app/frontend/src/components/DashEditMode.tsx app/frontend/src/components/dash-editor/WidgetPalette.tsx app/frontend/src/components/PageTabs.tsx app/frontend/src/styles/graphite-layout.css app/frontend/src/components/dash-editor/dashEditorSidebarChrome.test.ts app/frontend/src/components/dash-editor/dashCanvasChrome.test.ts app/frontend/src/components/editorSharedControlsSource.test.ts
git commit -m "feat: rebuild dashboards editor reference layout"
```

---

### Task 6: Pass Devices, Settings, Help, And Global Visual Drift Checks

**Files:**
- Modify: `app/frontend/src/views/Devices.tsx`
- Modify: `app/frontend/src/components/devices/DeviceSection.tsx`
- Modify: `app/frontend/src/components/devices/DeviceDetail.tsx`
- Modify: `app/frontend/src/components/devices/DeviceCommandRow.tsx`
- Modify: `app/frontend/src/components/devices/CatalogPanel.tsx`
- Modify: `app/frontend/src/views/Settings.tsx`
- Modify: `app/frontend/src/views/Help.tsx`
- Modify: `app/frontend/src/components/UpdateToast.tsx`
- Modify: `app/frontend/src/views/pageLayoutsSource.test.ts`
- Modify: `app/frontend/src/views/appHandoffSource.test.ts`

- [ ] **Step 1: Update source tests for forbidden legacy classes**

In `app/frontend/src/views/appHandoffSource.test.ts`, extend the forbidden regex in `desktop app surfaces avoid pre-Graphite glass and accent drift`:

```ts
/backdrop-blur|\bglass\b|font-display|font-inter|font-mono|font-saira|cyan|teal|purple|#5af8fb|#ff906c|bg-bg-surface|bg-bg-subtle|bg-bg-panel|text-foreground|text-text-/i
```

Keep exceptions only for hidden code blocks that show commands in runtime notices. If a runtime notice needs mono text, give its wrapper `aria-label` and use `font-sans` with smaller tabular text instead of `font-mono`.

- [ ] **Step 2: Run app handoff tests and verify they fail**

Run:

```powershell
node --test app/frontend/src/views/appHandoffSource.test.ts
```

Expected: FAIL while old aliases such as `font-inter`, `text-foreground`, `bg-bg-panel`, or `font-mono` remain.

- [ ] **Step 3: Replace legacy alias classes in app views**

Apply these replacements in `app/frontend/src/views` and `app/frontend/src/components`:

```text
font-inter -> font-sans
font-mono -> font-sans tabular-nums
text-foreground -> text-[var(--text)]
text-text-muted -> text-[var(--text2)]
bg-bg-panel -> bg-[var(--panel2)]
bg-bg-container -> bg-[var(--panel)]
border-border-input -> border-[var(--line)]
border-border -> border-[var(--line)]
text-primary -> text-[var(--accent)]
bg-primary-muted -> bg-[var(--orange-soft)]
border-primary -> border-[var(--accent)]
```

Do not replace dashboard preview typography inside `WidgetPreview.tsx` unless it affects app chrome; wheel-rendered typography is dashboard content, not desktop UI chrome.

- [ ] **Step 4: Normalize Devices page to the grouped IA**

In `app/frontend/src/views/Devices.tsx`, keep the page header but change the caption to:

```tsx
caption="Screens, wheels, and hardware bindings"
```

In device component headings, use natural case labels and shared controls. Replace uppercase command strings such as `LISTENING` with `Listening`, `BOUND` with `Bound`, and `MISSING` with `Missing` in visible app copy.

- [ ] **Step 5: Run page source and type checks**

Run:

```powershell
node --test app/frontend/src/views/appHandoffSource.test.ts
node --test app/frontend/src/views/pageLayoutsSource.test.ts
pnpm --filter @sprint/desktop type-check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```powershell
git add app/frontend/src/views/Devices.tsx app/frontend/src/components/devices/DeviceSection.tsx app/frontend/src/components/devices/DeviceDetail.tsx app/frontend/src/components/devices/DeviceCommandRow.tsx app/frontend/src/components/devices/CatalogPanel.tsx app/frontend/src/views/Settings.tsx app/frontend/src/views/Help.tsx app/frontend/src/components/UpdateToast.tsx app/frontend/src/views/pageLayoutsSource.test.ts app/frontend/src/views/appHandoffSource.test.ts
git commit -m "feat: clean desktop surfaces for apple graphite shell"
```

---

### Task 7: Final Build, Browser Inspection, And Fix Pass

**Files:**
- Modify only files from Tasks 1-6 if verification finds concrete issues.

- [ ] **Step 1: Run full relevant package checks**

Run:

```powershell
pnpm --filter @sprint/tokens test
pnpm --filter @sprint/ui test
pnpm --filter @sprint/ui type-check
pnpm --filter @sprint/desktop type-check
node --test app/frontend/src/lib/appShell.test.ts
node --test app/frontend/src/views/pageLayoutsSource.test.ts
node --test app/frontend/src/views/appHandoffSource.test.ts
node --test app/frontend/src/components/dash-editor/dashEditorSidebarChrome.test.ts
node --test app/frontend/src/components/dash-editor/dashCanvasChrome.test.ts
node --test app/frontend/src/components/editorSharedControlsSource.test.ts
```

Expected: PASS for every command.

- [ ] **Step 2: Build shared UI and desktop frontend**

Run:

```powershell
pnpm --filter @sprint/ui... build
pnpm --filter @sprint/desktop build
```

Expected: PASS and `app/frontend/dist` exists.

- [ ] **Step 3: Start the browser-safe desktop frontend**

Run:

```powershell
pnpm --filter @sprint/desktop dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL, usually `http://127.0.0.1:5173/`. Keep this process running for visual inspection.

- [ ] **Step 4: Inspect with Browser or Playwright**

Open the local URL and inspect:
- default Home loads with neutral `Live / Engineer / Setup` segmented control;
- sidebar shows `Home`, `Devices` group with `Devices` and `Dashboards`, footer `Settings` and `Help`;
- Dashboards list uses the new name;
- Dashboards editor shows left `Pages / Widgets` rail, center rounded black canvas, right Properties rail, top `Layout / Alerts / Settings` control;
- focus rings are visible on buttons, inputs, nav items, segmented controls, and window controls;
- no text overlaps in the titlebar, sidebar, editor top bar, or widget palette at desktop width around 1440px and narrow width around 1180px.

- [ ] **Step 5: Stop the dev server**

Stop the Vite process with `Ctrl+C` in its terminal after inspection.

- [ ] **Step 6: Final git status check**

Run:

```powershell
git status --short
```

Expected: only files touched by this plan are changed, plus pre-existing user changes that were already present before this work.

- [ ] **Step 7: Commit final fixes if Step 4 required changes**

If visual inspection required fix commits, stage only the concrete fix files. For example, if the fix changed `App.tsx` and `graphite-layout.css`, run:

```powershell
git add app/frontend/src/App.tsx app/frontend/src/styles/graphite-layout.css
git commit -m "fix: polish apple graphite desktop rebuild"
```

If no fix files changed, skip this commit.

---

## Self-Review

Spec coverage:
- Scope is limited to `app/`, `packages/ui`, and `packages/tokens`; `web/` is excluded.
- Sidebar IA covers Home, Devices group with Devices and Dashboards, Settings, and Help.
- Home combines Live, Engineer, and Setup as local views.
- Dashboards is the user-facing name for the former Dash Editor route.
- Dashboards editor matches the left rail, center canvas, and right properties reference.
- Shared controls and tokens are rebuilt before app composition.
- Verification includes token tests, shared UI tests/type-check, desktop type-check, source assertions, build, and browser inspection.

Placeholder scan:
- This plan contains no placeholder sections, no empty implementation sections, and no unresolved file names.

Type consistency:
- Top-level route id is `dashboards`; internal dashboard DTO/layout names remain unchanged.
- Home local view ids are `live`, `engineer`, and `setup`; these are local state values, not top-level `AppView` values.
- `SegmentedControl` uses `variant?: "accent" | "neutral"` consistently in tests and implementation steps.
