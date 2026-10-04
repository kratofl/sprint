// Calendar months for the toolbar stepper, independent of the viewer's time
// zone. `month` is 0-based like Date.
export type Month = { year: number; month: number }

export function monthOf(date: Date): Month {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() }
}

// Moves a month forwards or backwards, rolling over year boundaries.
export function shiftMonth({ year, month }: Month, delta: number): Month {
  const index = year * 12 + month + delta
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 }
}

// Whether an ISO timestamp falls inside a month (UTC).
export function isInMonth(iso: string, { year, month }: Month): boolean {
  const date = new Date(iso)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month
}

const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })

// "September 2026"
export function formatMonth({ year, month }: Month): string {
  return monthFormat.format(new Date(Date.UTC(year, month, 1)))
}

// "26 Sept" — table date column.
export function formatDay(iso: string): string {
  return dayFormat.format(new Date(iso))
}
