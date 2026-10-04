import type { SessionSummary, SetupSummary } from './gql/generated'
import { formatMonth, isInMonth, type Month } from './period.ts'

// One headline number on the overview. `empty` means nothing has been synced
// yet, so there is no honest number to show (DESIGN.md: never invent figures).
export type Kpi =
  | { kind: 'value'; label: string; value: string; caption: string }
  | { kind: 'empty'; label: string; caption: string }

// The four overview KPIs for a month: sessions driven, distinct tracks and
// cars in that month, and the size of the setup bank.
export function overviewKpis(
  sessions: readonly SessionSummary[],
  setups: readonly SetupSummary[],
  month: Month,
): readonly Kpi[] {
  const period = `in ${formatMonth(month)}`

  const sessionKpis = (): Kpi[] => {
    if (sessions.length === 0) {
      const caption = 'No sessions synced yet'
      return [
        { kind: 'empty', label: 'Sessions', caption },
        { kind: 'empty', label: 'Tracks', caption },
        { kind: 'empty', label: 'Cars', caption },
      ]
    }
    const inMonth = sessions.filter((session) => isInMonth(session.createdAt, month))
    const distinct = (pick: (session: SessionSummary) => string) => String(new Set(inMonth.map(pick)).size)
    return [
      { kind: 'value', label: 'Sessions', value: String(inMonth.length), caption: period },
      { kind: 'value', label: 'Tracks', value: distinct((session) => session.track), caption: period },
      { kind: 'value', label: 'Cars', value: distinct((session) => session.car), caption: period },
    ]
  }

  const setupKpi: Kpi =
    setups.length === 0
      ? { kind: 'empty', label: 'Setups', caption: 'No setups saved yet' }
      : { kind: 'value', label: 'Setups', value: String(setups.length), caption: 'in your setup bank' }

  return [...sessionKpis(), setupKpi]
}

// One bar of the session-activity chart: a 7-day slice of the month.
export type WeekBar = { label: string; count: number }

// Sessions per 7-day slice of a month (1–7, 8–14, …, 29–end), for the chart.
export function sessionsPerWeek(sessions: readonly SessionSummary[], month: Month): readonly WeekBar[] {
  const daysInMonth = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate()
  const bars: WeekBar[] = []
  for (let first = 1; first <= daysInMonth; first += 7) {
    const last = Math.min(first + 6, daysInMonth)
    bars.push({ label: first === last ? `${first}` : `${first}–${last}`, count: 0 })
  }
  for (const session of sessions) {
    if (!isInMonth(session.createdAt, month)) continue
    const day = new Date(session.createdAt).getUTCDate()
    bars[Math.floor((day - 1) / 7)].count += 1
  }
  return bars
}

// Rows sorted newest first by an ISO timestamp field.
export function newestFirst<Row>(rows: readonly Row[], stamp: (row: Row) => string): readonly Row[] {
  return [...rows].sort((a, b) => stamp(b).localeCompare(stamp(a)))
}
