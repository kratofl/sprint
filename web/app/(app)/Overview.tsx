'use client'

import { useState } from 'react'
import { IconAdjustmentsHorizontal, IconChartBar, IconHistory } from '@tabler/icons-react'
import { AccountAvatar } from '@/components/app/account'
import { ColumnChart } from '@/components/app/charts'
import { Disclosure, Group, Row, RowText } from '@/components/app/grouped'
import { HeroMetric } from '@/components/app/hero-metric'
import { MetricStrip } from '@/components/app/metric-strip'
import { PageHeader } from '@/components/app/page-header'
import { PeriodStepper } from '@/components/app/period-stepper'
import { EmptyState } from '@/components/app/states'
import { StatusDot } from '@/components/ui/badge'
import { drivenAt, newestFirst, overviewKpis, sessionsPerWeek, type Kpi } from '@/lib/overview'
import { formatDay, formatMonth, shiftMonth, type Month } from '@/lib/period'
import type { Overview as OverviewData } from '@/lib/records'

const QUICK_ACCESS = [
  { href: '/sessions', title: 'Sessions', meta: 'Sessions recorded and synced from the desktop app' },
  { href: '/setups', title: 'Setups', meta: 'Car setups saved from the desktop app' },
  { href: '/engineer', title: 'Race engineers', meta: 'Invite engineers, or see whom you engineer for' },
  { href: '/dash', title: 'Dash editor', meta: 'Wheel display layouts' },
] as const

// Overview, in the Overview page shape: who is driving right now (only while
// someone is), then the month's sessions as the hero metric over its per-week
// chart, beside the most recent sessions; then tracks, cars and the setup bank as
// a metric strip; then recent setups beside quick access. The hero, strip and
// chart follow the month chosen in the toolbar stepper and count only the user's
// own driving; the recent list includes the drivers they engineer for. `data` is
// loaded by page.tsx.
export default function Overview({ initialMonth, data }: { initialMonth: Month; data: OverviewData }) {
  const { sessions, setups, live } = data
  const [month, setMonth] = useState(initialMonth)
  const [hero, ...strip] = overviewKpis(sessions, setups, month)
  const weeks = sessionsPerWeek(sessions, month)
  const busiest = Math.max(...weeks.map((week) => week.count))
  const recentSessions = newestFirst(sessions, drivenAt).slice(0, 6)
  const recentSetups = newestFirst(setups, (setup) => setup.updatedAt).slice(0, 4)

  return (
    <>
      <PageHeader
        title="Overview"
        scope={
          <PeriodStepper
            label={formatMonth(month)}
            onPrevious={() => setMonth(shiftMonth(month, -1))}
            onNext={() => setMonth(shiftMonth(month, 1))}
            previousLabel="Previous month"
            nextLabel="Next month"
          />
        }
      />

      {live.length > 0 ? (
        <Group title="Live now" trailing={`${live.length}`}>
          {live.map((session) => (
            <Row key={session.sessionId} href={`/sessions/${encodeURIComponent(session.sessionId)}/live`}>
              <AccountAvatar account={session.driver} size="sm" />
              <RowText title={`${session.driver.displayName} · ${session.track}`} meta={`${session.car} · ${session.sessionType}`} />
              {session.connected ? <StatusDot status="green">Live</StatusDot> : <StatusDot status="yellow">Reconnecting</StatusDot>}
              <Disclosure />
            </Row>
          ))}
        </Group>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <HeroMetric
          label={`${hero.label} in ${formatMonth(month)}`}
          value={kpiValue(hero)}
          empty={hero.kind === 'empty'}
          supporting={hero.kind === 'empty' ? hero.caption : <>Busiest week: <strong>{busiest === 0 ? 'none' : busiest === 1 ? '1 session' : `${busiest} sessions`}</strong></>}
        >
          {busiest === 0 ? (
            <EmptyState
              icon={IconChartBar}
              title={`No sessions in ${formatMonth(month)}`}
              body="Sessions you drive with the desktop app show up here once they sync."
            />
          ) : (
            <ColumnChart
              title={`Sessions per week in ${formatMonth(month)}`}
              valueLabel="Sessions"
              columns={weeks.map((week) => ({ label: week.label, value: week.count, highlight: week.count === busiest }))}
            />
          )}
        </HeroMetric>

        <Group title="Recent sessions" action={{ label: 'Show all', href: '/sessions' }}>
          {recentSessions.length === 0 ? (
            <EmptyState icon={IconHistory} title="No sessions yet" body="Drive with the Sprint desktop app and your sessions appear here." />
          ) : (
            recentSessions.map((session) => (
              <Row key={session.id} href={`/sessions/${encodeURIComponent(session.id)}`}>
                <RowText title={session.track} meta={session.isMine ? `${session.car} · ${session.sessionType}` : `${session.driver.displayName} · ${session.car}`} />
                <span className="shrink-0 text-footnote text-label-secondary tabular-nums">{formatDay(drivenAt(session))}</span>
              </Row>
            ))
          )}
        </Group>
      </div>

      <MetricStrip cells={strip.map((kpi) => ({ label: kpi.label, value: kpiValue(kpi), empty: kpi.kind === 'empty', note: kpi.caption }))} />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Group title="Recent setups" action={{ label: 'Show all', href: '/setups' }}>
          {recentSetups.length === 0 ? (
            <EmptyState icon={IconAdjustmentsHorizontal} title="No setups yet" body="Setups you save in the desktop app appear here." />
          ) : (
            recentSetups.map((setup) => (
              <Row key={setup.id}>
                <RowText title={setup.name} meta={`${setup.car} · ${setup.track}`} />
                <span className="shrink-0 text-footnote text-label-secondary tabular-nums">{formatDay(setup.updatedAt)}</span>
              </Row>
            ))
          )}
        </Group>

        <Group title="Quick access">
          {QUICK_ACCESS.map((entry) => (
            <Row key={entry.href} href={entry.href}>
              <RowText title={entry.title} meta={entry.meta} />
              <Disclosure />
            </Row>
          ))}
        </Group>
      </div>
    </>
  )
}

// A KPI's number, or a dash when there is no honest number to show.
function kpiValue(kpi: Kpi): string {
  return kpi.kind === 'value' ? kpi.value : '—'
}
