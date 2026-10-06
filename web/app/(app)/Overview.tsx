'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconAdjustmentsHorizontal, IconChartBar, IconChevronRight, IconHistory } from '@tabler/icons-react'
import Page from '@/components/Page'
import MonthStepper from '@/components/MonthStepper'
import Table from '@/components/Table'
import { Card, EmptyState, KpiCard } from '@/components/Card'
import { sessionColumns, sessionTemplate } from '@/components/columns'
import { drivenAt, newestFirst, overviewKpis, sessionsPerWeek } from '@/lib/overview'
import { formatDay, formatMonth, type Month } from '@/lib/period'
import type { Overview as OverviewData } from '@/lib/records'

const QUICK_ACCESS = [
  { href: '/sessions', title: 'Sessions', meta: 'Sessions recorded and synced from the desktop app' },
  { href: '/setups', title: 'Setups', meta: 'Car setups saved from the desktop app' },
  { href: '/engineer', title: 'Race engineer', meta: "Join a driver's session as remote engineer" },
  { href: '/dash', title: 'Dash editor', meta: 'Wheel display layouts' },
] as const

// Overview: KPI row, session-activity chart, recent setups, recent sessions and
// quick access. KPIs and the chart follow the month chosen in the toolbar stepper.
// `data` is the signed-in user's sessions and setups, loaded by page.tsx.
export default function Overview({ initialMonth, data }: { initialMonth: Month; data: OverviewData }) {
  const { sessions, setups } = data
  const [month, setMonth] = useState(initialMonth)
  const kpis = overviewKpis(sessions, setups, month)
  const weeks = sessionsPerWeek(sessions, month)
  const busiest = Math.max(...weeks.map((week) => week.count))
  const recentSessions = newestFirst(sessions, drivenAt).slice(0, 8)
  const recentSetups = newestFirst(setups, (setup) => setup.updatedAt).slice(0, 3)

  return (
    <Page title="Overview" center={<MonthStepper value={month} onChange={setMonth} />}>
      <div className="kpi-row">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="split-row split-row-chart">
        <Card title="Session activity">
          {busiest === 0 ? (
            <EmptyState
              icon={IconChartBar}
              title={`No sessions in ${formatMonth(month)}`}
              body="Sessions you drive with the desktop app show up here once they sync."
            />
          ) : (
            <>
              <div className="chart-bars" role="img" aria-label={`Sessions per week in ${formatMonth(month)}`}>
                {weeks.map((week) => (
                  <div
                    key={week.label}
                    className="chart-bar"
                    data-highlight={week.count === busiest}
                    style={{ height: `${(week.count / busiest) * 100}%` }}
                    title={`${week.count} sessions`}
                  />
                ))}
              </div>
              <div className="chart-labels">
                {weeks.map((week) => (
                  <span key={week.label}>{week.label}</span>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card title="Recent setups" action={<Link href="/setups" className="card-link">Show all</Link>}>
          {recentSetups.length === 0 ? (
            <EmptyState
              icon={IconAdjustmentsHorizontal}
              title="No setups yet"
              body="Setups you save in the desktop app appear here."
            />
          ) : (
            recentSetups.map((setup) => (
              <div key={setup.id} className="list-row">
                <span className="list-row-text">
                  <span className="list-row-title">{setup.name}</span>
                  <span className="list-row-meta">
                    {setup.car} · {setup.track}
                  </span>
                </span>
                <span className="list-row-trail">{formatDay(setup.updatedAt)}</span>
              </div>
            ))
          )}
        </Card>
      </div>

      <div className="split-row fill-row">
        <Card title="Recent sessions" flush action={<Link href="/sessions" className="card-link">Show all</Link>}>
          <Table
            columns={sessionColumns}
            template={sessionTemplate}
            rows={recentSessions}
            rowKey={(session) => session.id}
            empty={
              <EmptyState
                icon={IconHistory}
                title="No sessions yet"
                body="Drive with the Sprint desktop app and your sessions appear here."
              />
            }
          />
        </Card>

        <Card title="Quick access">
          {QUICK_ACCESS.map((entry) => (
            <Link key={entry.href} href={entry.href} className="list-row">
              <span className="list-row-text">
                <span className="list-row-title">{entry.title}</span>
                <span className="list-row-meta">{entry.meta}</span>
              </span>
              <IconChevronRight className="list-row-trail" size={14} stroke={2} aria-hidden />
            </Link>
          ))}
        </Card>
      </div>
    </Page>
  )
}
