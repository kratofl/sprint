import { useState } from 'react'
import Telemetry from '@/views/Telemetry'
import DashEditor from '@/views/DashEditor'
import Setups from '@/views/Setups'
import EngineerStatus from '@/views/EngineerStatus'
import { useTelemetry } from '@/hooks/useTelemetry'

type View = 'telemetry' | 'dash' | 'setups' | 'engineer'

const NAV: { id: View; label: string }[] = [
  { id: 'telemetry', label: 'Telemetry' },
  { id: 'dash',      label: 'Dash Editor' },
  { id: 'setups',    label: 'Setups' },
  { id: 'engineer',  label: 'Engineer' },
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
            <button
              key={id}
              onClick={() => setView(id)}
              className={[
                'flex w-full items-center rounded-md px-3 py-2 text-sm transition-colors',
                view === id
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Live connection indicator */}
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span
              className={[
                'h-1.5 w-1.5 rounded-full',
                connected ? 'bg-teal animate-pulse' : 'bg-text-disabled',
              ].join(' ')}
            />
            {connected ? (
              <span className="text-teal">Live</span>
            ) : (
              <span>Not connected</span>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {view === 'telemetry' && <Telemetry frame={frame} connected={connected} fps={fps} />}
        {view === 'dash'      && <DashEditor />}
        {view === 'setups'    && <Setups />}
        {view === 'engineer'  && <EngineerStatus />}
      </main>
    </div>
  )
}
