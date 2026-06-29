import { useState } from 'react'
import { PageHeader, SegmentedControl } from '@sprint/ui'
import type { TelemetryFrame } from '@sprint/types'
import Telemetry from './Telemetry'
import Engineer from './Engineer'
import Controls from './Controls'

type HomeSection = 'live' | 'engineer' | 'setup'

interface HomeProps {
  frame: TelemetryFrame | null
  connected: boolean
  fps: number
}

const HOME_SECTIONS = [
  { value: 'live', label: 'Live' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'setup', label: 'Setup' },
] as const

export default function Home({ frame, connected, fps }: HomeProps) {
  const [section, setSection] = useState<HomeSection>('live')

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        heading="Home"
        caption="Live telemetry, race engineer controls, and setup programs"
        actions={(
          <SegmentedControl
            label="Home section"
            value={section}
            variant="neutral"
            options={HOME_SECTIONS}
            onChange={value => setSection(value as HomeSection)}
          />
        )}
      />

      <div className="mt-[14px] min-h-0 flex-1 overflow-hidden">
        {section === 'live' && <Telemetry frame={frame} connected={connected} fps={fps} />}
        {section === 'engineer' && <Engineer connected={connected} compact />}
        {section === 'setup' && <Controls compact />}
      </div>
    </div>
  )
}
