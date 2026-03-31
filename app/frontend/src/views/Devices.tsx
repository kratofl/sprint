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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Input,
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
    <div className="flex flex-1 flex-col overflow-hidden">

      {/* Section header */}
      <div className="border-b border-[#2a2a2a] px-6 py-4 flex-shrink-0">
        <h2 className="terminal-header text-sm font-bold tracking-[0.2em]">DEVICE_CONFIG</h2>
        {error && <p className="mt-1 font-mono text-[10px] text-[#F87171]">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* VoCore screen selector */}
        <VoCoreScreenSection />

        {/* Advanced: serial wheel config */}
        <div className="border-t border-[#2a2a2a]">
          <button
            type="button"
            onClick={() => setAdvancedOpen(o => !o)}
            className="flex w-full items-center gap-3 border-b border-[#2a2a2a] px-6 py-3 transition-colors hover:bg-[#141414]"
          >
            <svg
              className={cn('h-3 w-3 transition-transform text-[#808080]', advancedOpen && 'rotate-90')}
              viewBox="0 0 6 10" fill="none" stroke="currentColor" strokeWidth="1.5"
            >
              <path d="M1 1l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="terminal-header text-[10px] font-bold text-[#808080]">
              ADVANCED — SERIAL_WHEEL_MODEL
            </span>
          </button>

          {advancedOpen && (
            <div>
              <div className="flex items-center justify-between border-b border-[#2a2a2a] px-6 py-3">
                <p className="font-mono text-[9px] text-[#808080]">
                  Legacy serial config. Not required when using USB VoCore auto-detection.
                </p>
                <button
                  onClick={() => setEditing(newDeviceConfig())}
                  className="terminal-header ml-4 flex-shrink-0 border border-[#ff906c] px-2.5 py-1 text-[9px] text-[#ff906c] transition-colors hover:bg-[#ff906c] hover:text-[#0a0a0a]"
                >
                  + ADD_WHEEL
                </button>
              </div>

              {loading ? (
                <div className="space-y-0">
                  {[0, 1].map(i => (
                    <div key={i} className="border-b border-[#2a2a2a] px-6 py-4">
                      <Skeleton className="mb-2 h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  ))}
                </div>
              ) : devices.length === 0 ? (
                <EmptyState onAdd={() => setEditing(newDeviceConfig())} />
              ) : (
                <div>
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
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-6 py-3">
        <h4 className="terminal-header text-[10px] font-bold text-[#808080]">VOCORE_SCREEN</h4>
        <button
          onClick={scan}
          disabled={scanning}
          className="terminal-header border border-[#2a2a2a] px-2.5 py-1 text-[9px] text-[#808080] transition-colors hover:border-[#3a3a3a] hover:text-white disabled:opacity-50"
        >
          {scanning ? 'SCANNING…' : '↻ SCAN'}
        </button>
      </div>

      <div className="px-6 py-4">
        {error && <p className="mb-3 font-mono text-[10px] text-[#F87171]">{error}</p>}

        {scanning && screens.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
          </div>
        ) : screens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="terminal-header text-[10px] text-[#808080]">NO_SCREENS_DETECTED</p>
            <p className="font-mono text-[9px] text-[#808080]">
              Connect steering wheel via USB and press SCAN
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
                    'w-full flex items-center justify-between border px-4 py-3 text-left transition-all',
                    active
                      ? 'border-[#ff906c] bg-[#ff906c]/5'
                      : 'border-[#2a2a2a] hover:bg-[#141414]',
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[11px] font-bold">
                      {s.description || `VoCore Screen (PID 0x${s.pid.toString(16).toUpperCase()})`}
                    </span>
                    <span className="font-mono text-[9px] text-[#808080]">
                      {s.width}×{s.height}
                      {s.serial && <span className="ml-2">S/N: {s.serial}</span>}
                    </span>
                  </div>
                  <div className="ml-4 flex flex-shrink-0 items-center gap-2">
                    {active && autoSelected && (
                      <span className="terminal-header text-[9px] text-[#5af8fb]">AUTO-DETECTED</span>
                    )}
                    {active && (
                      <div className="h-2 w-2 rounded-full bg-[#ff906c]" />
                    )}
                    {selecting === key && (
                      <span className="font-mono text-[9px] text-[#808080]">CONNECTING…</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {selected && (
          <p className="mt-3 font-mono text-[9px] text-[#808080]">
            ACTIVE: {selected.width}×{selected.height} · VID 0x{selected.vid.toString(16).toUpperCase()} PID 0x{selected.pid.toString(16).toUpperCase()}
          </p>
        )}
      </div>
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
    <div className="border-b border-[#2a2a2a]">
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-bold">
            {deviceDisplayName(device, models)}
          </span>
          {isPrimary && (
            <span className="terminal-header text-[9px] text-[#ff906c]">ACTIVE</span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit} className="terminal-header text-[9px] text-[#808080] transition-colors hover:text-white">
            EDIT
          </button>
          <button onClick={onDelete} className="terminal-header text-[9px] text-[#808080] transition-colors hover:text-[#F87171]">
            REMOVE
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 px-6 py-3">
        {model && <InfoRow label="MODEL" value={modelDisplayName(model)} />}
        <InfoRow label="PORT" value={device.port || '—'} mono />
        {model && <InfoRow label="SCREEN" value={`${model.screenWidth}×${model.screenHeight}`} />}
        {model && <InfoRow label="BAUD" value={`${model.defaultBaud}`} mono />}
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="terminal-header text-[9px] text-[#808080]">{label}</span>
      <span className={cn('font-mono text-[10px]', mono && 'tabular-nums')}>
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

  useEffect(() => {
    if (!form.modelId || ports.length === 0) return
    if (form.port) return
    const match = ports.find(p => p.matchedModel?.id === form.modelId)
    if (match) setForm(f => ({ ...f, port: match.name }))
  }, [ports, form.modelId, form.port])

  useEffect(() => {
    if (form.modelId || form.port) return
    const matches = ports.filter(p => p.matchedModel?.id)
    if (matches.length !== 1) return
    const match = matches[0]
    const modelId = match.matchedModel?.id
    if (!modelId) return
    setForm(f => ({ ...f, modelId, port: match.name }))
  }, [ports, form.modelId, form.port])

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
          <DialogTitle className="terminal-header text-sm tracking-[0.15em]">
            {isNew ? 'ADD_WHEEL' : 'EDIT_WHEEL'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="terminal-header mb-1.5 block text-[9px] text-[#808080]">WHEEL_MODEL</label>
            <Select
              value={form.modelId}
              onValueChange={v => setForm(f => ({ ...f, modelId: v, port: '' }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a wheel model…" />
              </SelectTrigger>
              <SelectContent>
                {models.map(m => (
                  <SelectItem key={m.id} value={m.id}>{modelDisplayName(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="terminal-header text-[9px] text-[#808080]">SERIAL_PORT</label>
              <button
                onClick={scanPorts}
                disabled={scanningPorts}
                className="terminal-header text-[9px] text-[#808080] transition-colors hover:text-white disabled:opacity-50"
              >
                {scanningPorts ? 'SCANNING…' : '↻ REFRESH'}
              </button>
            </div>
            {portsError && <p className="mb-1.5 font-mono text-[10px] text-[#F87171]">{portsError}</p>}
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
                        <span className="text-[10px] text-[#5af8fb]">
                          {p.matchedModel.manufacturer} {p.matchedModel.name}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="terminal-header mb-1.5 block text-[9px] text-[#808080]">
              NICKNAME <span className="text-[#808080]/50">(optional)</span>
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
          <button
            onClick={onClose}
            className="terminal-header border border-[#2a2a2a] px-3 py-1.5 text-[10px] text-[#808080] transition-colors hover:border-[#3a3a3a] hover:text-white"
          >
            CANCEL
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="terminal-header border border-[#ff906c] px-3 py-1.5 text-[10px] text-[#ff906c] transition-colors hover:bg-[#ff906c] hover:text-[#0a0a0a] disabled:opacity-50"
          >
            {saving ? 'SAVING…' : isNew ? 'ADD_WHEEL' : 'SAVE'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <WheelIcon className="h-8 w-8 text-[#808080]" />
      <div>
        <p className="terminal-header text-[10px] font-bold text-[#808080]">NO_WHEELS_CONFIGURED</p>
        <p className="mt-1 font-mono text-[9px] text-[#808080]">Add your steering wheel to enable serial features</p>
      </div>
      <button
        onClick={onAdd}
        className="terminal-header border border-[#ff906c] px-4 py-2 text-[10px] text-[#ff906c] transition-colors hover:bg-[#ff906c] hover:text-[#0a0a0a]"
      >
        + ADD_WHEEL
      </button>
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

