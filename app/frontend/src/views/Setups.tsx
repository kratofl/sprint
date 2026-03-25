import { useState, useEffect, useCallback } from 'react'
import { Setup, SetupSettings, setupAPI, newSetup } from '@/lib/setup'
import { Button } from '@sprint/ui'

// ── Setups view ───────────────────────────────────────────────────────────────

export default function Setups() {
  const [setups, setSetups]     = useState<Setup[]>([])
  const [editing, setEditing]   = useState<Setup | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Filters
  const [filterCar, setFilterCar]     = useState('')
  const [filterTrack, setFilterTrack] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const all = await setupAPI.listAll()
      setSetups(all)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Unique filter options
  const cars   = [...new Set(setups.map(s => s.car))].sort()
  const tracks = [...new Set(setups.map(s => s.track))].sort()

  const filtered = setups.filter(s =>
    (!filterCar   || s.car   === filterCar) &&
    (!filterTrack || s.track === filterTrack),
  )

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleNew = () => setEditing(newSetup())

  const handleEdit = (s: Setup) => setEditing({ ...s, settings: { ...s.settings } })

  const handleDelete = async (s: Setup) => {
    if (!confirm(`Delete "${s.name}"?`)) return
    try {
      await setupAPI.delete(s.car, s.track, s.id)
      setSetups(prev => prev.filter(x => x.id !== s.id))
      if (editing?.id === s.id) setEditing(null)
    } catch (e) {
      setError(String(e))
    }
  }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      const saved = await setupAPI.save(editing)
      setSetups(prev => {
        const idx = prev.findIndex(s => s.id === saved.id)
        return idx >= 0
          ? prev.map(s => (s.id === saved.id ? saved : s))
          : [...prev, saved]
      })
      setEditing(saved)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: setup list ─────────────────────────────────────────────── */}
      <div className="flex w-72 flex-shrink-0 flex-col border-r border-border-glass">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-glass">
          <h1 className="text-sm font-semibold text-text-primary">Setups</h1>
          <Button
            onClick={handleNew}
            className="rounded px-2 py-1 text-xs font-medium text-accent border border-accent/40 hover:bg-accent/10 transition-colors"
          >
            + New
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 px-3 py-3 border-b border-border-glass">
          <FilterSelect
            value={filterCar}
            onChange={setFilterCar}
            options={cars}
            placeholder="All cars"
          />
          <FilterSelect
            value={filterTrack}
            onChange={setFilterTrack}
            options={tracks}
            placeholder="All tracks"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <p className="px-4 py-8 text-center text-xs text-text-muted">Loading…</p>
          )}
          {!loading && filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-text-muted">
              {setups.length === 0 ? 'No setups yet. Create one!' : 'No results for filters.'}
            </p>
          )}
          {filtered.map(s => (
            <SetupRow
              key={s.id}
              setup={s}
              active={editing?.id === s.id}
              onEdit={() => handleEdit(s)}
              onDelete={() => handleDelete(s)}
            />
          ))}
        </div>

        {error && (
          <p className="px-3 py-2 text-xs text-red-400 border-t border-border-glass">{error}</p>
        )}
      </div>

      {/* ── Right: editor ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {editing ? (
          <SetupEditor
            setup={editing}
            saving={saving}
            onChange={setEditing}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <EmptyState onNew={handleNew} />
        )}
      </div>
    </div>
  )
}

// ── SetupRow ──────────────────────────────────────────────────────────────────

function SetupRow({
  setup, active, onEdit, onDelete,
}: {
  setup: Setup; active: boolean; onEdit: () => void; onDelete: () => void
}) {
  return (
    <button
      onClick={onEdit}
      className={[
        'w-full text-left px-4 py-3 border-b border-border-glass/50 transition-colors group',
        active ? 'bg-accent/10' : 'hover:bg-bg-elevated',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`truncate text-sm font-medium ${active ? 'text-accent' : 'text-text-primary'}`}>
            {setup.name || 'Untitled'}
          </p>
          <p className="truncate text-xs text-text-muted mt-0.5">{setup.car} · {setup.track}</p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 rounded p-1 text-text-disabled hover:text-red-400 hover:bg-red-500/10 transition-all"
          title="Delete"
        >
          <TrashIcon />
        </button>
      </div>
    </button>
  )
}

// ── FilterSelect ──────────────────────────────────────────────────────────────

function FilterSelect({
  value, onChange, options, placeholder,
}: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded bg-bg-elevated border border-border-glass px-2 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-accent/50 appearance-none"
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

// ── SetupEditor ───────────────────────────────────────────────────────────────

function SetupEditor({
  setup, saving, onChange, onSave, onCancel,
}: {
  setup: Setup
  saving: boolean
  onChange: (s: Setup) => void
  onSave: () => void
  onCancel: () => void
}) {
  const isNew = !setup.id

  const updateField = (field: keyof Omit<Setup, 'settings'>, value: string) =>
    onChange({ ...setup, [field]: value })

  const updateSetting = (key: keyof SetupSettings, value: number | string) =>
    onChange({ ...setup, settings: { ...setup.settings, [key]: value } })

  return (
    <div className="flex flex-col h-full">
      {/* Editor header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-glass flex-shrink-0">
        <h2 className="text-sm font-semibold text-text-primary">
          {isNew ? 'New Setup' : `Edit — ${setup.name}`}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-text-secondary border border-border-glass hover:bg-bg-elevated transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded px-3 py-1.5 text-xs font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Meta */}
        <Section title="Setup Info">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Name" span={3}>
              <TextInput
                value={setup.name}
                onChange={v => updateField('name', v)}
                placeholder="e.g. Monza Qualifying"
              />
            </Field>
            <Field label="Car">
              <TextInput
                value={setup.car}
                onChange={v => updateField('car', v)}
                placeholder="Ferrari 499P"
              />
            </Field>
            <Field label="Track" span={2}>
              <TextInput
                value={setup.track}
                onChange={v => updateField('track', v)}
                placeholder="Monza"
              />
            </Field>
          </div>
        </Section>

        {/* Tyres */}
        <Section title="Tyres">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <PressureField label="FL Pressure" value={setup.settings.tyrePressureFL} onChange={v => updateSetting('tyrePressureFL', v)} />
            <PressureField label="FR Pressure" value={setup.settings.tyrePressureFR} onChange={v => updateSetting('tyrePressureFR', v)} />
            <PressureField label="RL Pressure" value={setup.settings.tyrePressureRL} onChange={v => updateSetting('tyrePressureRL', v)} />
            <PressureField label="RR Pressure" value={setup.settings.tyrePressureRR} onChange={v => updateSetting('tyrePressureRR', v)} />
          </div>
          <Field label="Compound">
            <select
              value={setup.settings.tyreCompound}
              onChange={e => updateSetting('tyreCompound', e.target.value)}
              className="w-full rounded bg-bg-elevated border border-border-glass px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent/50"
            >
              {(['Soft', 'Medium', 'Hard', 'Wet'] as const).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
        </Section>

        {/* Aero */}
        <Section title="Aerodynamics">
          <SliderField label="Front Wing"  value={setup.settings.frontWing}  min={0}   max={100} unit="" onChange={v => updateSetting('frontWing', v)} />
          <SliderField label="Rear Wing"   value={setup.settings.rearWing}   min={0}   max={100} unit="" onChange={v => updateSetting('rearWing', v)} />
        </Section>

        {/* Suspension */}
        <Section title="Suspension">
          <SliderField label="Ride Height Front" value={setup.settings.rideHeightFront} min={50} max={120} unit="mm" onChange={v => updateSetting('rideHeightFront', v)} />
          <SliderField label="Ride Height Rear"  value={setup.settings.rideHeightRear}  min={50} max={120} unit="mm" onChange={v => updateSetting('rideHeightRear', v)} />
        </Section>

        {/* Differential */}
        <Section title="Differential">
          <SliderField label="Preload"    value={setup.settings.diffPreload} min={20}  max={200} unit="Nm" onChange={v => updateSetting('diffPreload', v)} />
          <SliderField label="Power Lock" value={setup.settings.diffPower}   min={0}   max={100} unit="%" onChange={v => updateSetting('diffPower', v)} />
          <SliderField label="Coast Lock" value={setup.settings.diffCoast}   min={0}   max={100} unit="%" onChange={v => updateSetting('diffCoast', v)} />
        </Section>

        {/* Brakes */}
        <Section title="Brakes">
          <SliderField label="Bias (front)"  value={setup.settings.brakeBias}     min={50}  max={65}  unit="%" step={0.5} onChange={v => updateSetting('brakeBias', v)} />
          <SliderField label="Max Pressure"  value={setup.settings.brakePressure} min={70}  max={100} unit="%" onChange={v => updateSetting('brakePressure', v)} />
        </Section>
      </div>
    </div>
  )
}

// ── Small reusable editor components ─────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-border-glass">
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{title}</p>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  return (
    <div className={span ? `col-span-${span}` : undefined}>
      <label className="block text-xs text-text-muted mb-1">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded bg-bg-elevated border border-border-glass px-2 py-1.5 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent/50 transition-colors"
    />
  )
}

function SliderField({
  label, value, min, max, unit, step = 1, onChange,
}: {
  label: string; value: number; min: number; max: number; unit: string; step?: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 flex-shrink-0 text-xs text-text-secondary">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-[#EF8118] h-1.5 cursor-pointer"
      />
      <span className="w-16 text-right text-xs font-mono tabular-nums text-text-primary">
        {Number.isInteger(step) ? value.toFixed(0) : value.toFixed(1)}{unit && ` ${unit}`}
      </span>
    </div>
  )
}

function PressureField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={160} max={230} step={0.5}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full rounded bg-bg-elevated border border-border-glass px-2 py-1.5 text-xs font-mono tabular-nums text-text-primary focus:outline-none focus:border-accent/50 transition-colors"
        />
        <span className="text-xs text-text-muted">kPa</span>
      </div>
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
      <div className="glass rounded-full p-4">
        <WrenchIcon className="h-8 w-8 text-text-muted" />
      </div>
      <div>
        <p className="text-sm font-medium text-text-secondary">Select a setup to edit</p>
        <p className="text-xs text-text-muted mt-1">or create a new one to get started</p>
      </div>
      <button
        onClick={onNew}
        className="rounded-md border border-accent/40 px-4 py-2 text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
      >
        + New Setup
      </button>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
    </svg>
  )
}

function WrenchIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
    </svg>
  )
}

