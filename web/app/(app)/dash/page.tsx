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
import Page from '@/components/Page'
import { Card, EmptyState } from '@/components/Card'

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
    <Page title="Dash editor">
      <div className="dash-grid">
        <Card title="Widgets">
          {WIDGETS.map(({ label, icon: WidgetIcon }) => (
            <div key={label} className="list-row">
              <WidgetIcon className="nav-icon" size={16} stroke={1.8} aria-hidden />
              <span className="list-row-text">{label}</span>
            </div>
          ))}
        </Card>
        <Card title="Canvas">
          <div className="dash-canvas">
            <EmptyState
              icon={IconLayoutDashboard}
              title="No layout open"
              body="Dash layouts are built in the Sprint desktop app and pushed to your wheel from there."
            />
          </div>
        </Card>
        <Card title="Properties">
          <EmptyState
            icon={IconAdjustments}
            title="Nothing selected"
            body="Properties appear here when a layout is open."
          />
        </Card>
      </div>
    </Page>
  )
}
