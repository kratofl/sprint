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
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="terminal-header text-[10px] font-bold">
            ADD_FROM_CATALOG_{SECTION_LABELS[deviceType]}
          </h3>
          <p className="mt-1 font-mono text-[8px] text-text-muted">
            Register supported hardware or scan for compatible USB devices.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-6 px-2 font-mono text-[9px]" onClick={onClose}>
          CANCEL
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="terminal-header text-[9px] text-text-muted">NO_CATALOG_ENTRIES</p>
          <p className="max-w-xs font-mono text-[8px] text-text-muted">
            No {deviceType} devices are available in the local catalog yet.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => {
            const isGeneric = entry.vid === 0 && entry.pid === 0
            return (
              <div
                key={entry.id}
                className="flex items-start justify-between gap-3 border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] font-bold">{entry.name}</p>
                  <p className="mt-0.5 font-mono text-[8px] text-text-muted">{entry.description}</p>
                  {isGeneric ? (
                    <p className="mt-0.5 font-mono text-[8px] text-text-disabled">
                      Scans USB for {entry.driver.toUpperCase()} devices
                    </p>
                  ) : (
                    <p className="mt-0.5 font-mono text-[8px] uppercase text-text-disabled">
                      {entry.driver} · {entry.width}×{entry.height}
                    </p>
                  )}
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  className="terminal-header h-7 flex-shrink-0 px-3 text-[9px]"
                  disabled={scanning !== null || adding !== null}
                  onClick={() => handleAdd(entry)}
                >
                  {scanning === entry.id ? 'SCANNING…' : adding === entry.id ? 'ADDING…' : 'ADD'}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
