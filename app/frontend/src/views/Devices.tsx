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
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Devices</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing(newDeviceConfig())}
          className="border-accent/40 text-accent hover:bg-accent/10 hover:text-accent"
        >
          + Add Wheel
        </Button>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* Device list */}
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
      <CardHeader className="border-b border-border-glass">
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

          <Separator className="bg-border-glass" />

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
      <div className="glass rounded-full p-4">
        <WheelIcon className="h-8 w-8 text-text-muted" />
      </div>
      <div>
        <p className="text-sm font-medium text-text-secondary">No wheels configured</p>
        <p className="mt-1 text-xs text-text-muted">Add your steering wheel to enable the VoCore screen</p>
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
