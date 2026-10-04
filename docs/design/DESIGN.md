# Sprint Design System

The authority for app UI. MUST = mandatory, NEVER = forbidden, SHOULD = default unless a documented
reason exists. The rendered wheel dash is not app UI; its rules are in
[`../internals/dash-rendering.md`](../internals/dash-rendering.md).

References in this folder: [`tokens.css`](tokens.css) / [`tokens.json`](tokens.json) (web values),
component previews in [`previews/`](previews/) (rendered from the original mockup; their German
sample copy is not Sprint's), and the mockups in [`mockups/`](mockups/) — `windows-light|dark.html`
for the desktop app on Windows (exact sizes in their inline styles, screenshots `win.png` /
`win-dark.png`), `macos-light|dark.html` for the desktop app on macOS (take the shell, materials and
geometry; their screens are a sample app, not Sprint), `web-light|dark.html` for the web app,
`web-sheet.html` for the sheet pattern, `components-web.html` for the web component sheet.
`mockups/bundle.html` is the original bundle the Windows and web pages were unpacked from;
`mockups/Dashboard Mockup.html` is the newer bundle the macOS pages came from (it also holds web, iOS
and Windows pages, and the macOS component sheet: buttons, cards, inline alerts). Where the mockups
are silent, the macOS look follows Apple's Human Interface Guidelines for macOS 27.

## Surfaces

| Surface | Look | Tokens | Type |
| --- | --- | --- | --- |
| Desktop app on Windows and Linux (`app/desktop`, Electron) | Windows Fluent: Mica window, 48px title bar, NavigationView pane, content layer, CommandBar, ContentDialog, acrylic flyouts and notifications. 4px controls, 8px cards and flyouts. | `@sprint/tokens/windows.css` | Segoe UI Variable (system font, nothing bundled), 13px/20px base |
| Desktop app on macOS (`app/desktop`, Electron) | macOS 27: full-height 224px source-list sidebar on vibrancy with the traffic lights in its top band, 52px toolbar in three zones that carries the page title and the page's actions, opaque content scrolling under the toolbar, glass menus, palette, notifications and dialogs. Borderless grey-filled 28px buttons with 8px corners, 14px cards with a hairline edge, 16px dialogs. | `@sprint/tokens/macos.css` over `windows.css` | SF (system font, nothing bundled), 13px/20px base |
| Web app (`web/`) | Web CI: Apple look, flat content, Liquid Glass only on toolbar, menus, toasts, notifications and dialogs. | `@sprint/tokens/web.css` | System stack |
| Wheel dash (`packages/dashboard`) | Hardware instrument with its own color domain. Not restyled with the app. | Dash palette in `packages/dashboard` | Saira Semi Condensed numerics, Inter labels |

- Only the brand and status colors carry across platforms. Component shapes are native to each
  platform. Never use Material Design patterns (FABs with elevation, ripple, filled text fields,
  app bars with shadows).
- The desktop app wears the look of the OS it runs on; views are shared, and only the shell and
  primitive shapes change. Mac shapes live in `app/desktop/src/styles.mac.css`, scoped to
  `[data-platform="mac"]`, so the Windows look is untouched by them.
- Every surface ships **light and dark**, following the OS (`prefers-color-scheme`, or
  `data-theme` on `<html>`).
- Desktop shell and shared primitives (`.button`, `.card`, `.infobar`, `.list-row`, `PageHeader`,
  `ContentDialog`, …) live in `app/desktop/src/styles.css` and `app/desktop/src/shell/`. Views use
  them instead of restyling their own.

## Visual foundations

### Flat first, glass on chrome

- Content is flat: cards (`surface` on `bg`), lists, tables, inputs, buttons, sidebar — no shadow, no gradients.
- **Glass only on:** context menus, the toolbar, alerts/notifications, toasts, popovers and dialogs.
  Web glass = `glass-bg` + `backdrop-filter: blur(var(--glass-blur)) saturate(180%)` +
  `1px solid var(--glass-border)` + `shadow-glass`. On Windows the equivalent is acrylic on flyouts
  and notifications, Mica on the window; on macOS, glass on menus, the palette, notifications and
  dialogs, vibrancy behind the sidebar only.
- **macOS scroll edge:** content scrolls under the toolbar. At rest the toolbar has no bar of its
  own and the content's colour shows through; once the content scrolls, a translucent blurred bar
  with a hairline fades in over the first 24px. With Reduce Transparency the bar is solid.
- The web **toolbar is one uniform frosted band** across the content area. Controls inside it sit
  on subtle fills, not on separate glass capsules.
- **Flat fallback:** with `prefers-reduced-transparency: reduce` or no `backdrop-filter` support,
  glass becomes `surface` + `1px solid var(--border)`, no blur, no shadow. It is a complete,
  supported option.
- **Buttons never glow.** No colored or outer shadows on buttons, ever.

### Color

- `brand-500` (`#ff6a00`) is the only brand color: the one primary button per view, the selection
  indicator, active icons, progress, the highlighted chart value, the menu highlight. Text on it is
  always the dark `on-brand` — white on orange fails contrast.
- Brand as text uses `link` / `brand-700`, never `brand-500` on white.
- Status is **dot + word, never color alone**: `green-500` good/connected, `blue-500` informational,
  `yellow-500` waiting/paused, `red-500` failed/risk. Status text uses the -700 step.
- Tints (-100) are backgrounds for tags and inline banners; text on them uses -900.
- Charts: one primary series in `brand-500`, a comparison series in `blue-500`; further series in
  `purple-500`, `green-500`, `yellow-500`.
- No hardcoded hex in `app/desktop` or `packages/dashboard`. A missing token goes into the token
  file for both themes.

### Type

- Desktop on Windows: Segoe UI Variable — 24px Display page titles, 14px semibold card titles,
  13px/20px body, 12px captions.
- Desktop on macOS: SF — the 17px bold toolbar title names the page (the in-content page `<h1>` is
  visually hidden and stays the accessible title), 14px semibold card titles, 13px/20px body, 11px
  captions and list headers.
- Web: system stack — page title `title-2` in the toolbar, card titles `headline`,
  tables/sidebar/buttons `callout`, labels/column heads `caption`, metadata `footnote`. KPI numbers
  32px bold.
- Continuously changing values use tabular figures (`.tabular`).
- Inter is not an app UI face; the desktop bundles it only because the dash names it for wheel labels.

### Shape and spacing

- Windows: 4px controls, 8px cards and flyouts.
- macOS: buttons 28px with 8px corners on a borderless grey fill (small buttons 22px, 6px corners);
  toolbar items, the search field, chips and tabs are capsules; 14px cards (`--radius-card`) with a
  hairline edge, 16px dialogs; focus is a 3px half-opacity brand halo hugging the control.
- Web: controls S/M use `radius-sm` / `radius-md`, XL controls `radius-pill`; stand-alone search
  fields are always pill; cards `radius-xl`; chips, toasts, toolbar groups `radius-pill`.
- Chart bars: rounded on top only, square at the baseline, with a `separator` baseline.
- Web spacing: `space-xs`–`space-xl` inside components, `space-2xl` between cards, `space-3xl` card
  padding, `space-4xl` content gutter.

## Glance readouts

A readout has a quiet label, a high-contrast value, and a subordinate unit in a stable position.
Whitespace and aligned baselines separate neighbouring readouts; dividers or grouped surfaces appear
only when spacing cannot prevent ambiguity. A metric is not automatically a card.

Readouts reserve space for their expected maximum format. Unit position and decimal precision stay
stable. Values update in place without bounce, count-up, reflow, pulse or glow. Missing, stale,
invalid and disconnected values keep their geometry and show `—` with an explicit connection state;
an old value is never frozen and presented as live. Primary values stay neutral at rest — orange
appears only when it adds interaction or state meaning.

## Interface guidelines

### Decision procedure — top to bottom, stop at the first match

| # | If the control … | Use | Never use |
|---|---|---|---|
| 1 | navigates between app areas | NavigationView (Windows) · Sidebar (macOS, web) | Segmented control, tab switcher, select |
| 2 | starts actions | 1–2 actions: buttons · 3+ related actions: **pull-down button** / CommandBar overflow | Select, segmented control |
| 3 | switches between **separate panes of content** on one page (2–6) | **Tabs** (Windows) · **Tab switcher (glass)** (web) | Segmented control, select |
| 4 | steps through consecutive periods or ordered steps | **Stepper** ‹ › | Select with every value |
| 5 | turns one thing on/off | Switch (applies instantly) · Checkbox (in a form with a save action) | Segmented "On/Off" |
| 6 | filters with multiple selections | Filter chips | Segmented control |
| 7 | picks 1 of **2–5 short options** that change the presentation of the **same data** and are switched often — or, inside a form, 1 of 2–3 options that define the record type | **Segmented control (flat)** | Select, radio buttons |
| 8 | anything else: 6+ options, long/dynamic/user-generated labels, a form value with 4+ options, a rarely changed setting, tight space | **Select** with a sensible default | Segmented control |

Unbounded, data-driven option sets (laps, sessions, tracks) are lists, not dropdowns: a dropdown
grows past the screen once the corpus holds hundreds of entries.

### Segmented control vs. select

- MUST use a **select** when any is true: more than 5 options · any label longer than ~12
  characters · options come from data · a form value with 4+ options · the option set can grow.
- MUST use a **segmented control** only when all are true: 2–5 options · one-word labels · equally
  important · the user compares them by switching back and forth.
- Windows: prefer a select in the CommandBar.

### Segmented control vs. tabs

- **Same data, different presentation** (period, unit, chart type, sort) → segmented control. It is
  flat: the selected segment NEVER has a shadow, border, gradient or glass.
- **Different content** (another table, form or panel) → tabs / tab switcher, one per page, never
  inside a card. NEVER use a segmented control to swap whole panels.

### All selection controls

- Text-only OR icon-only per control — never both in one control.
- Labels are short nouns; actions are verbs.
- Selections and actions never share one control.
- A choice always has a visible default; a select never starts empty unless the field is optional.
- Every control is keyboard-operable (radiogroup, tablist, combobox/listbox, menu) with a visible
  2px focus ring.

### Forms and dialogs — creating or editing a record

**Container**

- Create/edit of one record opens in a **ContentDialog** (desktop) or **Sheet** (web): a scoped task
  in the current context.
- One dialog at a time. NEVER open a dialog from a dialog — close the first, or use a stepped dialog
  / full page for long flows (> 8 fields or more than one step). Stepped dialogs draw their steps
  with a step indicator, not a "Step 1 of 3" line.
- Title = the task ("New plan", "Edit device") and follows the chosen record type.

**Fields**

- Order: the one required field first and focused on open, then the most-changed fields, optional
  fields last.
- Mark required fields only when they are the exception; optional fields say "Optional". NEVER use
  asterisks.
- Field width matches the expected input.
- Measured values (lap times, fuel use) come from recorded data, not typed entry.
- Validate on blur, not on every keystroke; show the message directly under the field with a red
  border. NEVER show errors before the first interaction.
- Context feedback informs but never blocks saving.

**Actions**

- Buttons bottom-right; exactly one primary, labelled with a verb ("Create", "Save"). NEVER "OK"
  or "Submit". Windows ContentDialog puts the primary left of "Cancel", per Fluent; macOS and web
  put "Cancel" left of the primary, so the primary is rightmost.
- Enter = primary, Esc = Cancel. The primary is disabled until required fields are valid.
- Closing with unsaved changes asks "Discard changes?" with "Discard" (destructive) and
  "Keep editing".
- After saving: close the dialog and confirm with a toast; offer undo for reversible deletions
  instead of a confirmation dialog. Irreversible or high-consequence actions confirm first.

## Components

### Button

Variants: primary `brand-500` / `on-brand` · standard (`fill`) · subtle (text) · destructive.
Desktop uses `.button` + `primary` / `subtle` / `destructive`.

- **MUST:** one primary per view or dialog · icon-only buttons get an `aria-label` · labels are verbs.
- **NEVER:** glow or colored shadows · white text on `brand-500` · a primary button for a
  destructive action · a destructive button as the dialog default.
- Placement: dialogs bottom-right · card headers top-right · toolbar actions are icon buttons,
  never primary on web. On macOS a page's actions sit in the toolbar (see Toolbar / CommandBar).

### Pull-down button

A button that opens a menu of **actions** (not values); label is a verb with a chevron. Use for 3+
related actions. The label never changes after a choice. Destructive items go last.

### Search field

Web: pill, `fill` background, magnifier left, trailing end of the toolbar. Desktop: the title-bar
search box (the toolbar's trailing search field on macOS) opens the command palette — Ctrl+K on
Windows, ⌘K on macOS.

- **MUST:** search as you type (debounced) · Esc clears · an empty result says so and offers a reset.
- **NEVER:** a separate "Search" button · more than one search field per view.

### Text field

Single-line input with a visible label; the placeholder is a hint, never the only label.

- **MUST:** width matches the input · `autocomplete` / `inputmode` set · validate on blur.
- **NEVER:** validate while typing · use a text field to pick from a known list (→ select) · put the
  unit inside the value (use a suffix).

### Date field

Typeable field with a trailing calendar button. Accepts typed input and normalises on blur. NEVER
three separate day/month/year selects.

### Select

The full field shows the value; the trigger on the right is a small icon button with a chevron-down.
Use for 6+ options, data-driven labels, saved form values, rare settings, or tight space. NEVER
make the whole dropdown a button, or use a select to switch panes.

### Segmented control

Flat choice between 2–5 related options that change **how the current view is shown**. Equal-width,
text-only segments; the selected segment has no shadow, border, gradient or glass. Renders as
`role="radiogroup"` with arrow-key navigation.

### Tabs / tab switcher

Switches between 2–6 separate panes of one page. Desktop uses `.tabs`; web uses the glass tab
switcher centred at the top of the content. One per page, never inside a card. Renders as
`role="tablist"` with `role="tabpanel"` panes.

### Switch

On/off for settings that apply immediately. Label on the left, describing the on state positively.
Inside a form confirmed by a save action, use a checkbox instead.

### Checkbox

A boolean that takes effect only when the surrounding form is confirmed. Label describes the
checked state positively. NEVER for an instant action.

### Navigation

Windows NavigationView: 248px pane, 32px items, a 3×16px brand selection indicator, compact 48px
mode, footer for account, Settings and Help. macOS sidebar: 224px, 28px items, brand icons, the
selected item a rounded fill with a semibold label (no indicator bar); hiding it removes it entirely,
there is no compact rail. Web sidebar: edge-to-edge, icons `brand-500`, text `label`, active row
`fill-strong`. NEVER put actions in navigation or nest deeper than one level.

### Toolbar / CommandBar

Windows: `PageHeader` (24px title) + CommandBar (28px controls, dividers, "…" overflow) at the top
of the content. Web: one frosted band with at most three groups — leading title · centre view
control · trailing icon actions then search.

macOS: the toolbar has the HIG's three zones.

- Leading: the sidebar toggle (only while the sidebar is hidden), back, the 17px page title.
- Centre: the telemetry indicator, a capsule that opens Help & diagnostics. When the toolbar gets
  narrow it shrinks to its dot first; the word stays in its tooltip and for screen readers.
- Trailing: the page's actions, then search. `PageHeader` moves its CommandBar here: secondary
  actions show icon-only in shared capsules with their label as tooltip, groups are split by
  fixed space instead of dividers, and the one primary is a brand capsule. The primary keeps its
  place first in the group, so the visual order is the Tab order; the group as a whole is trailing.
  When the actions do not fit even with the indicator at its dot, the same items move to a row at
  the top of the content, and return once they fit with room to spare.
- A `detail` header — a title naming an item (the dash being edited), not the page — keeps its
  title and CommandBar in the content.

- **MUST:** max. 4 icon actions, the rest in overflow · every icon action has a tooltip · views
  write one CommandBar in `PageHeader` and leave its placement to the shell.
- **NEVER:** a second toolbar row · the app name as page title · orange toolbar fills on web.

### Context menu

Glass/acrylic menu for actions on the current item (right-click, Shift+F10, "…"). Most frequent
first, grouped with separators, destructive last in danger text, shortcuts right-aligned. On macOS
menu items are text only (an item without a label keeps its icon). The same actions MUST be
reachable another way. NEVER put value selections in a context menu.

### Notification and InfoBar

Notifications report something important the user did not trigger; at most one visible, auto-hide
unless they carry actions. Persistent page-level states use an inline InfoBar (`.infobar`). Form
errors belong at the field, never in a notification.

- macOS draws the InfoBar as the component sheet's inline alert: the flat status tint, 8px corners,
  bold title and message in the tint's text colour (`--infobar-*-text`), no icon disc.
- A state that is informational and offers no action is an indicator, not a banner. On macOS the
  Home telemetry InfoBar is hidden because the toolbar indicator already says it; Help & diagnostics
  keeps it as the detail behind the indicator.

### Toast

Short-lived confirmation of the user's own action: one line, past tense, optional undo. NEVER for
errors that need action; never stacked.

### Status

8px dot + word, the same color and word for the same state everywhere. Tags use the -100 tint with
-700 text. Counters are red pills. NEVER color alone; at most one badge per row. The one exception is
the macOS toolbar indicator shrunk to its dot, whose word stays in its tooltip and accessible name.

### KPI card

Label, large value with unit, and a delta line or meter. Four per row at most. NEVER invent sample
numbers in production; NEVER put a chart inside a KPI card.

## Content

- English copy. Short labels, nouns for segments, verbs for actions. No emoji.
- No redundant captions: the page title (the toolbar on macOS) names the page; headers carry status
  and actions only.

## Iconography

Line icons on a 24px grid, consistent stroke, round caps and joins, `currentColor`.

## Accessibility

- Text meets 4.5:1 on its ground in both themes; `label-secondary` is the lightest allowed text color.
- 2px focus ring on every focusable control (the 3px brand halo on macOS); focus is distinct from
  selection.
- Status is never color-only.
- Dialogs trap focus and return it to the trigger on close.
