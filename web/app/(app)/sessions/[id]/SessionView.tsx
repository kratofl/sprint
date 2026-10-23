'use client'

import { useRouter } from 'next/navigation'
import { IconActivity, IconChartLine, IconFlag } from '@tabler/icons-react'
import { AccountAvatar } from '@/components/app/account'
import { ColumnChart } from '@/components/app/charts'
import { DataTable, type Column } from '@/components/app/data-table'
import { CardHead, Group, Row, RowText, listCardClass } from '@/components/app/grouped'
import { HeroMetric } from '@/components/app/hero-metric'
import { MetricStrip } from '@/components/app/metric-strip'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState, ErrorState } from '@/components/app/states'
import { TraceChart } from '@/components/app/trace-chart'
import { Badge } from '@/components/ui/badge'
import { formatDelta, formatLapTime, sessionLaps, sessionSummary, type SessionLap } from '@/lib/laps'
import { drivenAt } from '@/lib/overview'
import { formatDay } from '@/lib/period'
import type { Loaded, SessionDetail, SessionTelemetry } from '@/lib/records'
import { formatClock, tracePoints } from '@/lib/telemetry'
import EngineerAccess from './EngineerAccess'

const CHARTED_LAPS = 20

// A session's page: best lap over the lap-time chart beside who it belongs to (or,
// for the driver, the engineer access card), the session's figures, the lap table
// and the recorded telemetry. A live session offers "Watch live".
export default function SessionView({ session, telemetry }: { session: SessionDetail; telemetry: Loaded<SessionTelemetry> }) {
  const router = useRouter()
  const samples = telemetry.kind === 'ok' ? telemetry.data.samples : []
  const laps = sessionLaps(session.data, telemetry.kind === 'ok' ? telemetry.data.laps : [])
  const summary = sessionSummary(laps, samples)
  const points = samples.length > 0 ? tracePoints(samples, samples[0].timestamp) : []
  // More columns than this stop being readable at the card's width.
  const charted = laps.slice(-CHARTED_LAPS)

  return (
    <>
      <PageHeader
        title={session.track}
        caption={`${session.car} · ${session.sessionType} · ${formatDay(drivenAt(session))} · ${session.game}`}
        primaryAction={
          session.isLive
            ? { label: 'Watch live', icon: <IconActivity />, onClick: () => router.push(`/sessions/${encodeURIComponent(session.id)}/live`) }
            : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] lg:items-start">
        <HeroMetric
          label="Best lap"
          value={summary.bestTime === null ? '—' : formatLapTime(summary.bestTime)}
          empty={summary.bestTime === null}
          supporting={
            summary.bestLap === null ? (
              'No valid lap recorded yet'
            ) : (
              <>
                Lap <strong>{summary.bestLap}</strong> of {summary.laps}
              </>
            )
          }
        >
          {charted.length === 0 ? null : (
            <ColumnChart
              title={laps.length > CHARTED_LAPS ? `Lap times, last ${CHARTED_LAPS} laps` : 'Lap times'}
              valueLabel="Lap time"
              formatValue={formatLapTime}
              formatTick={formatClock}
              tickScale="duration"
              columns={charted.map((lap) => ({ label: String(lap.lap), value: lap.time, highlight: lap.lap === summary.bestLap }))}
            />
          )}
        </HeroMetric>

        {session.isMine ? (
          <EngineerAccess sessionId={session.id} access={session.engineerAccess} />
        ) : (
          <Group title="Driver">
            <Row>
              <AccountAvatar account={session.driver} size="sm" />
              <RowText title={session.driver.displayName} meta="You engineer for this driver" />
              {session.isLive ? <Badge tone="red">Live</Badge> : null}
            </Row>
          </Group>
        )}
      </div>

      <MetricStrip
        cells={[
          { label: 'Laps', value: String(summary.laps), empty: summary.laps === 0, note: `${summary.validLaps} valid` },
          {
            label: 'Top speed',
            value: summary.topSpeedKph === null ? '—' : `${Math.round(summary.topSpeedKph)} km/h`,
            empty: summary.topSpeedKph === null,
          },
          {
            label: 'Recorded',
            value: summary.durationSeconds === null ? '—' : formatClock(summary.durationSeconds),
            empty: summary.durationSeconds === null,
            note: 'of live telemetry',
          },
        ]}
      />

      <DataTable
        title="Laps"
        columns={lapColumns(summary.bestTime)}
        rows={laps}
        rowKey={(lap) => String(lap.lap)}
        empty={<EmptyState icon={IconFlag} title="No laps yet" body="Completed laps appear here as they are driven and synced." />}
      />

      <section className={listCardClass} aria-label="Telemetry">
        <CardHead title="Telemetry" description={samples.length > 0 ? 'Recorded while the driver streamed with cloud sync on' : undefined} />
        {telemetry.kind === 'unavailable' ? (
          <ErrorState title="Couldn’t load the telemetry" body={telemetry.message} />
        ) : points.length === 0 ? (
          <EmptyState
            icon={IconChartLine}
            title="No telemetry recorded"
            body="Telemetry is recorded while the driver is signed in on the desktop app with cloud sync on."
          />
        ) : (
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <TraceChart title="Speed" summary={`up to ${Math.round(summary.topSpeedKph ?? 0)} km/h`} points={points} unit=" km/h" series={[{ key: 'speed', label: 'Speed', color: 'var(--brand-500)' }]} />
            <TraceChart
              title="Throttle and brake"
              summary="throttle and brake, 0 to 100 %"
              points={points}
              unit=" %"
              yDomain={[0, 100]}
              series={[
                { key: 'throttle', label: 'Throttle', color: 'var(--green-500)' },
                { key: 'brake', label: 'Brake', color: 'var(--red-500)' },
              ]}
            />
            <TraceChart title="Gear" summary="gear over the session" points={points} series={[{ key: 'gear', label: 'Gear', color: 'var(--brand-500)', step: true }]} />
            <TraceChart title="RPM" summary="engine speed over the session" points={points} unit=" rpm" series={[{ key: 'rpm', label: 'RPM', color: 'var(--brand-500)' }]} />
          </div>
        )}
      </section>
    </>
  )
}

// The lap table: number, time, gap to the best valid lap, sectors and validity.
function lapColumns(best: number | null): readonly Column<SessionLap>[] {
  return [
    { header: 'Lap', width: 'w-16', cell: (lap: SessionLap) => <span className="tabular-nums">{lap.lap}</span> },
    { header: 'Time', width: 'w-28', cell: (lap: SessionLap) => <span className="font-medium tabular-nums">{formatLapTime(lap.time)}</span> },
    {
      header: 'Gap',
      width: 'w-24',
      cell: (lap: SessionLap) => <span className="text-label-secondary tabular-nums">{best === null || lap.time <= 0 ? '—' : formatDelta(lap.time - best)}</span>,
    },
    {
      header: 'Sectors',
      hideOnPhone: true,
      cell: (lap: SessionLap) => (
        <span className="text-label-secondary tabular-nums">{lap.sectors.length === 0 ? '—' : lap.sectors.map((sector) => sector.toFixed(3)).join(' · ')}</span>
      ),
    },
    {
      header: 'Valid',
      width: 'w-24',
      align: 'end',
      cell: (lap: SessionLap) => (lap.valid ? <Badge tone="green">Valid</Badge> : <Badge tone="yellow">Invalid</Badge>),
    },
  ]
}
