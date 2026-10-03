# Pattern: Neue Buchung erfassen

Binding reference for every create/edit flow. Rules come from `DESIGN.md` → „Forms & sheets“. Build it exactly like this; deviations need a written reason in the PR.

## Domain rule

There are **no accounts**. An Ausgabe is deducted from the budget of its Kategorie in the month of its Datum; an Einnahme increases the money available in that month. NEVER add an account field, column, filter or transfer type.

## Trigger

- Toolbar „+“ (first icon of the trailing group), shortcut ⌘N / Ctrl+N. iOS: „+“ in the top-right glass group.
- Opens a `Sheet`. The page behind is dimmed (`rgba(0,0,0,0.22)`) and inert.

## Structure (web / macOS)

| Order | Label | Component | Default | Rules |
|---|---|---|---|---|
| – | Title | `headline` | „Neue Ausgabe“ | follows Art: „Neue Einnahme“; editing: „Ausgabe bearbeiten“ |
| – | Subtitle | `footnote` | „Wird vom Budget September 2026 abgezogen.“ | month from Datum; Einnahme: „Erhöht das verfügbare Geld im September 2026.“ |
| 1 | Art | SegmentedControl (flat) | Ausgabe | Ausgabe · Einnahme – there are no accounts, so no transfer type |
| 2 | Betrag | AmountField (L, 184px) | empty, **focused** | only required field; sign from Art |
| 3 | Beschreibung | TextField (full width) | empty | suggests previous merchants; choosing one pre-fills Kategorie |
| 4 | Kategorie | Select (full width) | last category of this merchant, else none | helper below: budget impact bar + „Danach noch X € von Y € im Monat“ (yellow ≥ 90 %, red > 100 %) – never blocks |
| 5 | Datum | DateField (148px) | today | same row as Wiederholung |
| 6 | Wiederholung | Select (132px) | „Nie“ | Nie · Wöchentlich · Monatlich · Vierteljährlich · Jährlich |
| 7 | Notiz | Text area (2 lines) | placeholder „Optional“ | |
| 8 | Beleg | S secondary button „Datei anhängen …“ | – | PDF/JPG/PNG, max. 10 MB |

Layout: labels right-aligned in a 96px column, 12px gap to the field, 10px row gap, sheet 532px wide.

## Footer

- Left: Checkbox „Danach weitere Ausgabe erfassen“ (keeps Art, Kategorie, Datum; clears the rest; re-focuses Betrag).
- Right: „Abbrechen“ (secondary) · „Hinzufügen“ (primary; editing: „Sichern“).
- Primary disabled until Betrag > 0. Enter submits, Esc cancels.

## Behaviour

- Validate on blur; error text under the field in `danger-text`.
- Esc / Abbrechen with changes → alert „Änderungen verwerfen?“ – „Verwerfen“ (destructive) · „Weiter bearbeiten“ (default).
- After save: close sheet, Toast „Ausgabe hinzugefügt“ + „Widerrufen“ (5 s), highlight the new row in „Letzte Buchungen“ for 2 s, update KPIs and budget bars.

## iOS differences

- Sheet at the large detent, no grabber; swipe down dismisses (with the same confirmation when dirty).
- ✕ top-left (Abbrechen), ✓ top-right in `brand-500` (Hinzufügen), title centred.
- Art as a full-width pill segmented control; Betrag as a large centred number (48px bold) with the decimal pad.
- Other fields in a grouped inset list: Beschreibung (text + clear button), Kategorie/Wiederholung as pop-up menus (value + ⌃⌄), Datum as compact date picker.
