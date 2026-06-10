import { PageHeader } from '@sprint/ui'
import { DeviceSection } from '@/components/devices/DeviceSection'

export default function Devices() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        heading="Device config"
        caption="Register screens, wheels, and button boxes"
      />
      <div className="flex min-h-0 flex-1 overflow-hidden p-[14px]">
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
        <DeviceSection />
        </div>
      </div>
    </div>
  )
}
