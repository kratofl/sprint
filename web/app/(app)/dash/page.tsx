import {
  IconAdjustments,
  IconDroplet,
  IconGauge,
  IconLayoutDashboard,
  IconManualGearbox,
  IconStopwatch,
  IconTemperature,
  IconTrafficLights,
  type Icon,
} from '@tabler/icons-react'
import { CardHead, Group, IconTile, Row, RowText, listCardClass } from '@/components/app/grouped'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState } from '@/components/app/states'

const WIDGETS: readonly { label: string; icon: Icon }[] = [
  { label: 'Lap delta', icon: IconStopwatch },
  { label: 'Gear', icon: IconManualGearbox },
  { label: 'RPM bar', icon: IconGauge },
  { label: 'Shift lights', icon: IconTrafficLights },
  { label: 'Fuel remaining', icon: IconDroplet },
  { label: 'Tyre temperatures', icon: IconTemperature },
]

// Dash editor: widget catalogue, canvas and properties. Layouts are not synced
// to the web yet, so the canvas and properties show their empty states.
export default function DashEditor() {
  return (
    <>
      <PageHeader title="Dash editor" />
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        <Group title="Widgets">
          {WIDGETS.map(({ label, icon }) => (
            <Row key={label}>
              <IconTile icon={icon} tone="brand" size={26} />
              <RowText title={label} />
            </Row>
          ))}
        </Group>
        <section className={`${listCardClass} flex flex-col`} aria-label="Canvas">
          <CardHead title="Canvas" />
          {/* The wheel display is 5:3; the empty canvas keeps that frame. */}
          <div className="mx-4 mb-4 flex aspect-[5/3] rounded-md border border-separator bg-bg">
            <EmptyState
              icon={IconLayoutDashboard}
              title="No layout open"
              body="Dash layouts are built in the Sprint desktop app and pushed to your wheel from there."
            />
          </div>
        </section>
        <section className={`${listCardClass} flex flex-col`} aria-label="Properties">
          <CardHead title="Properties" />
          <EmptyState icon={IconAdjustments} title="Nothing selected" body="Properties appear here when a layout is open." />
        </section>
      </div>
    </>
  )
}
