import { useState } from 'react'
import { Button } from '@sprint/ui'
import { type CatalogEntry, type DetectedScreen, type DeviceType, deviceAPI } from '@/lib/dash'
import { ScanPicker } from './ScanPicker'
import { SECTION_LABELS } from './shared'

interface CatalogPanelProps {
  entries: CatalogEntry[]
  deviceType: DeviceType
  onAdd: (catalogID: string) => Promise<void>
  onAddScanned: (catalogID: string, screen: DetectedScreen) => Promise<void>
  onClose: () => void
  onError: (message: string) => void
}

export function CatalogPanel({
  entries,
  deviceType,
  onAdd,
  onAddScanned,
  onClose,
  onError,
}: CatalogPanelProps) {
  const [scanning, setScanning] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<{ catalogID: string; screens: DetectedScreen[] } | null>(null)

  const handleAdd = async (entry: CatalogEntry) => {
    if (entry.vid !== 0 || entry.pid !== 0) {
      setAdding(entry.id)
      try {
        await onAdd(entry.id)
      } catch (error) {
        onError(String(error))
        setAdding(null)
      }
      return
    }

    setScanning(entry.id)
    try {
      const found = await deviceAPI.scanUnregistered(entry.id)
      if (found.length === 0) {
        onError(`No unregistered ${entry.driver.toUpperCase()} device found. Make sure the device is connected.`)
        setScanning(null)
        return
      }
      if (found.length === 1) {
        setAdding(entry.id)
        setScanning(null)
        try {
          await onAddScanned(entry.id, found[0])
        } catch (error) {
          onError(String(error))
          setAdding(null)
        }
        return
      }
      setCandidates({ catalogID: entry.id, screens: found })
      setScanning(null)
    } catch (error) {
      onError(String(error))
      setScanning(null)
    }
  }

  const handlePickScanned = async (screen: DetectedScreen) => {
    if (!candidates) return
    setAdding(candidates.catalogID)
    setCandidates(null)
    try {
      await onAddScanned(candidates.catalogID, screen)
    } catch (error) {
      onError(String(error))
      setAdding(null)
    }
  }

  if (candidates) {
    return (
      <ScanPicker
        screens={candidates.screens}
        deviceType={deviceType}
        onPick={handlePickScanned}
        onBack={() => setCandidates(null)}
      />
    )
  }

  return (
    <div className="space-y-[14px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="ui-label text-[10px] font-bold">
            ADD_FROM_CATALOG_{SECTION_LABELS[deviceType]}
          </h3>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            Register supported hardware or scan for compatible USB devices.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 rounded-control px-[10px] font-sans text-[11px]" onClick={onClose}>
          Cancel
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="ui-label text-[10px] text-[var(--muted)]">No catalog entries</p>
          <p className="max-w-xs font-sans text-[10px] text-[var(--muted)]">
            No {deviceType} devices are available in the local catalog yet.
          </p>
        </div>
      ) : (
        <div className="space-y-[10px]">
          {entries.map(entry => {
            const isGeneric = entry.vid === 0 && entry.pid === 0
            return (
              <div key={entry.id} className="flex items-start justify-between gap-[10px] rounded-alert border border-[var(--border)] bg-[var(--panel)] p-[10px]">
                <div className="min-w-0 flex-1">
                  <p className="font-sans text-[12px] font-bold text-[var(--text)]">{entry.name}</p>
                  <p className="mt-0.5 font-sans text-[10px] text-[var(--muted)]">{entry.description}</p>
                  {isGeneric ? (
                    <p className="mt-0.5 font-sans text-[10px] text-[var(--muted-2)]">
                      Scans USB for {entry.driver.toUpperCase()} devices
                    </p>
                  ) : (
                    <p className="mt-0.5 font-sans text-[10px] uppercase text-[var(--muted-2)]">
                      {entry.driver} · {entry.width}×{entry.height}
                    </p>
                  )}
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  className="ui-label h-8 flex-shrink-0 rounded-control px-[10px] text-[11px]"
                  disabled={scanning !== null || adding !== null}
                  onClick={() => handleAdd(entry)}
                >
                  {scanning === entry.id ? 'Scanning…' : adding === entry.id ? 'Adding…' : 'Add'}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
