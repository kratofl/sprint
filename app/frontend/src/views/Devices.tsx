import { useState, useEffect, useCallback } from 'react'
import {
  type DeviceConfig,
  type DetectedPort,
  type WheelModel,
  deviceAPI,
  deviceDisplayName,
  modelDisplayName,
  newDeviceConfig,
} from '@/lib/devices'
import { type DetectedVoCoreScreen, type VoCoreConfig, voCoreAPI } from '@/lib/dash'
import {
  Badge,
  Button,
  Card, CardContent, CardHeader, CardTitle,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Input,
  Separator,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Skeleton,
  cn,
} from '@sprint/ui'

// ── Devices view ──────────────────────────────────────────────────────────────

export default function Devices() {
  const [devices, setDevices]   = useState<DeviceConfig[]>([])
  const [models, setModels]     = useState<WheelModel[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [editing, setEditing]   = useState<DeviceConfig | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [devs, mods] = await Promise.all([
        deviceAPI.getAll(),
        deviceAPI.listKnownModels(),
      ])
      setDevices(devs)
      setModels(mods)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (d: DeviceConfig) => {
    try {
      const saved = await deviceAPI.save(d)
      setDevices(prev => {
        const idx = prev.findIndex(x => x.id === saved.id)
        return idx >= 0 ? prev.map(x => x.id === saved.id ? saved : x) : [...prev, saved]
      })
      setEditing(null)
    } catch (e) {
      setError(String(e))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deviceAPI.delete(id)
      setDevices(prev => prev.filter(x => x.id !== id))
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
      {/* Header */}
      <h1 className="text-lg font-semibold">Devices</h1>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* VoCore screen selector */}
      <VoCoreScreenSection />

      {/* Advanced: serial wheel config */}
      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen(o => !o)}
          className="flex w-full items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors mb-2"
        >
          <svg
            className={cn('h-3 w-3 transition-transform', advancedOpen && 'rotate-90')}
            viewBox="0 0 6 10" fill="none" stroke="currentColor" strokeWidth="1.5"
          >
            <path d="M1 1l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Advanced — Serial / Wheel Model
        </button>

        {advancedOpen && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-muted">
                Legacy serial configuration. Not required when using USB VoCore auto-detection.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(newDeviceConfig())}
                className="border-accent/40 text-accent hover:bg-accent/10 hover:text-accent flex-shrink-0 ml-4"
              >
                + Add Wheel
              </Button>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[0, 1].map(i => (
                  <Card key={i}>
                    <CardContent className="py-4">
                      <Skeleton className="h-4 w-48 mb-2" />
                      <Skeleton className="h-3 w-32" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : devices.length === 0 ? (
              <EmptyState onAdd={() => setEditing(newDeviceConfig())} />
            ) : (
              <div className="space-y-3">
                {devices.map((d, i) => (
                  <DeviceCard
                    key={d.id}
                    device={d}
                    models={models}
                    isPrimary={i === 0}
                    onEdit={() => setEditing({ ...d })}
                    onDelete={() => handleDelete(d.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add / edit dialog */}
      {editing !== null && (
        <DeviceDialog
          device={editing}
          models={models}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ── VoCoreScreenSection ───────────────────────────────────────────────────────

function VoCoreScreenSection() {
  const [screens, setScreens]           = useState<DetectedVoCoreScreen[]>([])
  const [selected, setSelected]         = useState<VoCoreConfig | null>(null)
  const [scanning, setScanning]         = useState(false)
  const [selecting, setSelecting]       = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [autoSelected, setAutoSelected] = useState(false)

  const screenKey = (s: DetectedVoCoreScreen) => `${s.vid}-${s.pid}-${s.serial}`

  const scan = useCallback(async () => {
    setScanning(true)
    setError(null)
    try {
      const [found, cfg] = await Promise.all([
        voCoreAPI.scanScreens(),
        voCoreAPI.getSelected(),
      ])
      setScreens(found)
      setSelected(cfg)

      // Auto-select if exactly one screen found and nothing saved yet.
      if (!cfg && found.length === 1) {
        const s = found[0]
        await voCoreAPI.selectScreen(s.vid, s.pid, s.width, s.height)
        setSelected({ vid: s.vid, pid: s.pid, width: s.width, height: s.height })
        setAutoSelected(true)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setScanning(false)
    }
  }, [])

  // Scan on mount.
  useEffect(() => { scan() }, [scan])

  const handleSelect = async (screen: DetectedVoCoreScreen) => {
    const key = screenKey(screen)
    setSelecting(key)
    setError(null)
    try {
      await voCoreAPI.selectScreen(screen.vid, screen.pid, screen.width, screen.height)
      setSelected({ vid: screen.vid, pid: screen.pid, width: screen.width, height: screen.height })
      setAutoSelected(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setSelecting(null)
    }
  }

  const isSelected = (s: DetectedVoCoreScreen) =>
    selected?.vid === s.vid && selected?.pid === s.pid

  return (
    <Card>
      <CardHeader className="border-b border-border-base">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">VoCore Screen</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={scan}
            disabled={scanning}
            className="text-text-muted hover:text-text-primary h-7"
          >
            {scanning ? 'Scanning…' : '↻ Scan'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        {scanning && screens.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-md" />
          </div>
        ) : screens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-text-muted">No VoCore screens detected</p>
            <p className="text-xs text-text-disabled">
              Connect your steering wheel via USB and press Scan
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {screens.map(s => {
              const key = screenKey(s)
              const active = isSelected(s)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelect(s)}
                  disabled={selecting === key}
                  className={cn(
                    'w-full flex items-center justify-between rounded-md px-3 py-2.5',
                    'border transition-all text-left',
                    active
                      ? 'border-accent bg-accent/8 ring-1 ring-accent/30'
                      : 'border-b border-border-base bg-bg-surface hover:bg-bg-elevated',
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-text-primary font-medium">
                      {s.description || `VoCore Screen (PID 0x${s.pid.toString(16).toUpperCase()})`}
                    </span>
                    <span className="text-xs font-mono text-text-muted tabular-nums">
                      {s.width}×{s.height}
                      {s.serial && (
                        <span className="ml-2 text-text-disabled">S/N: {s.serial}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                    {active && autoSelected && (
                      <Badge className="bg-teal/15 text-teal border border-teal/30 text-[10px]">
                        Auto-detected
                      </Badge>
                    )}
                    {active && (
                      <div className="h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-accent/30" />
                    )}
                    {selecting === key && (
                      <span className="text-xs text-text-muted">Connecting…</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {selected && (
          <p className="mt-3 text-[11px] text-text-disabled">
            Active: {selected.width}×{selected.height} · VID 0x{selected.vid.toString(16).toUpperCase()} PID 0x{selected.pid.toString(16).toUpperCase()}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ── DeviceCard ────────────────────────────────────────────────────────────────

function DeviceCard({
  device, models, isPrimary, onEdit, onDelete,
}: {
  device: DeviceConfig
  models: WheelModel[]
  isPrimary: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const model = models.find(m => m.id === device.modelId)

  return (
    <Card>
      <CardHeader className="border-b border-border-base">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium text-text-primary">
              {deviceDisplayName(device, models)}
            </CardTitle>
            {isPrimary && (
              <Badge className="bg-accent/15 text-accent border border-accent/30 text-[10px]">
                Active
              </Badge>
            )}
          </div>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-text-disabled hover:text-red-400 hover:bg-red-500/10"
            >
              Remove
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
          {model && (
            <InfoRow label="Model" value={modelDisplayName(model)} />
          )}
          <InfoRow label="Port" value={device.port || '—'} mono />
          {model && (
            <InfoRow
              label="Screen"
              value={`${model.screenWidth}×${model.screenHeight}`}
            />
          )}
          {model && (
            <InfoRow label="Baud" value={`${model.defaultBaud}`} mono />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function InfoRow({
  label, value, mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text-muted">{label}</span>
      <span className={cn('text-text-primary', mono && 'font-mono tabular-nums')}>
        {value}
      </span>
    </div>
  )
}

// ── DeviceDialog ──────────────────────────────────────────────────────────────

function DeviceDialog({
  device, models, onSave, onClose,
}: {
  device: DeviceConfig
  models: WheelModel[]
  onSave: (d: DeviceConfig) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm]       = useState<DeviceConfig>(device)
  const [ports, setPorts]     = useState<DetectedPort[]>([])
  const [scanningPorts, setScanningPorts] = useState(false)
  const [portsError, setPortsError]       = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)

  const isNew = !form.id

  const scanPorts = useCallback(async () => {
    setScanningPorts(true)
    setPortsError(null)
    try {
      const list = await deviceAPI.listPorts()
      setPorts(list)
    } catch (e) {
      setPortsError(String(e))
    } finally {
      setScanningPorts(false)
    }
  }, [])

  // Pre-select port if scanning reveals a matched port for the chosen model
  useEffect(() => {
    if (!form.modelId || ports.length === 0) return
    if (form.port) return // already set
    const match = ports.find(p => p.matchedModel?.id === form.modelId)
    if (match) setForm(f => ({ ...f, port: match.name }))
  }, [ports, form.modelId, form.port])

  // Auto-select model + port when exactly one known wheel is detected.
  useEffect(() => {
    if (form.modelId || form.port) return
    const matches = ports.filter(p => p.matchedModel?.id)
    if (matches.length !== 1) return
    const match = matches[0]
    const modelId = match.matchedModel?.id
    if (!modelId) return
    setForm(f => ({ ...f, modelId, port: match.name }))
  }, [ports, form.modelId, form.port])

  // Scan on open
  useEffect(() => { scanPorts() }, [scanPorts])

  const canSave = !!form.modelId && !!form.port

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent showCloseButton={false} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add Wheel' : 'Edit Wheel'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Model */}
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">Wheel Model</label>
            <Select
              value={form.modelId}
              onValueChange={v => setForm(f => ({ ...f, modelId: v, port: '' }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a wheel model…" />
              </SelectTrigger>
              <SelectContent>
                {models.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {modelDisplayName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Port */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs text-text-muted">Serial Port</label>
              <Button
                variant="ghost"
                size="xs"
                onClick={scanPorts}
                disabled={scanningPorts}
                className="h-5 px-2 text-[10px] text-text-muted hover:text-text-primary"
              >
                {scanningPorts ? 'Scanning…' : '↻ Refresh'}
              </Button>
            </div>
            {portsError && (
              <p className="mb-1.5 text-[11px] text-red-400">{portsError}</p>
            )}
            <Select
              value={form.port}
              onValueChange={v => setForm(f => ({ ...f, port: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={scanningPorts ? 'Scanning ports…' : 'Select a port…'} />
              </SelectTrigger>
              <SelectContent>
                {ports.length === 0 && !scanningPorts && (
                  <SelectItem value="__none__" disabled>No ports found</SelectItem>
                )}
                {ports.map(p => (
                  <SelectItem key={p.name} value={p.name}>
                    <span className="flex items-center gap-2">
                      {p.name}
                      {p.matchedModel && (
                        <span className="text-[10px] text-teal">
                          {p.matchedModel.manufacturer} {p.matchedModel.name}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator className="bg-border-subtle" />

          {/* Alias */}
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">
              Nickname <span className="text-text-disabled">(optional)</span>
            </label>
            <Input
              value={form.alias}
              onChange={e => setForm(f => ({ ...f, alias: e.target.value }))}
              placeholder={
                form.modelId
                  ? (models.find(m => m.id === form.modelId)
                      ? modelDisplayName(models.find(m => m.id === form.modelId)!)
                      : '')
                  : 'e.g. My Race Wheel'
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : isNew ? 'Add Wheel' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="surface-elevated rounded p-4">
        <WheelIcon className="h-8 w-8 text-text-muted" />
      </div>
      <div>
        <p className="text-sm font-medium text-text-secondary">No wheels configured</p>
        <p className="mt-1 text-xs text-text-muted">Add your steering wheel to enable serial features</p>
      </div>
      <Button
        variant="outline"
        onClick={onAdd}
        className="border-accent/40 text-accent hover:bg-accent/10 hover:text-accent"
      >
        + Add Wheel
      </Button>
    </div>
  )
}

function WheelIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4m0 10v4M3 12h4m10 0h4" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}
