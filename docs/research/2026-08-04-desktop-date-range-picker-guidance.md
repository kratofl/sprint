# Desktop date-range picker guidance

Research date: 2026-08-04

## First-party findings

- Avalonia's `CalendarDatePicker` combines an editable date field with a drop-down calendar, and its documented empty state is represented by a nullable `SelectedDate` plus `PlaceholderText`. [Avalonia CalendarDatePicker guidance](https://docs.avaloniaui.net/controls/input/date-and-time/calendardatepicker)
- Avalonia exposes `SelectedDate`, `SelectedDateChanged`, `IsDropDownOpen`, `DisplayDateStart`, `DisplayDateEnd`, `PlaceholderText`, and the short/long date-format options on `CalendarDatePicker`. [Avalonia CalendarDatePicker API](https://docs.avaloniaui.net/api/avalonia/controls/calendardatepicker)
- Avalonia documents `Alt+Down` for opening the calendar and `Escape` for closing it, which makes the calendar affordance keyboard-discoverable without requiring segmented field navigation. [Avalonia CalendarDatePicker guidance](https://docs.avaloniaui.net/controls/input/date-and-time/calendardatepicker)
- Microsoft describes `CalendarDatePicker` as a contextual calendar for choosing one date, with a placeholder when no date is selected and support for constraining the selectable range. [Microsoft CalendarDatePicker](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/calendar-date-picker)
- Microsoft describes the separate `DatePicker` as a spinner-style control for entering a known date, while the contextual calendar picker is intended for choosing a date from a calendar. [Microsoft DatePicker](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/date-picker)
- Microsoft’s date-and-time guidance distinguishes a single-date `CalendarDatePicker` from `CalendarView` range selection. Sprint already has two independent inclusive endpoints, so two labeled single-date pickers preserve that contract without introducing a new multi-selection model. [Microsoft date and time controls](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/date-and-time)

## Sprint decision

Use two clearly labeled `CalendarDatePicker` controls, `From` and `To`, rather than raw segmented `DatePicker` fields. Each endpoint remains nullable and displays `Select date` when empty; the control uses the current culture’s short date format and first day of week. The existing filter handlers remain the source of truth: selecting a From date moves an older To date forward, selecting a To date moves a newer From date back, and the inclusive range remains valid. The controls retain normal focus, text entry, calendar-button, `Alt+Down`, and `Escape` behavior.
