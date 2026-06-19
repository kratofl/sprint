import { PageHeader } from '@sprint/ui'
import { DeviceSection } from '@/components/devices/DeviceSection'

export default function Devices() {
  return (
    <div className="ds-page">
      <PageHeader
        heading="Devices"
        caption="Screens, wheels, and hardware bindings"
      />
      <DeviceSection />
    </div>
  )
}
