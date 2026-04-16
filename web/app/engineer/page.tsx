'use client'

import { useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  PageHeader,
} from '@sprint/ui'

const queuedCommands = [
  {
    time: '16:41Z',
    title: 'TARGET_LAP set from reference',
    detail: 'Lap 12 · 2:15.482 · Applied',
    variant: 'secondary' as const,
  },
  {
    time: '16:39Z',
    title: 'BRAKE_BIAS +0.3%',
    detail: 'Pending driver acknowledgment',
    variant: 'warning' as const,
  },
  {
    time: '16:36Z',
    title: 'FUEL_TARGET -2.0L',
    detail: 'Rejected by desktop authority',
    variant: 'destructive' as const,
  },
]

const remoteLinks = [
  'TARGET_LAP updates',
  'Dash parameter overrides',
  'Pit note annotations',
]

export default function Engineer() {
  const [connected, setConnected] = useState(false)

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        heading="RACE_ENGINEER"
        caption="Remote telemetry link with desktop-authoritative command handling."
        className="bg-secondary/[0.03]"
        actions={(
          <>
            <Badge variant={connected ? 'connected' : 'neutral'}>
              {connected ? 'LINK_LIVE' : 'STANDBY'}
            </Badge>
            <Button
              variant={connected ? 'outline' : 'secondary'}
              size="sm"
              onClick={() => setConnected((value) => !value)}
            >
              {connected ? 'DISCONNECT_PREVIEW' : 'JOIN_PREVIEW'}
            </Button>
          </>
        )}
      />

      <div className="flex-1 space-y-6 px-6 py-6">
        {!connected ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
            <Card size="sm" variant="secondary">
              <CardHeader>
                <CardTitle>JOIN_REMOTE_SESSION</CardTitle>
                <CardDescription>
                  Paste a driver invite code or shared engineer link to open the live feed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="session-code"
                    className="terminal-header text-[10px] font-bold text-text-muted"
                  >
                    SESSION_CODE
                  </label>
                  <Input
                    id="session-code"
                    type="text"
                    placeholder="sprint://engineer/spa-night-stint"
                    className="max-w-xl"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setConnected(true)}>
                    CONNECT_LINK
                  </Button>
                  <Button variant="outline" size="sm">
                    GENERATE_TEST_LINK
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>REMOTE_CAPABILITIES</CardTitle>
                  <CardDescription>What the desktop app allows engineers to control.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {remoteLinks.map((item) => (
                    <div
                      key={item}
                      className="rounded-sm border border-border bg-bg-elevated/70 px-3 py-2"
                    >
                      <p className="status-readout text-[10px] text-text-muted">{item}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>LINK_STATUS</CardTitle>
                  <CardDescription>Desktop remains authoritative for all applied commands.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between rounded-sm border border-border bg-bg-elevated/70 px-3 py-2">
                    <span className="status-readout text-[10px] text-text-muted">LATENCY_TARGET</span>
                    <span className="text-sm font-bold font-mono tabular-nums text-secondary">
                      &lt;50ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-sm border border-border bg-bg-elevated/70 px-3 py-2">
                    <span className="status-readout text-[10px] text-text-muted">COMMAND_MODEL</span>
                    <Badge variant="neutral">PENDING → APPLIED / REJECTED</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <Card size="sm" variant="secondary">
                <CardHeader>
                  <CardTitle>TARGET_LAP</CardTitle>
                  <CardDescription>Most recent valid lap captured from the wheel button.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-end gap-4">
                  <div>
                    <p className="text-3xl font-bold font-mono tabular-nums text-secondary">
                      2:15.482
                    </p>
                    <p className="status-readout mt-1 text-[10px] text-text-muted">
                      Lap 12 · Spa · Track valid · No yellow / no limits
                    </p>
                  </div>
                  <Badge variant="secondary">REFERENCE_LOCKED</Badge>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>DRIVER_STATUS</CardTitle>
                  <CardDescription>Desktop uplink and current session context.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="terminal-header text-[10px] font-bold text-text-muted">
                      DRIVER
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">krato</p>
                  </div>
                  <div>
                    <p className="terminal-header text-[10px] font-bold text-text-muted">
                      SESSION
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">SPA_RAIN_STINT</p>
                  </div>
                  <div>
                    <p className="terminal-header text-[10px] font-bold text-text-muted">
                      RTT
                    </p>
                    <p className="mt-1 text-sm font-bold font-mono tabular-nums text-secondary">
                      38ms
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_360px]">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>COMMAND_FEED</CardTitle>
                  <CardDescription>Latest engineer-originated actions and desktop outcomes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {queuedCommands.map((item) => (
                    <div
                      key={`${item.time}-${item.title}`}
                      className="grid gap-3 rounded-sm border border-border bg-bg-elevated/70 p-3 md:grid-cols-[72px_1fr_auto]"
                    >
                      <p className="status-readout text-[10px] text-text-muted">{item.time}</p>
                      <div>
                        <p className="terminal-header text-[10px] font-bold text-foreground">
                          {item.title}
                        </p>
                        <p className="status-readout mt-1 text-[10px] text-text-muted">
                          {item.detail}
                        </p>
                      </div>
                      <div className="md:justify-self-end">
                        <Badge variant={item.variant}>{item.variant.toUpperCase()}</Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card size="sm" variant="secondary">
                <CardHeader>
                  <CardTitle>READY_ACTIONS</CardTitle>
                  <CardDescription>Preview commands ready to transmit to the driver desktop.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="secondary" size="sm" className="w-full justify-start">
                    SET_TARGET_LAP
                  </Button>
                  <Button variant="secondary" size="sm" className="w-full justify-start">
                    ADD_PIT_NOTE
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    TUNE_DASH_PARAM
                  </Button>
                </CardContent>
              </Card>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
