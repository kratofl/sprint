import { useEffect, useState } from 'react'
import Telemetry from '@/views/Telemetry'
import DashEditor from '@/views/DashEditor'
import Setups from '@/views/Setups'
import EngineerStatus from '@/views/EngineerStatus'
import Devices from '@/views/Devices'
import Controls from '@/views/Controls'
import { useTelemetry } from '@/hooks/useTelemetry'
import SplashScreen from '@/components/SplashScreen'
import { onEvent } from '@/lib/wails'
import { Badge, Button, Progress, cn } from '@sprint/ui'
import {
  IconGauge,
  IconLayout,
  IconAdjustmentsHorizontal,
  IconHeadset,
  IconUsb,
  IconSettings,
  IconBell,
  IconKeyboard,
} from '@tabler/icons-react'

type View = 'telemetry' | 'dash' | 'setups' | 'engineer' | 'devices' | 'controls'

const NAV: { id: View; label: string; icon: typeof IconGauge }[] = [
  { id: 'telemetry', label: 'Live_Session',  icon: IconGauge },
  { id: 'dash',      label: 'Dash_Editor',  icon: IconLayout },
  { id: 'setups',    label: 'Setups_DB',    icon: IconAdjustmentsHorizontal },
  { id: 'engineer',  label: 'Engineer_Hub', icon: IconHeadset },
  { id: 'devices',   label: 'Devices',      icon: IconUsb },
  { id: 'controls',  label: 'Controls',     icon: IconKeyboard },
]

export default function App() {
  const [view, setView] = useState<View>(import.meta.env.DEV ? 'telemetry' : 'dash')
  const visibleNav = import.meta.env.DEV ? NAV : NAV.filter(v => v.id !== 'telemetry')
  const { frame, connected, fps } = useTelemetry()
  const telemetryLevel = connected ? Math.min(((fps ?? 0) / 60) * 100, 100) : 0

  const [booting, setBooting] = useState(true)
  const [splashMounted, setSplashMounted] = useState(true)

  useEffect(() => {
    const unsub = onEvent('app:ready', () => setBooting(false))
    const fallback = setTimeout(() => setBooting(false), 3000)
    return () => { unsub(); clearTimeout(fallback) }
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background font-sans text-foreground">
      {splashMounted && (
        <SplashScreen visible={booting} onDone={() => setSplashMounted(false)} />
      )}

      {/* Fixed top header bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4 [app-region:drag]">
        {/* Brand + nav */}
        <div className="flex items-center gap-8">
          <h1 className="terminal-header text-base font-bold tracking-[0.2em] text-primary italic [app-region:no-drag]">
            SPRINT.V2
          </h1>
          <nav className="flex h-full items-center gap-4 terminal-header text-[10px] font-bold [app-region:no-drag]">
            {visibleNav.map(item => (
              <Button
                key={item.id}
                onClick={() => setView(item.id)}
                variant={view === item.id ? 'active' : 'ghost'}
                size="xs"
                className={cn(
                  'terminal-header h-auto rounded-none border-x-0 border-t-0 px-0 py-1 text-[10px] font-bold',
                  view === item.id
                    ? 'bg-transparent hover:bg-transparent'
                    : 'border-transparent hover:bg-transparent hover:text-foreground',
                )}
              >
                {item.label.toUpperCase()}
              </Button>
            ))}
          </nav>
        </div>

        {/* Right: status + actions */}
        <div className="flex items-center gap-4 [app-region:no-drag]">
          <div className="mr-2 flex items-center gap-2 font-mono text-[10px] text-text-muted">
            <Badge variant={connected ? 'connected' : 'neutral'} className="font-mono">
              {connected ? 'SYS_OK' : 'SYS_OFFLINE'}
            </Badge>
            <span className="opacity-30">|</span>
            <span>{fps ?? 0}_FPS</span>
          </div>
          <Button variant="ghost" size="icon-sm" className="text-text-muted" aria-label="Notifications">
            <IconBell size={16} />
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-text-muted" aria-label="Settings">
            <IconSettings size={16} />
          </Button>
          <div className="h-6 w-6 border border-border bg-card" />
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-border overflow-y-auto">
          {/* Chassis header */}
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                'h-1.5 w-1.5 rounded-full',
                connected ? 'bg-secondary animate-pulse' : 'bg-text-muted',
              )} />
              <span className="terminal-header text-[10px] font-bold font-mono text-secondary">
                {connected ? 'CHASSIS_01 ACTIVE' : 'CHASSIS_01 OFFLINE'}
              </span>
            </div>
            <p className="font-mono text-[10px] text-text-muted">
              NODE: {frame?.session.track ? frame.session.track.toUpperCase().replace(/\s+/g, '_') : 'AWAITING_LINK'}
            </p>
          </div>

          {/* Nav items */}
          <nav className="flex flex-col border-b border-border">
            {visibleNav.map(item => {
              const Icon = item.icon
              const isActive = view === item.id
              return (
                <Button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  variant={isActive ? 'active' : 'ghost'}
                  size="sm"
                  className={cn(
                    'terminal-header h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left text-[11px] font-bold transition-all',
                    isActive
                      ? 'border-l-0 border-y-0 border-r-2 border-primary bg-accent/5 text-primary hover:bg-accent/5'
                      : 'border-0 text-text-muted hover:bg-foreground/[0.02] hover:text-foreground',
                  )}
                >
                  <Icon size={15} className="shrink-0" />
                  {item.label.replace('_', ' ')}
                </Button>
              )
            })}
          </nav>

          {/* System status */}
          <div className="p-4">
            <h4 className="terminal-header mb-3 text-[10px] font-bold text-text-muted">
              SYSTEM_STATUS
            </h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-text-muted">TELEMETRY</span>
                <Badge variant={connected ? 'connected' : 'neutral'} className="font-mono">
                  {connected ? 'LIVE' : 'OFFLINE'}
                </Badge>
              </div>
              <Progress
                value={telemetryLevel}
                className={cn(
                  'h-1 w-full bg-border [&_[data-slot=progress-indicator]]:bg-border-strong',
                  connected && '[&_[data-slot=progress-indicator]]:bg-secondary',
                )}
              />
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-text-muted">LINK_QUAL</span>
                <Badge variant={connected ? 'connected' : 'neutral'} className="font-mono">
                  {connected ? 'EXCELLENT' : '——'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="mt-auto border-t border-border p-4">
            <Button variant="primary" className="w-full terminal-header font-bold">
              INIT_BROADCAST
            </Button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex flex-1 flex-col overflow-hidden bg-background">
          {view === 'telemetry' && <Telemetry frame={frame} />}
          {view === 'dash'      && <DashEditor />}
          {view === 'setups'    && <Setups />}
          {view === 'engineer'  && <EngineerStatus />}
          {view === 'devices'   && <Devices />}
          {view === 'controls'  && <Controls />}
        </main>
      </div>

      {/* Fixed bottom status footer */}
      <footer className="flex h-6 shrink-0 items-center border-t border-border bg-background px-4 font-mono text-[9px] text-text-muted">
        <div className="flex w-full items-center gap-6">
          <div className="flex items-center gap-2">
            <span className={cn(
              'h-1.5 w-1.5 rounded-full',
              connected ? 'bg-secondary animate-pulse' : 'bg-text-muted',
            )} />
            <Badge variant={connected ? 'connected' : 'neutral'} className="font-mono">
              {connected ? 'UPLINK_STABLE' : 'UPLINK_OFFLINE'}
            </Badge>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex gap-4">
            <span>FRAME_RATE: {fps ?? 0}Hz</span>
            <span>GAME: {frame?.session.game?.toUpperCase() ?? '——'}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="italic tracking-widest text-primary">
              {connected ? 'RECORDING SESSION: ACTIVE' : 'AWAITING CONNECTION'}
            </span>
          </div>
        </div>
      </footer>

    </div>
  )
}
