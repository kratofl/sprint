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
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="terminal-header text-[10px] font-bold">
            PICK_DETECTED_{SECTION_LABELS[deviceType]}
          </h3>
          <p className="mt-1 font-mono text-[8px] text-text-muted">
            {screens.length} candidate devices found. Pick the one to register.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-6 px-2 font-mono text-[9px]" onClick={onBack}>
          BACK
        </Button>
      </div>
      <div className="space-y-2">
        {screens.map(screen => {
          const key = screenKey(screen)
          const vidHex = screen.vid.toString(16).padStart(4, '0').toUpperCase()
          const pidHex = screen.pid.toString(16).padStart(4, '0').toUpperCase()
          return (
            <div key={key} className="surface-panel flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] font-bold">
                  {screen.description || screen.driver.toUpperCase()}
                </p>
                <p className="mt-0.5 font-mono text-[8px] uppercase text-text-muted">
                  {screen.width}×{screen.height} · {vidHex}:{pidHex}
                </p>
                {screen.serial ? (
                  <p className="mt-0.5 font-mono text-[8px] text-text-disabled">S/N {screen.serial}</p>
                ) : null}
              </div>
              <Button
                variant="primary"
                size="sm"
                className="terminal-header h-7 flex-shrink-0 px-3 text-[9px]"
                disabled={picking !== null}
                onClick={() => handlePick(screen)}
              >
                {picking === key ? 'ADDING…' : 'SELECT'}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
