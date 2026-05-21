import {
  Badge,
  Button,
  Card,
  CardContent,
  PageHeader,
} from '@sprint/ui'

const sessions = [
  {
    name: 'SPA_RAIN_STINT',
    track: 'Spa-Francorchamps',
    car: 'McLaren 720S GT3 EVO',
    laps: 17,
    best: '2:15.482',
    updated: '2026-04-16 16:42Z',
    status: 'REFERENCE',
    variant: 'secondary' as const,
  },
  {
    name: 'MONZA_LOW_DRAG',
    track: 'Monza',
    car: 'Ferrari 296 GT3',
    laps: 13,
    best: '1:47.931',
    updated: '2026-04-15 21:18Z',
    status: 'READY',
    variant: 'outline' as const,
  },
  {
    name: 'IMOLA_LONG_RUN',
    track: 'Imola',
    car: 'BMW M4 GT3',
    laps: 26,
    best: '1:41.267',
    updated: '2026-04-14 19:06Z',
    status: 'STINT',
    variant: 'default' as const,
  },
  {
    name: 'NURB_SPRINT_Q',
    track: 'Nurburgring Sprint',
    car: 'Porsche 992 GT3 R',
    laps: 9,
    best: '1:27.404',
    updated: '2026-04-12 17:33Z',
    status: 'QUALI',
    variant: 'tertiary' as const,
  },
  {
    name: 'BATHURST_NIGHT',
    track: 'Mount Panorama',
    car: 'Audi R8 LMS Evo II',
    laps: 22,
    best: '2:03.908',
    updated: '2026-04-09 20:11Z',
    status: 'ARCHIVE',
    variant: 'neutral' as const,
  },
]

export default function Sessions() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        heading="SESSIONS"
        caption="Recorded telemetry runs, lap references, and export-ready stints."
        actions={(
          <>
            <Badge variant="neutral">5_STORED</Badge>
            <Button variant="outline" size="sm">SYNC_DESKTOP</Button>
          </>
        )}
      />

      <div className="flex-1 space-y-6 px-6 py-6">
        <section className="space-y-3">
          <h3 className="terminal-header text-[10px] font-bold text-text-muted">
            SESSION_LIBRARY
          </h3>
          <div className="space-y-3">
            {sessions.map((session) => (
              <Card key={session.name} size="sm">
                <CardContent className="grid gap-4 py-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto] md:items-center">
                  <div>
                    <p className="terminal-header text-[11px] font-bold text-foreground">
                      {session.name}
                    </p>
                    <p className="status-readout mt-1 text-[10px] text-text-muted">
                      {session.track} · {session.car}
                    </p>
                  </div>
                  <div className="grid gap-1 text-[10px] text-text-muted md:justify-self-start">
                    <span className="status-readout">LAPS: {session.laps}</span>
                    <span className="status-readout">UPDATED: {session.updated}</span>
                  </div>
                  <div>
                    <p className="terminal-header text-[10px] font-bold text-text-muted">
                      BEST_LAP
                    </p>
                    <p className="mt-1 text-xl font-bold font-mono tabular-nums text-foreground">
                      {session.best}
                    </p>
                  </div>
                  <div className="md:justify-self-end">
                    <Badge variant={session.variant}>{session.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
