import { useState } from 'react'
import { Button } from '@sprint/ui'
import type { DetectedScreen, DeviceType } from '@/lib/dash'
import { SECTION_LABELS } from './shared'

interface ScanPickerProps {
  screens: DetectedScreen[]
  deviceType: DeviceType
  onPick: (screen: DetectedScreen) => Promise<void>
  onBack: () => void
}

export function ScanPicker({ screens, deviceType, onPick, onBack }: ScanPickerProps) {
  const [picking, setPicking] = useState<string | null>(null)

  const screenKey = (screen: DetectedScreen) =>
    `${screen.vid.toString(16).padStart(4, '0')}-${screen.pid.toString(16).padStart(4, '0')}${screen.serial ? `-${screen.serial}` : ''}`

  const handlePick = async (screen: DetectedScreen) => {
    const key = screenKey(screen)
    setPicking(key)
    try {
      await onPick(screen)
    } catch {
      setPicking(null)
    }
  }

  return (
    <div className="space-y-[14px] p-[14px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="ui-label text-[10px] font-bold">
            PICK_DETECTED_{SECTION_LABELS[deviceType]}
          </h3>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            {screens.length} candidate devices found. Pick the one to register.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 rounded-control px-[10px] font-saira text-[11px]" onClick={onBack}>
          BACK
        </Button>
      </div>
      <div className="space-y-[10px]">
        {screens.map(screen => {
          const key = screenKey(screen)
          const vidHex = screen.vid.toString(16).padStart(4, '0').toUpperCase()
          const pidHex = screen.pid.toString(16).padStart(4, '0').toUpperCase()
          return (
            <div key={key} className="flex items-start justify-between gap-[10px] rounded-alert border border-[var(--border)] bg-[var(--panel)] p-[10px]">
              <div className="min-w-0 flex-1">
                <p className="font-saira text-[12px] font-bold text-[var(--text)]">
                  {screen.description || screen.driver.toUpperCase()}
                </p>
                <p className="mt-0.5 font-saira text-[10px] uppercase text-[var(--muted)]">
                  {screen.width}×{screen.height} · {vidHex}:{pidHex}
                </p>
                {screen.serial ? (
                  <p className="mt-0.5 font-saira text-[10px] text-[var(--muted-2)]">S/N {screen.serial}</p>
                ) : null}
              </div>
              <Button
                variant="primary"
                size="sm"
                className="ui-label h-8 flex-shrink-0 rounded-control px-[10px] text-[11px]"
                disabled={picking !== null}
                onClick={() => handlePick(screen)}
              >
                {picking === key ? 'Adding…' : 'Select'}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
