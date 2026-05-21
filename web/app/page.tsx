import Link from 'next/link'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
} from '@sprint/ui'
import {
  IconAdjustmentsHorizontal,
  IconArrowRight,
  IconHeadset,
  IconHistory,
  IconLayout,
} from '@tabler/icons-react'

const overview = [
  {
    label: 'RECORDED_SESSIONS',
    caption: 'Last 30 days',
    value: '18',
    meta: '+6 vs last week',
    icon: IconHistory,
    valueClass: 'text-foreground',
    variant: 'default' as const,
  },
  {
    label: 'ACTIVE_SETUPS',
    caption: 'Wheel + car presets',
    value: '42',
    meta: '12 synced from desktop',
    icon: IconAdjustmentsHorizontal,
    valueClass: 'text-foreground',
    variant: 'default' as const,
  },
  {
    label: 'CONNECTED_ENGINEERS',
    caption: 'Remote command links',
    value: '3',
    meta: 'Fastest RTT 38ms',
    icon: IconHeadset,
    valueClass: 'text-secondary',
    variant: 'secondary' as const,
  },
]

const quickAccess = [
  {
    href: '/sessions',
    label: 'SESSION_LIBRARY',
    description: 'Review recorded laps, sector trends, and reference runs.',
    icon: IconHistory,
  },
  {
    href: '/engineer',
    label: 'ENGINEER_LINK',
    description: 'Open the remote engineer console and target-lap controls.',
    icon: IconHeadset,
  },
  {
    href: '/setups',
    label: 'SETUP_BANK',
    description: 'Track-tested car setups with baseline lap references.',
    icon: IconAdjustmentsHorizontal,
  },
  {
    href: '/dash',
    label: 'DASH_EDITOR',
    description: 'Compose VoCore widgets before pushing to the wheel display.',
    icon: IconLayout,
  },
]

const activity = [
  {
    time: '16:42Z',
    title: 'TARGET_LAP refreshed from wheel button',
    detail: 'Spa · McLaren 720S GT3 · Reference set to 2:15.482',
    badge: 'DRIVER',
    variant: 'default' as const,
  },
  {
    time: '16:31Z',
    title: 'ENGINEER command accepted',
    detail: 'Brake bias +0.3% applied from Marco over remote link',
    badge: 'ENGINEER',
    variant: 'secondary' as const,
  },
  {
    time: '16:12Z',
    title: 'SETUP synced from desktop',
    detail: 'Monza_LowDrag_v7 uploaded to setup bank',
    badge: 'SYNC',
    variant: 'outline' as const,
  },
  {
    time: '15:58Z',
    title: 'DASH layout published',
    detail: 'GT3_NIGHT_STINT pushed to VoCore M-PRO display',
    badge: 'DISPLAY',
    variant: 'tertiary' as const,
  },
]

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        heading="DASHBOARD"
        caption="Mission control for telemetry sessions, setup sync, and remote engineer activity."
        actions={(
          <>
            <Badge variant="connected">UPLINK_STABLE</Badge>
            <Button asChild size="sm">
              <Link href="/engineer">OPEN_ENGINEER</Link>
            </Button>
          </>
        )}
      />

      <div className="flex-1 space-y-6 px-6 py-6">
        <section className="space-y-3">
          <h3 className="terminal-header text-[10px] font-bold text-text-muted">
            SESSION_OVERVIEW
          </h3>
          <div className="grid gap-3 md:grid-cols-3">
            {overview.map((item) => {
              const Icon = item.icon
              return (
                <Card key={item.label} size="sm" variant={item.variant}>
                  <CardHeader>
                    <CardTitle>{item.label}</CardTitle>
                    <CardDescription>{item.caption}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between gap-3">
                    <div>
                      <p className={`text-3xl font-bold font-mono tabular-nums ${item.valueClass}`}>
                        {item.value}
                      </p>
                      <p className="status-readout mt-1 text-[10px] text-text-muted">
                        {item.meta}
                      </p>
                    </div>
                    <Icon size={18} className="mb-1 shrink-0 text-text-muted" />
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="terminal-header text-[10px] font-bold text-text-muted">
            QUICK_ACCESS
          </h3>
          <div className="grid gap-3 xl:grid-cols-2">
            {quickAccess.map((item) => {
              const Icon = item.icon
              return (
                <Link key={item.href} href={item.href} className="group">
                  <Card
                    size="sm"
                    className="h-full transition-colors group-hover:border-primary/40"
                  >
                    <CardContent className="flex h-full flex-col gap-3 py-4">
                      <div className="flex items-start justify-between">
                        <Icon size={18} className="mt-0.5 text-text-muted" />
                        <IconArrowRight
                          size={14}
                          className="mt-0.5 text-text-muted transition-transform group-hover:translate-x-0.5"
                        />
                      </div>
                      <div>
                        <p className="terminal-header text-[11px] font-bold text-foreground">
                          {item.label}
                        </p>
                        <p className="status-readout mt-1 text-[10px] text-text-muted">
                          {item.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="terminal-header text-[10px] font-bold text-text-muted">
            RECENT_ACTIVITY
          </h3>
          <Card size="sm">
            <CardHeader>
              <CardTitle>EVENT_FEED</CardTitle>
              <CardDescription>Latest sync, telemetry, and engineer updates.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activity.map((item) => (
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
                    <Badge variant={item.variant}>{item.badge}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
