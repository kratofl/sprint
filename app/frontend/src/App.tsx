import { useState } from 'react'
import Telemetry from '@/views/Telemetry'
import DashEditor from '@/views/DashEditor'
import Setups from '@/views/Setups'
import EngineerStatus from '@/views/EngineerStatus'
import Devices from '@/views/Devices'
import { useTelemetry } from '@/hooks/useTelemetry'
import { Button, Badge, cn } from '@sprint/ui'

type View = 'telemetry' | 'dash' | 'setups' | 'engineer' | 'devices'

const NAV: { id: View; label: string }[] = [
  { id: 'telemetry', label: 'Telemetry' },
  { id: 'dash',      label: 'Dash Editor' },
  { id: 'setups',    label: 'Setups' },
  { id: 'engineer',  label: 'Engineer' },
  { id: 'devices',   label: 'Devices' },
]

export default function App() {
  const [view, setView] = useState<View>('telemetry')
  const { frame, connected, fps } = useTelemetry()

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#080809] text-text-primary font-sans">
      {/* Sidebar */}
      <aside className="flex w-52 flex-col border-r border-border-glass bg-bg-surface backdrop-blur-glass">
        {/* App title */}
        <div className="flex h-14 items-center px-5 [app-region:drag]">
          <span className="text-sm font-semibold tracking-widest text-accent">SPRINT</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2">
          {NAV.map(({ id, label }) => (
            <Button
              key={id}
              variant="ghost"
              onClick={() => setView(id)}
              className={cn(
                'flex w-full items-center justify-start rounded-md px-3 py-2 text-sm transition-colors',
                view === id
                  ? 'bg-accent/10 text-accent font-medium hover:bg-accent/10 hover:text-accent'
                  : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary',
              )}
            >
              {label}
            </Button>
          ))}
        </nav>

        {/* Live connection indicator */}
        <div className="px-4 py-4">
          <Badge
            className={cn(
              connected
                ? 'bg-teal/15 text-teal border border-teal/30'
                : 'bg-transparent text-text-muted border-border-glass',
            )}
          >
            {connected && (
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-teal animate-pulse inline-block" />
            )}
            {connected ? 'Live' : 'Not connected'}
          </Badge>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {view === 'telemetry' && <Telemetry frame={frame} connected={connected} fps={fps} />}
        {view === 'dash'      && <DashEditor />}
        {view === 'setups'    && <Setups />}
        {view === 'engineer'  && <EngineerStatus />}
        {view === 'devices'   && <Devices />}
      </main>
    </div>
  )
}
