import { useState } from 'react'
import Telemetry from '@/views/Telemetry'
import DashEditor from '@/views/DashEditor'
import Setups from '@/views/Setups'
import EngineerStatus from '@/views/EngineerStatus'
import Devices from '@/views/Devices'
import { useTelemetry } from '@/hooks/useTelemetry'
import { Badge, NavRail, NavRailItem, cn } from '@sprint/ui'
import {
  IconGauge,
  IconLayout,
  IconAdjustmentsHorizontal,
  IconHeadset,
  IconUsb,
} from '@tabler/icons-react'

type View = 'telemetry' | 'dash' | 'setups' | 'engineer' | 'devices'

const NAV: NavRailItem[] = [
  { id: 'telemetry', label: 'Telemetry',   icon: IconGauge },
  { id: 'dash',      label: 'Dash Editor', icon: IconLayout },
  { id: 'setups',    label: 'Setups',      icon: IconAdjustmentsHorizontal },
  { id: 'engineer',  label: 'Engineer',    icon: IconHeadset },
  { id: 'devices',   label: 'Devices',     icon: IconUsb },
]

export default function App() {
  const [view, setView] = useState<View>('telemetry')
  const { frame, connected, fps } = useTelemetry()

  const connectionFooter = (
    <Badge
      variant="outline"
      className={cn(
        'w-full justify-start gap-1.5 rounded-md px-2',
        connected
          ? 'border-teal/30 bg-teal/10 text-teal'
          : 'border-border-base text-text-disabled',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          connected ? 'bg-teal animate-pulse' : 'bg-text-disabled',
        )}
      />
      {connected ? 'Live' : 'Offline'}
    </Badge>
  )

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base text-text-primary font-sans">
      <NavRail
        items={NAV}
        activeId={view}
        onSelect={(id) => setView(id as View)}
        footer={connectionFooter}
      />

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden tech-grid">
        {view === 'telemetry' && <Telemetry frame={frame} connected={connected} fps={fps} />}
        {view === 'dash'      && <DashEditor />}
        {view === 'setups'    && <Setups />}
        {view === 'engineer'  && <EngineerStatus />}
        {view === 'devices'   && <Devices />}
      </main>
    </div>
  )
}
