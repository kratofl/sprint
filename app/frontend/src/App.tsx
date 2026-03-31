import { useState } from 'react'
import Telemetry from '@/views/Telemetry'
import DashEditor from '@/views/DashEditor'
import Setups from '@/views/Setups'
import EngineerStatus from '@/views/EngineerStatus'
import Devices from '@/views/Devices'
import Controls from '@/views/Controls'
import { useTelemetry } from '@/hooks/useTelemetry'
import { cn } from '@sprint/ui'
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
  const [view, setView] = useState<View>('telemetry')
  const { frame, connected, fps } = useTelemetry()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0a0a0a] font-sans text-white">

      {/* ── Fixed top header bar ─────────────────────────────────────────── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#2a2a2a] bg-[#0a0a0a] px-4 [app-region:drag]">
        {/* Brand + nav */}
        <div className="flex items-center gap-8">
          <h1 className="terminal-header text-base font-bold tracking-[0.2em] text-[#ff906c] italic [app-region:no-drag]">
            SPRINT.V2
          </h1>
          <nav className="flex h-full items-center gap-4 terminal-header text-[10px] font-bold [app-region:no-drag]">
            {NAV.map(item => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  'transition-colors py-1',
                  view === item.id
                    ? 'text-[#ff906c] border-b border-[#ff906c]'
                    : 'text-[#808080] hover:text-white',
                )}
              >
                {item.label.toUpperCase()}
              </button>
            ))}
          </nav>
        </div>

        {/* Right: status + actions */}
        <div className="flex items-center gap-4 [app-region:no-drag]">
          <div className="flex items-center gap-2 font-mono text-[10px] text-[#808080] mr-2">
            <span className={connected ? 'text-[#5af8fb]' : 'text-[#808080]'}>
              {connected ? 'SYS_OK' : 'SYS_OFFLINE'}
            </span>
            <span className="opacity-30">|</span>
            <span>{fps ?? 0}_FPS</span>
          </div>
          <button className="text-[#808080] hover:text-white transition-colors">
            <IconBell size={16} />
          </button>
          <button className="text-[#808080] hover:text-white transition-colors">
            <IconSettings size={16} />
          </button>
          <div className="h-6 w-6 border border-[#2a2a2a] bg-[#141414]" />
        </div>
      </header>

      {/* ── Body: sidebar + main ─────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-[#2a2a2a] overflow-y-auto">
          {/* Chassis header */}
          <div className="border-b border-[#2a2a2a] p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                'h-1.5 w-1.5 rounded-full',
                connected ? 'bg-[#5af8fb] animate-pulse' : 'bg-[#808080]',
              )} />
              <span className="terminal-header text-[10px] font-bold font-mono text-[#5af8fb]">
                {connected ? 'CHASSIS_01 ACTIVE' : 'CHASSIS_01 OFFLINE'}
              </span>
            </div>
            <p className="font-mono text-[10px] text-[#808080]">
              NODE: {frame?.session.track ? frame.session.track.toUpperCase().replace(/\s+/g, '_') : 'AWAITING_LINK'}
            </p>
          </div>

          {/* Nav items */}
          <nav className="flex flex-col border-b border-[#2a2a2a]">
            {NAV.map(item => {
              const Icon = item.icon
              const isActive = view === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-3 text-[11px] font-bold terminal-header transition-all text-left',
                    isActive
                      ? 'border-r-2 border-[#ff906c] bg-[#ff906c]/5 text-[#ff906c]'
                      : 'text-[#808080] hover:bg-white/[0.02] hover:text-white',
                  )}
                >
                  <Icon size={15} className="shrink-0" />
                  {item.label.replace('_', ' ')}
                </button>
              )
            })}
          </nav>

          {/* System status */}
          <div className="p-4">
            <h4 className="terminal-header mb-3 text-[10px] font-bold text-[#808080]">
              SYSTEM_STATUS
            </h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-[#808080]">TELEMETRY</span>
                <span className={connected ? 'text-[#5af8fb]' : 'text-[#808080]'}>
                  {connected ? 'LIVE' : 'OFFLINE'}
                </span>
              </div>
              <div className="h-1 w-full bg-[#2a2a2a]">
                <div
                  className={cn('h-full transition-all', connected ? 'bg-[#5af8fb]' : 'bg-[#3a3a3a]')}
                  style={{ width: connected ? `${Math.min((fps ?? 0) / 60 * 100, 100)}%` : '0%' }}
                />
              </div>
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-[#808080]">LINK_QUAL</span>
                <span className={connected ? 'text-[#5af8fb]' : 'text-[#808080]'}>
                  {connected ? 'EXCELLENT' : '——'}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="mt-auto border-t border-[#2a2a2a] p-4">
            <button className="w-full border border-[#ff906c] py-2 terminal-header text-[10px] font-bold text-[#ff906c] transition-colors hover:bg-[#ff906c] hover:text-[#0a0a0a]">
              INIT_BROADCAST
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex flex-1 flex-col overflow-hidden bg-[#0a0a0a]">
          {view === 'telemetry' && <Telemetry frame={frame} />}
          {view === 'dash'      && <DashEditor />}
          {view === 'setups'    && <Setups />}
          {view === 'engineer'  && <EngineerStatus />}
          {view === 'devices'   && <Devices />}
          {view === 'controls'  && <Controls />}
        </main>
      </div>

      {/* ── Fixed bottom status footer ───────────────────────────────────── */}
      <footer className="flex h-6 shrink-0 items-center border-t border-[#2a2a2a] bg-[#0a0a0a] px-4 font-mono text-[9px] text-[#808080]">
        <div className="flex w-full items-center gap-6">
          <div className="flex items-center gap-2">
            <span className={cn(
              'h-1.5 w-1.5 rounded-full',
              connected ? 'bg-[#5af8fb] animate-pulse' : 'bg-[#808080]',
            )} />
            <span className={connected ? 'font-bold text-[#5af8fb]' : 'text-[#808080]'}>
              {connected ? 'UPLINK_STABLE' : 'UPLINK_OFFLINE'}
            </span>
          </div>
          <div className="h-3 w-px bg-[#2a2a2a]" />
          <div className="flex gap-4">
            <span>FRAME_RATE: {fps ?? 0}Hz</span>
            <span>GAME: {frame?.session.game?.toUpperCase() ?? '——'}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="italic tracking-widest text-[#ff906c]">
              {connected ? 'RECORDING SESSION: ACTIVE' : 'AWAITING CONNECTION'}
            </span>
          </div>
        </div>
      </footer>

    </div>
  )
}
