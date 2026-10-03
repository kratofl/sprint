# Webix Design System

## Platform strategy

- **Web is the primary CI.** It follows an Apple look (macOS / Apple web apps): system font, calm neutrals, flat content, Liquid Glass only on floating chrome. Never use Material Design patterns (FABs with elevation, ripple, filled text fields, app bars with shadows).
- **Native apps follow their platform.** iOS and macOS follow Apple's HIG (macOS 27 “Golden Gate” styling), Windows follows Fluent (Segoe UI Variable, Mica, 4/8px radii, NavigationView, CommandBar). Android, when built, follows its platform too. Only the brand tokens (`brand-500`, status colours, content) carry across; component shapes are native.
- Every surface ships **light and dark** (`light` / `dark` themes).

## Visual foundations

### Flat first, glass on chrome

- Content is flat: cards (`surface` on `bg`), lists, tables, inputs, buttons, sidebar – `shadow-none`, no gradients.
- **Liquid Glass only on:** context menus, the toolbar, alerts/notifications, toasts (plus popovers and dialogs). Glass = `glass-bg` (55 % opacity) + `backdrop-filter: blur(var(--glass-blur)) saturate(180%)` + `1px solid var(--glass-border)` + `shadow-glass` (inner specular `glass-highlight`).
- The **toolbar is one uniform frosted band** across the content area (`toolbar-bg`, `toolbar-blur`, `separator` underneath). Controls inside it sit on subtle fills (rgba black 5 %), not on separate glass capsules.
- **Flat fallback:** with `prefers-reduced-transparency: reduce` or no `backdrop-filter` support, glass becomes `surface` + `1px solid var(--border)`, no blur, no shadow. The flat variant is a complete, supported option.
- **Buttons never glow.** No coloured or outer shadows on buttons – ever.

### Colour

- `brand-500` is the only brand colour. Use it for the primary button, active icons, progress, the highlighted chart bar and the menu highlight. Text on it is always `on-brand` (dark) – white on orange fails contrast.
- Brand as text uses `link` / `brand-700` (never `brand-500` on white).
- Neutrals: page `bg`, cards `surface`, secondary fills `fill`, active sidebar item `fill-strong`, hairlines `separator`, control borders `border`. Text `label`, secondary `label-secondary`.
- Status: dot + word, never colour alone – `green-500` Aktiv, `blue-500` Review, `yellow-500` Pausiert, `red-500` Risiko. Status text uses the -700 step (`success-text`, `danger-text` in dark).
- Tints (-100) are backgrounds for tags and inline banners; text on them uses -900.
- Charts: series in `brand-500` at `track-tint` alpha, the highlighted value in full `brand-500`; team series in `blue-500`, `purple-500`, `green-500`, `yellow-500`.

### Type

- One family: `sans` (SF Pro on Apple devices, Figtree elsewhere).
- Web: page title `title-2` in the toolbar, card titles `headline`, tables/sidebar/buttons `callout`, labels/column heads `caption`, metadata `footnote`. KPI numbers 32px bold.
- iOS: large titles 30–34px (`large-title`), list rows 16px.

### Shape

- Desktop controls in S/M/L use `radius-sm` / `radius-md`; **XL controls become `radius-pill`**.
- **Search fields are always `radius-pill`** when they stand alone.
- Cards: `radius-xl` (web, iOS), `radius-lg` (macOS). Chips, toasts, toolbar groups and segmented controls in the toolbar: `radius-pill`.
- Chart bars: `radius-xs` on top only, square at the baseline, with a `separator` baseline. (iOS may use capsule bars.)
- Mobile: all controls are pill from the start and larger (min 44px tall); mobile controls may use glass.

### Spacing & layout

- Component internals: `space-xs`–`space-xl`. Layout: `space-2xl` between cards, `space-3xl` card padding, `space-4xl` content gutter.
- Web layout: 256px sidebar (edge-to-edge, `sidebar-bg`) + content with the frosted toolbar on top (64px), KPI row, charts, list.

## Components (rules)

- **Buttons:** Primär (`brand-500` + `on-brand`), Sekundär (`fill`), Umrandet (`surface` + `border`), Text (`link`), Löschen (`red-100` + `red-700`). Sizes S 28px / M 40px / L 48px / XL 56px pill. One primary button per view. No glow.
- **Toolbar (HIG):** max three groups – leading (page title), center (segmented control for view options), trailing (icon actions + search last). Prefer borderless symbols; a text-labelled action stays separated. Every toolbar action also exists in a menu.
- **Segmented control (flat):** closely related view options only (Monat/Quartal/Jahr), text-only, equal-width segments, selected = `segment-selected` with **no shadow** (`shadow-none`), no border, no glass. Not for navigation, not for panes.
- **Tab switcher (glass):** switches between separate panes of one page (Übersicht/Buchungen/Verträge). Glass pill track (`glass-bg`, blur, `glass-border`, `shadow-tabs`), selected tab `tab-selected` + inset `tab-highlight`. One per page, centred at the top of the content.
- **Select / dropdown:** full field (`surface`, `border`, `radius-md`) with the value on the left; the trigger on the right is an **S secondary icon button** (28px, `fill`, `radius-sm`) with a chevron-down.
- **Pull-down button:** secondary button with verb label + chevron-down, opens a glass menu of 3+ actions.
- Which of these to use is decided by the **Interface Guidelines** below – not by taste.
- **Forms:** Sheet (glass dialog), TextField, AmountField, DateField, Select, Checkbox – layout, order and button rules in **Forms & sheets** below. Every component README has „Use when“, „MUST“ and „NEVER“ rules; they are binding.
- **Search field:** pill, `fill` background (in the toolbar: 5 % black), magnifier left.
- **Sidebar (web/macOS):** collapse button in the sidebar's top row (right). Items 36px, `radius-md`/10px; active = `fill-strong` background + semibold text; **icons always `brand-500`, text always `label`** (active and inactive). Section headers `caption` in `label-secondary`.
- **Context menu:** glass, 6px padding, 28–30px items, highlighted item `brand-500` + `on-brand`, destructive last in `danger-text`, shortcuts right in `label-secondary`.
- **Notification / alert:** glass card top-right, app tile + `headline` title + `footnote` body.
- **Toast:** glass pill at bottom centre, status icon + one line (+ optional undo).
- **Tables / lists:** column heads `caption` `label-secondary`, rows 48–50px, `separator` hairlines, selected row = `fill` with `radius-md`.
- **Mobile (iOS):** tab bar is navigation only (no actions) with a separate trailing search tab; actions go into the top-right glass group or a bottom toolbar; back button = round chevron without text.

## Interface Guidelines (Webix HIG)

Binding rules for choosing controls. Written for people **and coding agents**: MUST = mandatory, NEVER = forbidden, SHOULD = default unless a documented reason exists. Based on Apple's Human Interface Guidelines (links below); where the HIG leaves room, these rules decide.

### Decision procedure – go top to bottom, stop at the first match

| # | If the control … | Use | Never use |
|---|---|---|---|
| 1 | navigates between app areas (Übersicht, Budget, Buchungen) | Sidebar (web/macOS) · NavigationView (Windows) · Tab bar (iOS) | Segmented control, tab switcher, select |
| 2 | starts actions | 1–2 actions: buttons · 3+ related actions: **Pull-down button** | Select, segmented control |
| 3 | switches between **separate panes of content** on one page (2–6) | **Tab switcher (glass)** | Segmented control, select |
| 4 | steps through consecutive periods (months, weeks) | **Stepper** ‹ September 2026 › | Select with 12 months |
| 5 | turns one thing on/off | Switch (applies instantly) · Checkbox (in a form with „Speichern“) | Segmented „An/Aus“ |
| 6 | filters with multiple selections | Filter chips | Segmented control |
| 7 | picks 1 of **2–5 short options** that change the presentation of the **same data** and are switched often – or, **inside a form**, 1 of **2–3 short options** that define the record type (Ausgabe / Einnahme) | **Segmented control (flat)** | Select, radio buttons |
| 8 | anything else: 6+ options, long/dynamic/user-generated labels, a form value with 4+ options, a rarely changed setting, tight space | **Select (pop-up)** with a sensible default | Segmented control |

### Segmented control vs. select – the tie-breakers

- MUST use a **select** when any of these is true: more than 5 options · any label longer than ~12 characters · options come from data (categories, people) · it is a form value with 4 or more options · the option set can grow.
- MUST use a **segmented control** only when all are true: 2–5 options · one-word nouns · equally important · the user compares them by switching back and forth.
- On mobile (iOS) max 3–4 segments; otherwise use a select/menu.
- Windows (Fluent): prefer a select („Dieser Monat ▾“) in the CommandBar.

### Segmented control vs. tab switcher – they look similar, they are not

- **Same data, different presentation** (period, unit, chart type, sort) → segmented control. It is **flat**: selected segment `segment-selected`, NEVER a shadow, border, gradient or glass.
- **Different content** (other table, other form, other panel) → tab switcher. It is **Liquid Glass** and sits centred at the top of the content, one per page.
- NEVER put a tab switcher inside a card; NEVER use a segmented control to swap whole panels.

### General rules for all selection controls

- Text-only OR icon-only per control – NEVER mix both in one control.
- Labels: short German nouns („Monat“, „Buchungen“); actions use verbs („Exportieren“).
- Selections and actions NEVER share one control.
- A choice always has a visible default; a select never starts empty unless the field is optional and says „Keine Auswahl“.
- Toolbar: at most three groups (leading title · centre view control · trailing actions + search last); at most one segmented control or tab switcher in the toolbar.
- Every control is keyboard-operable: radiogroup/radio (segmented), tablist/tab (tab switcher), combobox/listbox (select), menu (pull-down); 2px `focus-ring`.

### Forms & sheets – creating or editing a record

Reference pattern: „Neue Ausgabe“ (canvas: Muster · Neue Ausgabe erfassen). Apply it to every create/edit flow (Buchung, Budget, Sparziel).

**Domain rule:** the app has **no accounts**. Every Ausgabe is deducted from the budget of its category in the month of its date; every Einnahme adds to the money available in that month. NEVER add an account field, account column, account filter or transfer („Umbuchung“) type.

**Container**

- MUST open create/edit of one record in a **Sheet** (component `Sheet`): a scoped task in the current context. Entry point: the „+“ toolbar action, shortcut ⌘N / Ctrl+N.
- MUST show only one sheet at a time. NEVER open a sheet from a sheet – close the first, or use a full page for multi-step / long flows (> 8 fields or > 1 step).
- Web/macOS: centred glass dialog 520–560px wide over a `rgba(0,0,0,0.22)` scrim, no close „X“. iOS: sheet at the large detent without grabber (forms need full height), swipe-to-dismiss enabled. Windows: ContentDialog.
- Title = the task as a noun („Neue Ausgabe“, when editing „Ausgabe bearbeiten“) and MUST follow the chosen record type.

**Fields**

- Order: the one required field first and focused on open (the amount), then the most-changed fields, optional fields last.
- Only mark required fields when they are the exception („Pflichtfeld“ helper text); optional fields get the placeholder „Optional“. NEVER use asterisks.
- Web/macOS layout: labels **right-aligned in a 96px column**, fields left-aligned, 10px row gap. iOS: grouped inset list, label left / value right. Field width matches the expected input (amount 184px, date 148px, select for recurrence 132px, free text full width).
- Control per value: record type (2–3 options) → SegmentedControl · amount → `AmountField` · short text → `TextField` · category / recurrence → `Select` with a sensible default · date → `DateField` (default today) · long text → text area (2 lines) · boolean in the form → `Checkbox`.
- Amounts: `inputmode="decimal"`, de-DE format, right-aligned, tabular figures, „€“ as a suffix. The sign comes from the record type – NEVER let people type „−“.
- Validate on blur (not on every keystroke); show the message directly under the field in `danger-text` and give the field a `red-500` border. NEVER show errors before the first interaction.
- Context feedback (e.g. budget impact under the category) informs but NEVER blocks saving. Warn in yellow from 90 % budget use, red above 100 %.

**Actions**

- Web/macOS/Windows: buttons bottom-right, „Abbrechen“ (secondary) left of the primary button. iOS: ✕ (Abbrechen) top-left, ✓ (Hinzufügen, `brand-500`) top-right.
- Exactly one primary button. Its label is a verb: „Hinzufügen“ for new records, „Sichern“ when editing. NEVER „OK“, „Senden“ or „Speichern unter …“.
- Enter = primary, Esc = Abbrechen. The primary button is disabled until all required fields are valid.
- „Danach weitere erfassen“ is a `Checkbox` at the bottom-left of the sheet (desktop only).
- Closing with unsaved changes MUST ask: „Änderungen verwerfen?“ with „Verwerfen“ (destructive) and „Weiter bearbeiten“.
- After saving: close the sheet, show a `Toast` („Ausgabe hinzugefügt“ + „Widerrufen“), highlight the new row for 2 s.

### References

- Apple HIG – Segmented controls: https://developer.apple.com/design/human-interface-guidelines/segmented-controls
- Apple HIG – Tab views: https://developer.apple.com/design/human-interface-guidelines/tab-views
- Apple HIG – Pop-up buttons: https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons
- Apple HIG – Pull-down buttons: https://developer.apple.com/design/human-interface-guidelines/pull-down-buttons
- Apple HIG – Toolbars: https://developer.apple.com/design/human-interface-guidelines/toolbars
- Microsoft Fluent – Command bar: https://learn.microsoft.com/windows/apps/design/controls/command-bar
- Apple HIG – Sheets: https://developer.apple.com/design/human-interface-guidelines/sheets
- Apple HIG – Text fields: https://developer.apple.com/design/human-interface-guidelines/text-fields
- Apple HIG – Pickers: https://developer.apple.com/design/human-interface-guidelines/pickers

## Content

- UI language German, informal (du): „Lege dein erstes Projekt an“, „Prüfe den Umfang“.
- Short labels, nouns for segments („Woche“, „Monat“), verbs for actions („Exportieren“, „Neues Projekt“). No emoji.

## Iconography

- Line icons on a 24px grid, 1.8px stroke (2px at 16px), round caps and joins, `currentColor`. Filled variant only for the selected iOS tab.
- No brand icon set yet – use a consistent stroke set (e.g. SF Symbols on Apple platforms, Fluent icons on Windows) and keep sidebar icons in `brand-500`.

## Accessibility

- Text meets 4.5:1 on its grounds in both themes; `label-secondary` is the lightest allowed text colour.
- Focus: 2px solid `focus-ring` offset 2px on every focusable control.
- Touch targets ≥ 44px on mobile; status is never colour-only.

---

# Components

## Button

Flat action button in five variants and four sizes; the primary button is `brand-500` with `on-brand` text and never glows.

**Variants:** Primär `brand-500`/`on-brand` · Sekundär `fill`/`label` · Umrandet `surface` + 1px `border` · Text transparent/`link` · Löschen `red-100`/`red-700` · Deaktiviert `fill`/`label-disabled`.

**Sizes (desktop):** S 28px, `radius-sm`, 12px semibold · M 40px, `radius-md`, 14px semibold · L 48px, `radius-md`, 15px · XL 56px, `radius-pill`, 17px. Mobile buttons are always pill and ≥ 44px.

**Consumer provides:** label (verb or verb phrase, German, e.g. „Neues Projekt“), optional leading 16px line icon (gap `space-sm`), `disabled`, loading state (spinner replaces icon, label „Speichert …“).

**Do:** one primary per view · icon-only buttons get an `aria-label` · 2px `focus-ring`.
**Don't:** coloured or outer shadows (no glow) · white text on `brand-500` · a primary button for destructive actions.

**Use when:** one or two actions. 3+ related actions → PullDownButton; navigation → link or SidebarItem.

**Hierarchy (MUST):** exactly one Primär per view or sheet · secondary actions Sekundär · low-emphasis inline actions Text · destructive actions Löschen, and in a sheet or alert the destructive button never is the default (Enter).

**Placement:** sheets/dialogs bottom-right, „Abbrechen“ left of the primary · card headers top-right as S · toolbar actions are icon buttons (see Toolbar), never Primär.

**Labels:** a verb („Hinzufügen“, „Exportieren“, „Sichern“). NEVER „OK“, „Ja/Nein“, „Klicken Sie hier“.

## PullDownButton

Button that opens a menu of **actions** (not values). Label is a verb, followed by a chevron-down: „Exportieren ▾“ → CSV, PDF, Excel.

**Spec:** Secondary button (`fill`, `label`, M size, `radius-md`), label + 12px chevron-down with `space-xs` gap. The menu is a ContextMenu (glass). The button label never changes after a choice.

**Use when:** 3 or more related actions that would crowd the toolbar or card header.

**Use something else when:** 1–2 actions → separate buttons · the user picks a value that stays visible → **Select** · a toggle → Switch.

**Consumer provides:** label (verb), items (label, optional icon, optional shortcut, destructive flag – destructive items go last in `danger-text`); `aria-haspopup="menu"`, `aria-expanded`.

**Don't:** show the chosen action as the new label · use it for a value selection · put fewer than 3 items in it.

Reference: Apple HIG – Pull-down buttons (https://developer.apple.com/design/human-interface-guidelines/pull-down-buttons).

## SearchField

Stand-alone search input that is always pill-shaped (`radius-pill`) with a leading magnifier.

**Spec:** 40px tall (36px in macOS toolbars), `fill` background (inside the frosted toolbar: rgba(0,0,0,0.05)), padding `space-xl`, placeholder „Suchen“ in `label-secondary`, text `callout`.

**Placement:** trailing end of the toolbar (last item) on web and macOS; on Windows in the title bar (Fluent style, not pill); on iOS as a separate trailing search tab.

**Consumer provides:** placeholder, value, `aria-label`, optional keyboard hint (⌘K) as a pill `kbd` on the right.

**Don't:** square or medium-rounded search fields in the web CI.

**Use when:** searching the current list or the whole app. Filtering by known values → Filter chips or Select.

**MUST:** search as you type after 2 characters (debounce 200 ms) · Esc clears · show „Keine Treffer für „…““ with a way to reset.

**NEVER:** a separate „Suchen“ button · more than one search field per view.

## TextField

Single-line input for a small amount of text (Beschreibung, Name, E-Mail). Multi-line text uses a text area (2+ lines, same styling).

**Spec:** M height (40px), `surface`, `1px solid var(--border)`, `radius-md`, padding 0 `space-lg`, text `callout` in `label`, placeholder `label-disabled`. States: focus = border `focus-ring` + 2px `focus-ring` outline · error = `red-500` border + message below in `danger-text` (`footnote`) · disabled = `bg` fill, `label-disabled`. iOS: clear button (ⓧ) at the trailing end while editing.

**Label:** always a visible label (right-aligned label column in sheets, above the field in narrow layouts). The placeholder is a hint („z. B. REWE“ or „Optional“), NEVER the only label.

**MUST:** width matches the expected input · `autocomplete`/`inputmode` set to the content (email, tel, decimal) · secure field for passwords · validate on blur · logical tab order top to bottom.

**NEVER:** validate while typing · use a text field for choosing from a known list (→ Select) · put the unit inside the value (use a suffix, see AmountField).

**Consumer provides:** label, value, placeholder, `required`, error text, `inputmode`/`autocomplete`.

Reference: Apple HIG – Text fields (https://developer.apple.com/design/human-interface-guidelines/text-fields).

## AmountField

Currency input for money amounts (Betrag, Budget, Sparrate). It is the primary field of every booking form.

**Spec:** L height (48px), width ≈ 184px (fits 9.999.999,99), `surface`, `1px solid var(--border)`, `radius-md`. Value right-aligned, 17px semibold, `font-variant-numeric: tabular-nums`; currency „€“ as a suffix in `label-secondary`. Focus/error states as TextField. iOS: large centred amount (48px bold) above the form with the decimal pad.

**MUST:** `inputmode="decimal"` · parse and format de-DE („1.234,50“), accept „,“ and „.“ as decimal separators while typing · round to 2 decimals on blur · focus it when the sheet opens · derive the sign from the record type (Ausgabe negative, Einnahme positive).

**NEVER:** let people type „−“ or „€“ · show the sign inside the field · left-align amounts · use a stepper (+/−) for money.

**Consumer provides:** label, value (number, cents precision), currency (default EUR), error text.

Reference: Apple HIG – Text fields → „Use a number formatter to help with numeric data“ (https://developer.apple.com/design/human-interface-guidelines/text-fields).

## DateField

Date input: a typeable text field with a trailing S icon button that opens a calendar popover (macOS „textual“ date picker style).

**Spec:** M height (40px), width ≈ 148px, `surface`, `1px solid var(--border)`, `radius-md`, value `callout` with tabular figures in „TT.MM.JJJJ“. Trigger: S secondary icon button (28px, `fill`, `radius-sm`) with a calendar icon – same pattern as the Select trigger. Popover: glass, month grid, today outlined, selected day `brand-500` + `on-brand`. iOS: compact date picker (value in a `fill` capsule, opens the inline calendar).

**MUST:** default to today for new records · accept typed input („27.9.“, „27.09.26“) and normalise on blur · keyboard: arrow keys change the day in the popover, Enter selects, Esc closes.

**NEVER:** use three separate selects (Tag/Monat/Jahr) · use a Select with a list of dates · use a Stepper for choosing a single date (Stepper is only for moving the whole view period).

**Consumer provides:** label, value (ISO date), min/max, error text.

Reference: Apple HIG – Pickers → date pickers (https://developer.apple.com/design/human-interface-guidelines/pickers).

## Select

Dropdown field: the full field shows the value, and only the trigger on the right is an S secondary icon button with a chevron-down.

**Spec:** field 40px, `surface`, 1px `border`, `radius-md`, padding 0 5px 0 `space-lg`, value in `callout`. Trigger: 28×28px, `fill`, `radius-sm`, 12px chevron-down in `label`. Label above in `caption`/13px semibold.

**States:** focus = 2px `focus-ring` · error = `red-500` border + `danger-text` message · disabled = `bg` fill, `label-disabled`.

**Consumer provides:** label, value, options (opens a context menu styled list), `aria-labelledby`.

**Use when (any true):** 6 or more options · labels are long, dynamic or user-generated (categories, people) · it is a form value that is saved · the setting is changed rarely · space is tight (e.g. Windows CommandBar). Always show a sensible default value.

**Use something else when:** 2–5 short view options that users switch often → **SegmentedControl** · the menu contains actions → **PullDownButton** · on/off → Switch / Checkbox.

**Don't:** make the whole dropdown a button · use an up/down double chevron · use a Select to switch between tabs/panes.

Reference: Apple HIG – Pop-up buttons (https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons).

## SegmentedControl

Flat choice between 2–5 closely related, mutually exclusive options that change **how the current view is shown** (e.g. Monat / Quartal / Jahr). It never switches to other content – that is the TabSwitcher.

**Spec (flat – MUST):** track `fill-strong` (in the toolbar rgba(0,0,0,0.05)), `radius-pill`, 4px padding, 2px gap. Equal-width segments (≈84–88px desktop, flex on mobile), 32px tall, text-only nouns in `footnote`, weight 500. Selected: `segment-selected` background, weight 600, **`shadow-none`** – no box-shadow, no border, no gradient, no glass, no inset highlight. Unselected: transparent.

**Use when (all true):** 2–5 options · each label ≤ 1 short word · options are equally important · the user benefits from seeing all options at once · switching changes presentation (period, unit, chart type, sort) of the same data.

**Use something else when:** 6+ options, long or dynamic labels, a form value, a rarely changed setting → **Select** · switching between different panes/content → **TabSwitcher** · a list of actions → **PullDownButton** · stepping through consecutive periods → **Stepper** · app navigation → sidebar / tab bar.

**Placement:** centre group of the toolbar or top-right of a card header (web, macOS). Windows uses a Select instead („Dieser Monat ▾“).

**Consumer provides:** options, selected value, `aria-label`; renders as `role="radiogroup"` with `role="radio"` segments and arrow-key navigation.

**Don't:** add a shadow or glass to the selected segment · mix icons and text · use for navigation · mix actions and selections · exceed 5 segments on desktop / 3–4 on mobile.

Reference: Apple HIG – Segmented controls (https://developer.apple.com/design/human-interface-guidelines/segmented-controls). Full decision rules: README → „Interface Guidelines“.

## TabSwitcher

Liquid Glass pill that switches between 2–6 **separate panes of content** on the same page (e.g. Übersicht / Buchungen / Verträge of one budget). It looks related to the SegmentedControl but is a different component with a different job and a different style.

**Spec (glass – MUST):** track `radius-pill`, 3px padding, 2px gap, `glass-bg` + `backdrop-filter: blur(var(--glass-blur)) saturate(180%)` + `1px solid var(--glass-border)` + `shadow-tabs`. Tabs 32px tall, padding 0 16px, `radius-pill`, label `footnote`, weight 500. Selected tab: `tab-selected` background + `box-shadow: inset 0 1px 0 var(--tab-highlight)`, weight 600. Flat fallback (reduced transparency / Flat option): track `fill` + `1px solid var(--border)`, selected `surface` + `1px solid var(--border)`, no shadow.

**Use when:** the options are **places inside one page** that each show different content, not a different presentation of the same data · 2–6 tabs · labels are short nouns.

**Use something else when:** it only changes period/unit/chart type of the same data → **SegmentedControl** (flat) · more than 6 panes → sidebar section or Select · top-level app areas → sidebar (web/macOS) or tab bar (iOS).

**Placement:** centred at the top of the content (under or inside the toolbar band). Only one TabSwitcher per page, never inside a card.

**Consumer provides:** tabs, selected tab, `aria-label`; renders as `role="tablist"` with `role="tab"` + `aria-selected` + `aria-controls`, and the panes as `role="tabpanel"`.

**Don't:** use it as the SegmentedControl in a card header · put actions in it · nest it · mix icons and text.

Reference: Apple HIG – Tab views (https://developer.apple.com/design/human-interface-guidelines/tab-views): tab views present closely related panes, keep the count low (≈6), and are not for navigation between app areas.

## Switch

On/off toggle for settings that apply immediately.

**Spec:** 44×26px pill track, 22px white knob; on = `brand-500` track, off = `fill-strong`. Label on the left in `callout`, switch on the right. Mobile: 51×31px.

**Consumer provides:** label, checked state, change handler; renders `role="switch"` with `aria-checked`.

**Don't:** use for actions that need a Save button (use a checkbox) · put text inside the track.

**Use when:** the setting applies immediately (settings pages, notifications on/off).

**Use something else when:** the value is confirmed with „Hinzufügen/Sichern“ → Checkbox · more than two states → SegmentedControl or Select.

**MUST:** label describes the on state positively („Automatisch kategorisieren“) · show the result immediately.

## Checkbox

On/off choice that takes effect only when the surrounding form is confirmed („Danach weitere Ausgabe erfassen“, „Als Fixkosten markieren“).

**Spec:** 16px box, `radius-xs`/4px, `1px solid var(--label-disabled)` on `surface`; checked = `brand-500` fill with a `on-brand` check. Label to the right in `callout`, gap `space-sm`; the whole label is clickable. Focus: 2px `focus-ring`.

**Use when:** a boolean inside a form with „Hinzufügen/Sichern“ · multiple independent options in a list.

**Use something else when:** the change applies immediately (settings) → **Switch** · one of several exclusive options → SegmentedControl (2–3) or Select.

**MUST:** label describes the checked state positively („Beleg anhängen“, not „Keinen Beleg“) · `role="checkbox"` / native input with `aria-checked`.

**NEVER:** use a checkbox for an instant action · use a Switch inside a form that needs confirming.

**Consumer provides:** label, checked, disabled.

Reference: Apple HIG – Toggles → checkboxes (https://developer.apple.com/design/human-interface-guidelines/toggles).

## Sheet

Modal glass dialog for one scoped task in the current context – creating or editing a single record („Neue Ausgabe“). Reference pattern: README → „Forms & sheets“.

**Spec (web/macOS):** 520–560px wide, centred over a `rgba(0,0,0,0.22)` scrim. Glass: `glass-bg` + blur `glass-blur` + `1px solid var(--glass-border)` + `shadow-glass`, `radius-lg`. Header: title `headline` (task as noun) + optional one-line subtitle in `footnote`/`label-secondary`, padding `space-3xl`. Body: form with a right-aligned 96px label column, 10px row gap. Footer: optional Checkbox left; „Abbrechen“ (secondary) + one primary button right, gap `space-sm`. No close „X“, no divider lines.

**Platforms:** iOS → large detent, no grabber, ✕ top-left, ✓ (`brand-500`) top-right, title centred, grouped list · Windows → Fluent ContentDialog (buttons bottom, primary left of „Abbrechen“ per Fluent).

**Use when:** one record, ≤ 8 fields, one step, the user returns to where they were.

**Use something else when:** multiple steps or > 8 fields → full page · a quick yes/no → alert dialog · repeated input while watching results → side panel · pure information → Notification/Toast.

**MUST:** focus the first required field on open · Enter = primary, Esc = cancel · disable the primary button until valid · ask „Änderungen verwerfen?“ when closing with changes · trap focus inside and return it to the trigger on close · `role="dialog"`, `aria-modal="true"`, `aria-labelledby` = title.

**NEVER:** open a sheet from a sheet · use „OK“ as the primary label · put more than one primary button · close on scrim click when there are unsaved changes.

**Consumer provides:** title, optional subtitle, form content, primary label (verb), `onSubmit`, `onCancel`, dirty state.

Reference: Apple HIG – Sheets (https://developer.apple.com/design/human-interface-guidelines/sheets).

## SidebarItem

Navigation row in the web/macOS sidebar: icon always `brand-500`, text always `label`, the active row on a light-grey fill.

**Spec:** 36px tall, padding 0 10px, radius 10px, gap `space-md`, 18px line icon in `brand-500`, label `callout` 500 (active 600). Active = `fill-strong` background + `aria-current="page"`. Optional trailing count (`label-secondary`) or badge (`red-500`, white). Section headers `caption` in `label-secondary`. Favourites use a 10px status-coloured dot instead of an icon.

**Sidebar container:** 256px, edge-to-edge (full height, no floating/inset, no shadow), `sidebar-bg`, 1px `separator` on the right. The collapse button sits in the sidebar's top row, right-aligned (macOS: next to the window buttons).

**Consumer provides:** icon, label, href, active state, optional count/badge.

**Don't:** colour the active row orange · grey out icons of inactive rows.

**Use when:** top-level app areas on web/macOS (Übersicht, Budget, Buchungen, Planung, Sparziele, Berichte). Max. 8 primary items; secondary lists (e.g. „Kategorien“ with remaining budget) go into a titled section.

**NEVER:** use the sidebar for actions („Neue Buchung“ belongs in the toolbar) · replace it with a segmented control or tab switcher · nest deeper than one level.

## Toolbar

One uniform frosted band across the top of the content area, grouped per Apple HIG into leading, centre and trailing.

**Spec:** 64px (macOS 60px), full content width, `toolbar-bg` + `backdrop-filter: blur(var(--toolbar-blur)) saturate(180%)`, 1px `separator` below; content scrolls underneath. Controls inside sit on rgba(0,0,0,0.05) pill fills (dark: rgba(255,255,255,0.08)).

**Groups (max three):** leading = page title (`title-2`, ≤ 15 characters, never the app name) · centre = flat segmented control for view options OR the glass tab switcher for panes (never both) · trailing = borderless icon actions (Neu, Filter, Teilen, Mitteilungen) in one pill group, then the search field last.

**Rules:** icons over text; a text-labelled action is separated from icon actions; no tinted/orange controls in the toolbar; every action is also reachable from a menu. The sidebar collapse button lives in the sidebar, not here.

**Flat variant:** solid `bg` band + `separator`, fills `fill-strong`.

**MUST:** the create action („+“, ⌘N) is the first icon in the trailing group · max. 4 icon actions, the rest in a „…“ menu · every icon action has a tooltip with its shortcut.

**NEVER:** a Primär (orange) button in the toolbar · a second toolbar row · the app name as title.

## ContextMenu

Liquid Glass menu for actions on the current item (right-click, "…" buttons, select option lists).

**Spec:** 220–240px wide, 6px padding, radius 14px, `glass-bg` + blur `glass-blur` + 1px `glass-border` + `shadow-glass`. Items 28–30px, `radius-sm`, `footnote` 500 in `label`; highlighted item `brand-500` + `on-brand`; shortcut right-aligned. Destructive action last, after a `separator`, in `danger-text`. Mobile: 48px items, radius 24px, pill highlights.

**Consumer provides:** items (label, optional icon/shortcut, destructive flag), anchor position; opens upward when there is no room below.

**Flat variant:** `surface` + 1px `border`, no blur/shadow.

**Use when:** actions on one item (row, card) via right-click or „…“. The same actions MUST also be reachable another way (toolbar, detail view).

**MUST:** order = most frequent first, grouped with separators, destructive last · shortcuts shown right · max. ~10 items, deeper lists as submenus (›) one level only.

**NEVER:** put selections (values) in a context menu – that is a Select.

## Notification

Glass alert card that appears top-right (below the toolbar) for important, time-bound information.

**Spec:** 360px, padding 14px, radius 20px, glass (`glass-bg`, `glass-blur`, `glass-border`, `shadow-glass`). App tile 36px (`brand-500`, radius 10px) or a status icon disc, title 14px semibold, time right in `label-secondary`, body `footnote`. Optional two actions (primary dark/`label` fill + secondary `fill`).

**Inline alternative:** for persistent page-level states use a flat inline banner (-100 tint + -900 text, `radius-md`).

**Consumer provides:** title, body, time, icon/tile, optional actions, dismiss.

**Flat variant:** `surface` + 1px `border`.

**Use when:** something important happened that the user did not trigger (budget exceeded, import finished). Confirmation of the user's own action → Toast.

**MUST:** max. one visible at a time · auto-hide after 8 s unless it has actions · also listed in the notification centre (bell).

**NEVER:** use it for errors in a form (show those at the field).

## Toast

Short-lived confirmation as a glass pill at the bottom centre of the content area.

**Spec:** `radius-pill`, padding 10px 18px 10px 12px, glass (`glass-bg`, `glass-blur`, `glass-border`, `shadow-glass`). 22px status disc (success `green-500` with `green-900` check), one line in 14px semibold, optional undo button (`fill`, pill, 28px). Auto-dismiss after ~4 s; `role="status"`.

**Consumer provides:** message, status, optional action.

**Flat variant:** solid inverse pill (light: `label` background with white text; dark: `bg`-light pill with `label` text).

**Use when:** confirming an action the user just did („Ausgabe hinzugefügt“, „Buchung gelöscht“), ideally with „Widerrufen“.

**MUST:** one line, past tense, ≤ 40 characters · offer „Widerrufen“ for deletions and bulk changes instead of a confirmation dialog.

**NEVER:** use for errors that need action (→ inline message or alert) · stack more than one.

## StatusBadge

Project and task status as a coloured dot plus a word, or as a tinted tag; counters as red pills.

**Status dots (8px + label):** Aktiv `green-500` · Review `blue-500` · Pausiert `yellow-500` · Risiko `red-500`. Always with the word – colour alone never carries meaning.

**Tags:** 3px 10px padding, `radius-xs`, `caption`; background -100 tint, text -700 (Erledigt green, In Arbeit blue, Wartet yellow, Blockiert red, Neu purple). Mobile risk chip: pill.

**Counter badge:** `red-500` pill, white 12px bold, min 20px; neutral counts in `label-secondary` text without a pill.

**Consumer provides:** status key, label, optional count.

**Note:** in dark mode keep the -500 dots; tags use darker tints (e.g. rgba of the -500 at 20 %) with light text.

**MUST:** the same status always uses the same colour and word across the app · budget states: im Rahmen `green-500`, ab 90 % `yellow-500`, überschritten `red-500`.

**NEVER:** colour alone · more than one badge per row.

## KpiCard

Flat metric card: label, large number, and either a delta line or a meter.

**Spec:** `surface` on `bg`, `radius-xl` (macOS `radius-lg` + 1px `separator`), padding 18px 20px, no shadow. Label 13px `label-secondary`; value 32px bold, letter-spacing -0.03em (mobile 28px); delta 12px semibold in `success-text` / `danger-text`; meter 6px pill, track `fill`, value `brand-500` (budget) or `blue-500` (utilisation).

**Layout:** four in a row on desktop (gap `space-2xl`), 2×2 on mobile.

**Consumer provides:** label, value, unit, delta (with direction) or percentage.

**Don't:** invent sample numbers in production · colour the whole card.

**Use when:** 2–4 headline numbers for the current period. More → a table or chart.

**MUST:** value with unit and period context („für 4 verbleibende Tage“) · deltas compare to the previous period and name it („ggü. August“) · negative-is-good metrics (Ausgaben) use `danger-text` for increases.

**NEVER:** more than 4 per row · a chart inside the KPI card (use a chart card).

## SelectionGuide

Decision table: which selection or navigation control to use. This is a guideline card, not a component to render. The binding rules are in the README → „Interface Guidelines“; this card mirrors them.

Order of checks (stop at the first match):
1. Navigates between app areas → Sidebar (web/macOS) · NavigationView (Windows) · Tab bar (iOS)
2. Starts actions → Button (1–2) · PullDownButton (3+)
3. Switches between separate panes of one page (2–6) → TabSwitcher (glass)
4. Steps through consecutive periods → Stepper ‹ ›
5. On/off → Switch (instant) · Checkbox (in forms with „Speichern“)
6. Multi-select filter → Filter chips
7. 2–5 short options, same data, switched often → SegmentedControl (flat)
8. Everything else (6+, long/dynamic labels, form values, rare settings) → Select

