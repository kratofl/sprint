import { IconGauge, IconLayout, IconUsb, IconKeyboard, IconChevronRight } from '@tabler/icons-react'
import { Badge, Card, CardContent, cn } from '@sprint/ui'

type NavigableView = 'telemetry' | 'dash' | 'devices' | 'controls'

interface HomeProps {
  connected: boolean
  onNavigate: (view: NavigableView) => void
}

interface FeatureDef {
  id: NavigableView
  label: string
  description: string
  Icon: React.ComponentType<{ size?: number; className?: string }>
  devOnly?: boolean
}

const FEATURES: FeatureDef[] = [
  {
    id: 'telemetry',
    label: 'LIVE_SESSION',
    description: 'Real-time telemetry from your sim. Lap times, tire temps, delta, and more.',
    Icon: IconGauge,
    devOnly: true,
  },
  {
    id: 'dash',
    label: 'DASH_EDITOR',
    description: 'Design and configure your VoCore wheel display layouts.',
    Icon: IconLayout,
  },
  {
    id: 'devices',
    label: 'DEVICES',
    description: 'Register wheels, screens, and button boxes. Configure the VoCore target.',
    Icon: IconUsb,
  },
  {
    id: 'controls',
    label: 'CONTROLS',
    description: 'Bind wheel buttons to Sprint commands.',
    Icon: IconKeyboard,
  },
]

export default function Home({ connected, onNavigate }: HomeProps) {
  const features = FEATURES.filter(f => !f.devOnly || import.meta.env.DEV)

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-border px-6 py-4 flex-shrink-0">
        <div>
          <h2 className="terminal-header mb-0.5 text-sm font-bold tracking-[0.2em]">HOME</h2>
          <p className="font-mono text-[10px] text-text-muted">Mission control for Sprint</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'h-1.5 w-1.5',
            connected ? 'bg-secondary animate-pulse' : 'bg-text-muted',
          )} />
          <Badge variant={connected ? 'connected' : 'neutral'} className="font-mono">
            {connected ? 'UPLINK_STABLE' : 'UPLINK_OFFLINE'}
          </Badge>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-6">
        <div>
          <h4 className="terminal-header mb-3 text-[10px] font-bold text-text-muted">QUICK_ACCESS</h4>
          <div className={cn('grid gap-3', features.length >= 4 ? 'grid-cols-2' : 'grid-cols-3')}>
            {features.map(feature => (
              <button
                key={feature.id}
                onClick={() => onNavigate(feature.id)}
                className="group text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <Card
                  size="sm"
                  className="h-full cursor-pointer gap-0 py-0 group-hover:border-primary/40 transition-colors"
                >
                  <CardContent className="flex h-full flex-col gap-3 px-4 py-4">
                    <div className="flex items-start justify-between">
                      <feature.Icon size={18} className="text-text-muted mt-0.5" />
                      <IconChevronRight
                        size={12}
                        className="text-text-muted opacity-40 mt-0.5 transition-transform group-hover:translate-x-0.5"
                      />
                    </div>
                    <div>
                      <p className="terminal-header text-[11px] font-bold text-foreground mb-1.5">
                        {feature.label}
                      </p>
                      <p className="font-mono text-[9px] text-text-muted leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </div>

        {!import.meta.env.DEV && (
          <p className="font-mono text-[9px] text-text-muted opacity-40">
            LIVE_SESSION telemetry is not available in this build.
          </p>
        )}
      </div>
    </div>
  )
}
