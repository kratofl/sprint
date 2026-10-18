# Sprint Design System

The authority for app UI. MUST = mandatory, NEVER = forbidden, SHOULD = default unless a documented
reason exists. The rendered wheel dash is not app UI; its rules are in
[`../internals/dash-rendering.md`](../internals/dash-rendering.md).

Token values live in `packages/tokens/` (`windows.css`, `macos.css`, `web.css`); this file holds the
rules for using them. The web app's system is described in [Web app](#web-app); [Web token
roles](#web-token-roles) says what each web token is for.

## Reference mockups

In [`mockups/`](mockups/), for the desktop app. Their copy is a German sample app ("Haushalt"), not
Sprint; take the shell, materials, geometry and component shapes, never the screens or the words.
The web app has no mockup: [Web app](#web-app) and its components in `web/components/` are the
reference.

| Look | Mockup |
| --- | --- |
| Desktop on Windows | `windows-light.html`, `windows-dark.html` — exact sizes in their inline styles; screenshots `win.png`, `win-dark.png` |
| Desktop on macOS | `macos-light.html`, `macos-dark.html` — shell, materials and geometry |
| Component sheet | `components-web.html` — the source of the macOS buttons, cards and inline alerts |

Where the mockups are silent, the macOS look follows Apple's Human Interface Guidelines for macOS 27.

## Surfaces

| Surface | Look | Tokens | Type |
| --- | --- | --- | --- |
| Desktop app on Windows and Linux (`app/desktop`, Electron) | Windows Fluent: Mica window, 48px title bar, NavigationView pane, content layer, CommandBar, ContentDialog, acrylic flyouts and notifications. 4px controls, 8px cards and flyouts. | `@sprint/tokens/windows.css` | Segoe UI Variable (system font, nothing bundled), 13px/20px base |
| Desktop app on macOS (`app/desktop`, Electron) | macOS 27: full-height 224px source-list sidebar on vibrancy with the traffic lights in its top band, 52px toolbar in three zones that carries the page title and the page's actions, opaque content scrolling under the toolbar, glass menus, palette, notifications and dialogs. Borderless grey-filled 28px buttons with 8px corners, 14px cards with a hairline edge, 16px dialogs. | `@sprint/tokens/macos.css` over `windows.css` | SF (system font, nothing bundled), 13px/20px base |
| Web app (`web/`) | Calm web app: cards one step off the canvas, defined by a hairline edge rather than fill or shadow, small controls, frosted glass only on the shell chrome and small floating layers, solid sheets. Dense desktop scale from 1024px, touch-sized pills below. See [Web app](#web-app). | `@sprint/tokens/web.css` | Bundled Figtree on every platform |
| Wheel dash (`packages/dashboard`) | Hardware instrument with its own color domain. Not restyled with the app. | Dash palette in `packages/dashboard` | Saira Semi Condensed numerics, Inter labels |

- Only the brand and status colors carry across platforms. Component shapes are native to each
  platform. NEVER use Material Design patterns (FABs with elevation, ripple, filled text fields,
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

- Content is flat: cards (`surface` on `bg`), lists, tables, inputs, buttons, sidebar — no shadow,
  no gradients.
- **Glass only on:** context menus, the toolbar, alerts/notifications, toasts, popovers and dialogs.
  On Windows that is acrylic on flyouts and notifications, Mica on the window; on macOS, glass on
  menus, the palette, notifications and dialogs, vibrancy behind the sidebar only. The web's glass
  and elevation rules are under [Web app](#web-app).
- **macOS scroll edge:** content scrolls under the toolbar. At rest the toolbar has no bar of its
  own and the content's colour shows through; once the content scrolls, a translucent blurred bar
  with a hairline fades in over the first 24px. With Reduce Transparency the bar is solid.
- **Web backdrop:** the web app sits on the light-trails artwork (`web/components/Backdrop.tsx`):
  vivid behind the sign-in card (dialog glass), blurred and dimmed under the app shell (`bg` at
  82 % over it). Cards and every other content element stay opaque; only the gaps, the glass
  sidebar and the toolbar show it. The artwork is plain strokes painted once — no SVG/CSS filters or masks
  in it (Safari re-runs them on every repaint), never animate its strokes, and no `backdrop-filter`
  over the whole content area.
- **Flat fallback:** with `prefers-reduced-transparency: reduce` or no `backdrop-filter` support,
  glass becomes a solid surface with its border, no blur. It is a complete, supported option.
- **Buttons never glow.** No colored or outer shadows on buttons, ever.

### Color

- `brand-500` (`#ff6a00`) is the only brand color: the one primary button per view, the selection
  indicator, active icons, progress, the highlighted chart value, the menu highlight. Text on it is
  always the dark `on-brand` — white on orange fails contrast (2.9:1).
- Brand as text uses `link` / `brand-700`, never `brand-500` on white.
- Status is **dot + word, never color alone**: `green-500` good/connected, `blue-500` informational,
  `yellow-500` waiting/paused, `red-500` failed/risk. Status text uses the -700 step.
- Scale steps: -100 backgrounds (tags, inline banners), -300 graphics only (never text), -500 the
  token itself (dots, chart series; not text on white), -700 text on white and on -100 tags, -900
  text on -100 banners.
- Desktop charts: one primary series in `brand-500`, a comparison series in `blue-500`; further
  series in `purple-500`, `green-500`, `yellow-500`. Web charts keep context in grey (see
  [Web app](#web-app)).
- No hardcoded hex in `app/desktop` or `packages/dashboard`. A missing token goes into the token
  file for both themes.

### Type

- Desktop on Windows: Segoe UI Variable — 24px Display page titles, 14px semibold card titles,
  13px/20px body, 12px captions.
- Desktop on macOS: SF — the 17px bold toolbar title names the page (the in-content page `<h1>` is
  visually hidden and stays the accessible title), 14px semibold card titles, 13px/20px body, 11px
  captions and list headers.
- Web: the type styles under [Web app](#web-app) — 13px `callout` base on desktop, the 17px semibold
  toolbar title names the page, 14px semibold card titles, 11px caption column heads.
- Continuously changing values use tabular figures (`.tabular`).
- Inter is not an app UI face; the desktop bundles it only because the dash names it for wheel
  labels. Saira Semi Condensed is only for numeric values on the rendered wheel. Brand lettering is
  artwork, not a font choice.

### Shape and spacing

- Windows: 4px controls, 8px cards and flyouts.
- macOS: buttons 28px with 8px corners on a borderless grey fill (small buttons 22px, 6px corners);
  toolbar items, the search field, chips and tabs are capsules; 14px cards (`--radius-card`) with a
  hairline edge, 16px dialogs; focus is a 3px half-opacity brand halo hugging the control.
- Web: the radius scale under [Web app](#web-app) — 6px controls, 10px cards on desktop; pills
  below 1024px.
- Chart bars: rounded on top only, square at the baseline, with a `separator` baseline.

## Glance readouts

A readout has a quiet label, a high-contrast value, and a subordinate unit in a stable position.
Whitespace and aligned baselines separate neighbouring readouts; dividers or grouped surfaces appear
only when spacing cannot prevent ambiguity. A metric is not automatically a card.

Readouts reserve space for their expected maximum format. Unit position and decimal precision stay
stable. Values update in place without bounce, count-up, reflow, pulse or glow. Missing, stale,
invalid and disconnected values keep their geometry and show `—` with an explicit connection state;
an old value is never frozen and presented as live. Primary values stay neutral at rest — orange
appears only when it adds interaction or state meaning.

## Choosing a control

### Decision procedure — top to bottom, stop at the first match

| # | If the control … | Use | Never use |
|---|---|---|---|
| 1 | navigates between app areas | NavigationView (Windows) · Sidebar (macOS, web) | Segmented control, tab switcher, select |
| 2 | starts actions | 1–2 actions: buttons · 3+ related actions: **pull-down button** / CommandBar overflow | Select, segmented control |
| 3 | switches between **separate panes of content** on one page (2–6) | **Tabs** (desktop) · separate sidebar destinations (web) | Segmented control, select |
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

- **Same data, different presentation** (period, unit, chart type, sort) → segmented control.
- **Different content** (another table, form or panel) → tabs / tab switcher. NEVER use a segmented
  control to swap whole panels.

### All selection controls

- Text-only OR icon-only per control — never both in one control.
- Labels are short nouns; actions are verbs.
- Selections and actions never share one control.
- A choice always has a visible default; a select never starts empty unless the field is optional.
- Every control is keyboard-operable (radiogroup, tablist, combobox/listbox, menu) with a visible
  2px focus ring.

## Forms and dialogs — creating or editing a record

**Container**

- Create/edit of one record opens in a **ContentDialog** (desktop) or **Sheet** (web): a scoped task
  in the current context; the rest of the window is dimmed.
- One dialog at a time. NEVER open a dialog from a dialog — close the first, or use a stepped dialog
  / full page for long flows (> 8 fields or more than one step). Stepped dialogs draw their steps
  with a step indicator, not a "Step 1 of 3" line.
- Title = the task ("New plan", "Edit device") and follows the chosen record type.

**Fields**

- Order: the one required field first and focused on open, then the most-changed fields, optional
  fields last.
- Mark required fields only when they are the exception; optional fields say "Optional". NEVER use
  asterisks.
- Field width matches the expected input. Fields share a row only when they belong together and
  are short.
- Web sheet layout: labels above their fields, 16px between fields (`FormSheet`).
- Numeric values are right-aligned with tabular figures, the unit as a suffix.
- Measured values (lap times, fuel use) come from recorded data, not typed entry.
- Validate on blur, not on every keystroke; show the message directly under the field in
  `danger-text` with a red border. NEVER show errors before the first interaction.
- Context feedback informs but never blocks saving.

**Actions**

- Buttons bottom-right; exactly one primary, labelled with a verb ("Create", "Save"). NEVER "OK"
  or "Submit". Windows ContentDialog puts the primary left of "Cancel", per Fluent; macOS and web
  put "Cancel" left of the primary, so the primary is rightmost. A "create another" checkbox, when
  offered, sits at the left of the footer.
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

Web: a 28px bordered field with the magnifier left, in the toolbar before the primary action
(a pill on phones). Desktop: the title-bar
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

Typeable field with a trailing calendar button that opens a picker popover. Accepts typed input and
normalises on blur; defaults to today. NEVER three separate day/month/year selects.

### Select

The full field shows the value; the trigger on the right is a small icon button with a chevron-down.
Use for 6+ options, data-driven labels, saved form values, rare settings, or tight space. NEVER
make the whole dropdown a button, or use a select to switch panes.

### Segmented control

Flat choice between 2–5 related options that change **how the current view is shown**. Equal-width,
text-only segments; on desktop the selected segment NEVER has a shadow, border, gradient or glass
(the web's selected segment carries `shadow-segment`, see [Web app](#web-app)). Renders as
`role="radiogroup"` with arrow-key navigation.

### Tabs / tab switcher

Switches between 2–6 separate panes of one page. Desktop uses `.tabs`; the web has none yet and
splits such panes into sidebar destinations. One per page, NEVER inside a card. Renders as
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
there is no compact rail. Web sidebar: see [Web app](#web-app). NEVER put actions in navigation or
nest deeper than one level.

### Toolbar / CommandBar

Windows: `PageHeader` (24px title) + CommandBar (28px controls, dividers, "…" overflow) at the top
of the content. Web: one frosted band — title, scope control and caption leading; icon actions,
search and the one primary action trailing (see [Web app](#web-app)).

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

Everywhere:

- **MUST:** max. 4 icon actions, the rest in overflow · every icon action has a tooltip · views
  write one CommandBar in `PageHeader` and leave its placement to the shell.
- **NEVER:** a second toolbar row (the web's phone scope row excepted) · the app name as page title.

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
-700 text. Counters are red pills (`red-500`, white text). NEVER color alone; at most one badge per
row. The one exception is the macOS toolbar indicator shrunk to its dot, whose word stays in its
tooltip and accessible name.

### KPI card

Desktop: label, large value with unit, and a delta line or meter. Four per row at most. The web
uses a hero metric and metric strips instead (see [Web app](#web-app)). NEVER invent sample numbers
in production; NEVER put a chart inside a KPI card.

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

## Web app

The web app (`web/`) runs one system end to end: tokens in `packages/tokens/web.css`, their
Tailwind mapping plus the type and radius scales in `web/app/globals.css`, shadcn/ui primitives
(Radix) in `web/components/ui/`, and the app patterns in `web/components/app/`. Pages compose
those; they never restyle a primitive or rebuild a control inline. The Tailwind palette, radii and
text sizes are cleared, so a class outside the system compiles to nothing. Copy is English; icons
are Tabler line icons (1.8 stroke, 2 at 16px).

**Fixed, outside the system:** the sign-in page (`web/app/sign-in/`, styled only by its own
`sign-in.css` with the `--signin-*` tokens) and the light-trails artwork
(`web/components/Backdrop.tsx`). Both keep their look when the system changes;
`web/app/styleContract.test.ts` keeps the sign-in styles scoped to the page.

### Two scales

From `lg` (1024px) the desktop scale is dense: 28px controls, 36px rows, smaller type and radii.
Below `lg` the phone scale keeps touch sizes: every control is a pill of at least 44px, type and
radii are larger, the sidebar becomes a glass tab bar at the bottom. The type and radius
utilities read variables that switch at the breakpoint, so a class names a role, not a size.

| Type | Desktop | Phone | Use |
| --- | --- | --- | --- |
| `text-display` | 44/48 semibold | 40/44 | A page's one hero number. |
| `text-large-title` | 24/30 semibold | 34/41 | Stand-alone page titles. |
| `text-title-1` | 22/28 semibold | 28/34 | Section headings. |
| `text-kpi` | 22/28 semibold | 32/38 | Metric-strip values. |
| `text-title-2` | 17/22 semibold | 22/28 | The page title in the toolbar. |
| `text-title-3` | 15/20 semibold | 20/25 | Sheet and large card titles. |
| `text-headline` | 14/20 semibold | 17/22 | Card and list titles. |
| `text-body` | 13/18 | 15/21 | Body copy. |
| `text-callout` | 13/18 | 14/20 | The default: tables, sidebar items, buttons, inputs. |
| `text-footnote` | 12/16 | 13/18 | Help text, metadata, menu items, segment labels. |
| `text-caption` | 11/14 semibold | 12/16 | Column heads, field labels, tags, sidebar section headers. |

Radii (desktop / phone): `xs` 4/6 tags, checkboxes, chart bar tops · `sm` 6/8 every desktop
control and menu item · `md` 8/12 control groups, segmented tracks, tooltips, banners · `lg`
10/16 cards and menus · `xl` 14/18 sheets · `full` XL buttons, toasts, every phone control.
Containers are concentric: a radius-sm control plus 2px track is radius-md. Spacing uses
Tailwind's 4px scale: 16px card padding and gap between cards, 20px content gutter.

### Surfaces and elevation

- **Borders at rest, shadows for what floats.** Cards are `surface`, barely off `bg`, with a 1px
  `separator` edge and no shadow (`shadow-e1` is `none`). NEVER separate a card from the page by a
  big fill step; the hairline does that. Inputs, buttons and tables are flat.
- Elevation: `e1` cards · `e2` the toolbar once content scrolls under it · `e3` menus, select
  lists, tooltips, toasts · `e4` sheets. Every layer at e2 or above has a 1px `floating-border`.
- **Glass** (`.glass`: `glass-bg` + 14px blur + `floating-border` + `e3`) only on small floating
  chrome: menus, select lists, toasts, the phone tab bar. **Solid** (`.floating`) wherever
  content sits: chart tooltips, sheets. Sheets dim the page (30 % black, 50 % in dark).
- **Shell chrome over the backdrop.** The sidebar (`.chrome`) and the toolbar band
  (`.toolbar-band`) are glass whose fill opacity and blur come from the Glass setting
  (`--chrome-opacity`, `--chrome-backdrop`); the content area (`.content-veil`) is `bg` at 82 %
  over the ambient trails. Cards and every other content element stay opaque. Never put a
  `backdrop-filter` over the whole content area.
- **Flat fallback:** with `prefers-reduced-transparency: reduce` or without `backdrop-filter`,
  glass becomes `surface-floating`, the chrome solid, the veil opaque, and the toast a solid
  inverse pill. Under `forced-colors` every floating layer is `Canvas` with a `CanvasText` edge.
- **Motion** comes from the Motion setting: `--motion` drives every transition and entrance
  (Tailwind's default duration is `--motion-fast`; animated primitives use `duration-(--motion)`),
  0 turns it off, and `prefers-reduced-motion` forces 0. Animations are finite and triggered.

### Colour

- `brand-500` is the one primary button per view, the active sidebar icon, meters, the
  highlighted chart series and the menu highlight; text on it is `on-brand`. Brand as text is
  `link`. Buttons never glow.
- Status is dot + word (`StatusDot`): `green` good, `blue` informational, `yellow` waiting,
  `red` failed. Tags and icon tiles use the tints in `web/lib/tone.ts`: -100 with -700 text in
  light, the -500 at 20 % with -300 text in dark. Inline banners (`Alert`) use -100 with -900 text.
- **Charts:** the series the chart is about is `brand-500`; context (other periods, comparisons)
  is `chart-muted`, the still-running value `chart-muted-strong`. Categorical charts use the -500
  scales, at most five. Lines 2px, bars ≤ 24px with radius-xs tops on a `separator` baseline,
  3–5 solid gridlines, dashed lines only for a target reference. Label only the maximum or the
  reference; the rest is in a solid tooltip that follows pointer and keyboard. Every chart has a
  screen-reader table. Few points: `ColumnChart` / `ChartFrame` in `components/app/charts.tsx`;
  dense series (telemetry): the Recharts `ChartContainer` in `components/ui/chart.tsx`.

### Layout

A 224px sidebar (56px collapsed rail, state kept per browser) beside the content, with the 48px
toolbar band on top. Desktop pins the sidebar and scrolls the content pane; phones scroll the
document.

- **Everything belongs somewhere.** Title, scope control (a `PeriodStepper` or `Segmented`), its
  caption, icon actions, the page's search and its one primary action go into the toolbar through
  `PageHeader`. Hints and empty values live inside the card they explain; nothing sits loose
  between cards.
- **Composed, not stacked:** desktop content is a grid (2fr + 1fr, or 1fr + 1fr); cards in a row
  share their height; phones stack them in reading order.
- **One answer first:** a hero metric on an overview, the table on a list page, the form on an
  edit page. At most one `display` number per page.

| Page type | Shape |
| --- | --- |
| Overview | Hero metric over its chart (2fr) beside the most recent list (1fr) · a full-width `MetricStrip` · secondary lists. |
| List | One `DataTable` card, filtered from the toolbar search; optionally a metric strip of totals above. |
| Settings | `SettingsSurface`: one column, max 720px, one `SettingsSection` list card per topic. |

### Components

- **Sidebar** (`components/app/sidebar.tsx`): 28px rows, icons `label-secondary`, text `label`;
  the active row is `fill-strong`, semibold, with a `brand-500` icon and `aria-current`. Section
  headers are caption buttons that fold their section (kept per browser; the section holding the
  current page always opens). The footer is the `ProfileMenu`: Settings and Sign out live there
  and nowhere else on desktop.
- **Toolbar** (`ToolbarFrame` in the shell, filled by `PageHeader`): title (`title-2`, never the
  app name), scope, caption · then icon actions in a `ToolbarGroup`, the search, the primary
  action last as a primary M button (an icon button on phones). It lifts to `e2` once content
  scrolls under it.
- **Buttons** (`ui/button.tsx`): default (primary), secondary, outline, text, ghost,
  destructive; S 24 · M 28 · L 32 · XL 36 pill. One primary per view, never for a destructive
  action; icon-only buttons get an `aria-label`.
- **Fields:** `Input` and `SelectTrigger` are 28px `surface` fields with a `border-control` edge;
  `TextField` adds the label above and validates on blur (message in `danger-text` under the
  field). `FormSelect` for fixed option lists. `Switch` applies at once; `Checkbox` waits for Save.
- **Segmented** (`components/app/segmented.tsx`): 2–5 text options, 24px segments of at least
  72px; the selected one is `segment-selected` + `shadow-segment`, semibold. A flat
  `fill-strong` track in content, a pill on `toolbar-fill` in the toolbar.
- **Metrics:** `HeroMetric` (label, `display` value, one supporting line, its chart under it)
  and `MetricStrip` (up to five cells in one card divided by hairlines, value `text-kpi`, optional
  note and meter). A missing number is `—` in `label-disabled`; never invent one.
- **Lists and tables:** `Group` + `Row` for lists, `DataTable` for tables — 40px card header
  with no line under it, its action ("Show all") quiet in `label-secondary` with a trailing arrow,
  caption column heads, 36px rows divided by hairlines, figures right-aligned and tabular. Rows are
  flat inside one card; a row that navigates ends in an arrow (`Disclosure`), not a chevron. What
  a row only shows opens in a `DetailSheet`.
- **Sheets** (`components/app/form-sheet.tsx`): create/edit in a `FormSheet` (title, fields with
  labels above, Cancel and the submit action bottom-right, errors inside the sheet);
  read-only inspection in a `DetailSheet`. Solid, `e4`, `radius-xl`, inset 8px, from the right.
- **Feedback:** a confirmation of the user's own action is a toast via `useToast()` (glass pill,
  bottom centre, ~4 s, `role="status"`). A failure stays inline as a destructive `Alert` in the
  view that raised it. Empty cards show `EmptyState` (brand-tinted icon tile, headline, one line,
  optional action); a page whose data could not load shows `Unavailable` (`ErrorState`, red tile,
  Try again).

### Web token roles

What each token in `packages/tokens/web.css` is for; the values live only there. Scales
(`brand`, `green`, `red`, `yellow`, `blue`, `purple`) are the same in both themes: -100 tints,
-300 graphics (and dark-mode tint text), -500 dots, icons and chart series, -700 text on
`surface` and on -100, -900 text on -100 banners.

| Token | Role |
| --- | --- |
| `bg` | Page background. |
| `surface` | Cards, lists, tables, inputs; sits on `bg`. |
| `surface-floating` | Menus, tooltips, sheets; under glass at 85 %. |
| `sidebar-bg` | The sidebar's fill, at the Glass setting's opacity. |
| `fill` | Secondary button, hover, selected row, small icon boxes inside fields. |
| `fill-strong` | Active sidebar item, segmented track in content, switch off. |
| `separator` | Hairlines between rows, card borders, sidebar edge, toolbar bottom edge. |
| `border` | Outlined-button borders. |
| `border-control` | The edge of inputs, selects, search fields, checkboxes and the off switch (≥ 3:1). |
| `floating-border` | The 1px edge of every layer at e2 or above. |
| `meter-track` | The unfilled part of a `brand-500` meter. |
| `chart-muted`, `chart-muted-strong` | Context series in charts; the still-running value. |
| `label` | Primary text and icons. |
| `label-secondary` | Secondary text, column heads, inactive sidebar icons (≥ 4.5:1; the lightest text colour). |
| `label-disabled` | Disabled text and empty values only. |
| `on-brand` | Text and icons on `brand-500`. |
| `link` | Links and text buttons. |
| `success-text` / `danger-text` | Positive / negative values; `danger-text` also errors and destructive menu items. |
| `segment-selected` + `shadow-segment` | The selected segment. |
| `focus-ring` | The 2px focus ring, offset 2px, on every focusable control. |
| `toolbar-fill` | The fill of controls inside the toolbar band. |
| `glass-bg`, `glass-blur` | Glass fill (`surface-floating` at 85 %) and its blur. |
| `shadow-e1` … `shadow-e4` | Elevation; e1 is `none`. |
| `signin-*` | The sign-in page only: its background and dialog-glass card. |
