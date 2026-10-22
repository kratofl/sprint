'use client'

import { useEffect, useReducer, type ReactNode } from 'react'
import Link from 'next/link'
import { IconFlag, IconLock, IconPlugConnectedX } from '@tabler/icons-react'
import { CardHead, Group, Row, RowText, listCardClass } from '@/components/app/grouped'
import { MetricStrip } from '@/components/app/metric-strip'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState, ErrorState } from '@/components/app/states'
import { TraceChart } from '@/components/app/trace-chart'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge, StatusDot, type DotStatus } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDelta, formatLapTime } from '@/lib/laps'
import { endsStream, initialLiveState, liveReducer, parseLiveEvent, STALE_AFTER_MS, TRACE_GAP_MS, TRACE_WINDOW_MS, type LiveState } from '@/lib/live'
import type { SessionDetail } from '@/lib/records'
import { formatGear, tracePoints } from '@/lib/telemetry'

const EVENTS = ['snapshot', 'samples', 'lap', 'ended', 'revoked', 'unavailable'] as const
const WINDOW: readonly [number, number] = [-TRACE_WINDOW_MS / 1000, 0]

// The live view of one session: readouts, the last 30 s as rolling traces and the
// laps so far, from the SSE stream the web bridges (app/api/live). Everything on
// screen changes only when data arrives; there is no animation loop. The state
// model (lib/live.ts) decides what is shown when the stream drops, ends or the
// driver takes access away.
export default function LiveView({ session }: { session: SessionDetail }) {
  const [state, dispatch] = useReducer(liveReducer, initialLiveState)
  const sessionPath = `/sessions/${encodeURIComponent(session.id)}`

  useEffect(() => {
    const source = new EventSource(`/api/live/${encodeURIComponent(session.sessionKey)}`)
    const onEvent = (message: MessageEvent<string>) => {
      const event = parseLiveEvent(message.type, message.data)
      if (event === null) return
      dispatch(event)
      if (endsStream(event)) source.close()
    }
    for (const name of EVENTS) source.addEventListener(name, onEvent)
    // CONNECTING: the browser retries on its own. CLOSED: it gave up (e.g. the
    // sign-in expired and the request was redirected).
    source.onerror = () => dispatch(source.readyState === EventSource.CLOSED ? { type: 'connection-closed' } : { type: 'connection-lost' })
    return () => source.close()
  }, [session.sessionKey])

  // No sample for a while: say so instead of showing old numbers as current.
  useEffect(() => {
    if (!state.receiving) return
    const timer = window.setTimeout(() => dispatch({ type: 'stale' }), STALE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [state.latest, state.receiving])

  const status = statusOf(state)
  const driver = session.isMine ? 'your desktop' : `${session.driver.displayName}’s desktop`

  return (
    <>
      <PageHeader
        title={session.track}
        caption={`${session.isMine ? 'You' : session.driver.displayName} · ${session.car} · ${session.sessionType}`}
        actions={<StatusDot status={status.dot}>{status.label}</StatusDot>}
      />

      {state.status.kind === 'revoked' ? (
        <Blocked icon={IconLock} title="You can’t see this session anymore" body={state.status.reason} action={<LinkButton href="/sessions">Back to sessions</LinkButton>} />
      ) : state.status.kind === 'signed-out' ? (
        <Blocked
          icon={IconLock}
          title="Your sign-in expired"
          body="Sign in again to keep watching."
          action={<LinkButton href={`/sign-out?next=${encodeURIComponent(`${sessionPath}/live`)}`}>Sign in</LinkButton>}
        />
      ) : state.status.kind === 'failed' ? (
        <Blocked icon={IconPlugConnectedX} title="The live connection closed" body={state.status.reason} action={<LinkButton href={`${sessionPath}/live`}>Reload</LinkButton>} />
      ) : state.status.kind === 'ended' && state.latest === null ? (
        // Ended before anything arrived (usually: not live when the page opened). No empty readouts.
        <section className={`${listCardClass} flex min-h-80 flex-col`}>
          <EmptyState icon={IconFlag} title="Nothing to watch live" body={state.status.reason} action={<LinkButton href={sessionPath}>View the session</LinkButton>} />
        </section>
      ) : (
        <Readouts state={state} sessionPath={sessionPath} driver={driver} />
      )}
    </>
  )
}

// The live data, with a banner whenever it is not current.
function Readouts({ state, sessionPath, driver }: { state: LiveState; sessionPath: string; driver: string }) {
  const latest = state.latest
  const points = latest === null ? [] : tracePoints(state.trace, latest.timestamp, TRACE_GAP_MS)
  const value = (format: () => string) => (latest === null ? { value: '—', empty: true } : { value: format() })
  const recentLaps = [...state.laps].reverse().slice(0, 10)

  return (
    <>
      {state.status.kind === 'connecting' ? (
        <Alert variant="info">
          <AlertDescription>Connecting to the live session…</AlertDescription>
        </Alert>
      ) : state.status.kind === 'reconnecting' ? (
        <Alert variant="warning">
          <AlertDescription>Lost the connection to Sprint. Reconnecting… The figures below are from before the drop.</AlertDescription>
        </Alert>
      ) : state.status.kind === 'ended' ? (
        <Alert variant="info">
          <AlertDescription>
            {state.status.reason}{' '}
            <Link href={sessionPath} className="font-semibold underline">
              View the session
            </Link>
          </AlertDescription>
        </Alert>
      ) : !state.receiving ? (
        <Alert variant="warning">
          <AlertDescription>
            No data from {driver} right now. {latest === null ? 'Readouts appear once it sends some.' : 'The figures below are the last ones received.'}
          </AlertDescription>
        </Alert>
      ) : null}

      <MetricStrip
        cells={[
          { label: 'Lap', ...value(() => String(latest?.lap ?? 0)), note: latest === null || latest.sector === 0 ? undefined : <>Sector <strong>{latest.sector}</strong></> },
          { label: 'Position', ...value(() => `P${latest?.position ?? 0}`) },
          { label: 'Current lap', ...value(() => formatLapTime(latest?.currentLapTime ?? 0)), note: latest !== null && !latest.lapValid ? 'Invalid lap' : undefined },
          { label: 'Last lap', ...value(() => formatLapTime(latest?.lastLapTime ?? 0)) },
          { label: 'Best lap', ...value(() => formatLapTime(latest?.bestLapTime ?? 0)) },
        ]}
      />

      <MetricStrip
        title="Car"
        cells={[
          { label: 'Speed', ...value(() => `${Math.round(latest?.speedKph ?? 0)} km/h`) },
          { label: 'Gear', ...value(() => formatGear(latest?.gear ?? 0)) },
          {
            label: 'RPM',
            ...value(() => String(Math.round(latest?.rpm ?? 0))),
            meter: latest !== null && latest.maxRpm > 0 ? { fraction: latest.rpm / latest.maxRpm, label: 'Engine speed of the maximum' } : undefined,
          },
          { label: 'Fuel', ...value(() => `${(latest?.fuel ?? 0).toFixed(1)} L`) },
          { label: 'Delta', ...value(() => formatDelta(latest?.delta ?? 0)), negative: latest !== null && latest.delta > 0, note: 'to best lap' },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] lg:items-start">
        <section className={listCardClass} aria-label="Traces">
          <CardHead title="Last 30 seconds" />
          <div className="space-y-4 p-4">
            {points.length === 0 ? (
              <EmptyState icon={IconFlag} title="No telemetry yet" body={`Traces start with the first data from ${driver}.`} />
            ) : (
              <>
                <TraceChart title="Speed" summary="speed over the last 30 seconds" points={points} xDomain={WINDOW} unit=" km/h" series={[{ key: 'speed', label: 'Speed', color: 'var(--brand-500)' }]} />
                <TraceChart
                  title="Throttle and brake"
                  summary="throttle and brake over the last 30 seconds"
                  points={points}
                  xDomain={WINDOW}
                  yDomain={[0, 100]}
                  unit=" %"
                  series={[
                    { key: 'throttle', label: 'Throttle', color: 'var(--green-500)' },
                    { key: 'brake', label: 'Brake', color: 'var(--red-500)' },
                  ]}
                />
              </>
            )}
          </div>
        </section>

        <Group title="Laps" trailing={state.laps.length > 0 ? `${state.laps.length}` : undefined}>
          {recentLaps.length === 0 ? (
            <EmptyState icon={IconFlag} title="No completed laps yet" body="Each lap appears here as the driver crosses the line." />
          ) : (
            recentLaps.map((lap) => (
              <Row key={lap.lap}>
                <RowText title={`Lap ${lap.lap}`} />
                {lap.valid ? null : <Badge tone="yellow">Invalid</Badge>}
                <span className="font-medium tabular-nums">{formatLapTime(lap.lapTime)}</span>
              </Row>
            ))
          )}
        </Group>
      </div>

      <MetricStrip
        title="Tyres"
        cells={[
          tyre('Front left', latest?.tyreTempFl, latest?.tyreWearFl),
          tyre('Front right', latest?.tyreTempFr, latest?.tyreWearFr),
          tyre('Rear left', latest?.tyreTempRl, latest?.tyreWearRl),
          tyre('Rear right', latest?.tyreTempRr, latest?.tyreWearRr),
        ]}
      />
    </>
  )
}

// A tyre's surface temperature with its wear as the note.
function tyre(label: string, temperature: number | undefined, wear: number | undefined) {
  if (temperature === undefined || wear === undefined) return { label, value: '—', empty: true }
  return { label, value: `${Math.round(temperature)}°`, note: `${Math.round(wear)} % worn`, meter: { fraction: wear / 100, label: `${label} wear` } }
}

// The status in the toolbar: dot and word.
function statusOf(state: LiveState): { dot: DotStatus; label: string } {
  switch (state.status.kind) {
    case 'connecting':
      return { dot: 'blue', label: 'Connecting' }
    case 'live':
      return state.receiving ? { dot: 'green', label: 'Live' } : { dot: 'yellow', label: 'Waiting for data' }
    case 'reconnecting':
      return { dot: 'yellow', label: 'Reconnecting' }
    case 'ended':
      return { dot: 'blue', label: 'Ended' }
    case 'revoked':
      return { dot: 'red', label: 'No access' }
    case 'signed-out':
      return { dot: 'red', label: 'Signed out' }
    case 'failed':
      return { dot: 'red', label: 'Disconnected' }
  }
}

// A card in place of the data when there is nothing the viewer may see.
function Blocked({ icon, title, body, action }: { icon: typeof IconLock; title: string; body: string; action: ReactNode }) {
  return (
    <section className={`${listCardClass} flex min-h-80 flex-col`}>
      <ErrorState icon={icon} title={title} body={body} action={action} />
    </section>
  )
}

function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button asChild variant="secondary">
      <a href={href}>{children}</a>
    </Button>
  )
}
