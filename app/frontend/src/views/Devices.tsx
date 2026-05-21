import { PageHeader } from '@sprint/ui'
import { DeviceSection } from '@/components/devices/DeviceSection'

export default function Devices() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        heading="DEVICE_CONFIG"
        caption="Register screens, wheels, and button boxes"
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <DeviceSection />
      </div>
    </div>
  )
}
