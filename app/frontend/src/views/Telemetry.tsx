import { useEffect, useState } from 'react'
import type { FormatPreferences, TelemetryFrame } from '@sprint/types'
import { dashAPI } from '@/lib/dash'
import { fmtDelta, fmtLap, resolvedPrefs } from '@/lib/format'

export interface TelemetryProps {
  frame: TelemetryFrame | null
}

type Tone = 'default' | 'orange' | 'green' | 'red' | 'amber'

function toneClass(tone: Tone): string {
  switch (tone) {
    case 'orange': return 'text-[var(--orange)]'
    case 'green': return 'text-[var(--green)]'
    case 'red': return 'text-[var(--red)]'
    case 'amber': return 'text-[var(--amber)]'
    default: return 'text-[var(--text)]'
  }
}

function Panel({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px] ${className}`}>
      <div className="mb-[14px] flex items-start justify-between gap-[10px]">
        <div>
          <div className="font-inter text-[13px] font-bold text-[var(--text)]">{title}</div>
          {subtitle && <div className="font-inter text-[11px] text-[var(--muted)]">{subtitle}</div>}
        </div>
      </div>
      {children}
    </section>
  )
}

function Metric({
  label,
  value,
  unit,
  tone = 'default',
}: {
  label: string
  value: string
  unit?: string
  tone?: Tone
}) {
  return (
    <div className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
      <div className="font-inter text-[10px] font-bold uppercase tracking-[.12em] text-[var(--muted)]">{label}</div>
      <div className={`mt-[6px] font-saira text-[32px] font-semibold tabular-nums leading-none ${toneClass(tone)}`}>
        {value}
        {unit && <span className="ml-[6px] font-inter text-[11px] font-normal text-[var(--muted)]">{unit}</span>}
      </div>
    </div>
  )
}

function AlertRow({
  title,
  body,
  tone,
}: {
  title: string
  body: string
  tone: 'red' | 'amber' | 'green'
}) {
  const ring = tone === 'red' ? 'var(--red-ring)' : tone === 'amber' ? 'var(--amber-ring)' : 'var(--green-ring)'
  const tint = tone === 'red' ? 'var(--red-tint)' : tone === 'amber' ? 'var(--amber-tint)' : 'var(--green-tint)'
  const ink = tone === 'red' ? 'var(--red)' : tone === 'amber' ? 'var(--amber)' : 'var(--green)'

  return (
    <div className="flex gap-[10px] rounded-alert border border-[var(--border)] bg-[var(--panel)] p-[10px]">
      <div
        className="flex size-[28px] items-center justify-center rounded-tile border text-[13px] font-bold"
        style={{ borderColor: ring, backgroundColor: tint, color: ink }}
      >
        !
      </div>
      <div className="min-w-0">
        <div className="font-inter text-[13px] font-bold text-[var(--text)]">{title}</div>
        <div className="font-inter text-[11px] leading-relaxed text-[var(--muted)]">{body}</div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-[10px] rounded-alert border border-[var(--border)] bg-[var(--panel-2)] px-[10px] py-[8px]">
      <span className="font-inter text-[11px] text-[var(--muted)]">{label}</span>
      <span className="font-saira text-[12px] tabular-nums text-[var(--text)]">{value}</span>
    </div>
  )
}

export default function Telemetry({ frame }: TelemetryProps) {
  const [formatPrefs, setFormatPrefs] = useState<FormatPreferences | undefined>(undefined)

  useEffect(() => {
    dashAPI.getGlobalSettings()
      .then(settings => setFormatPrefs(settings.formatPreferences))
      .catch(() => {})
  }, [])

  const prefs = resolvedPrefs(formatPrefs)
  const speed = frame ? Math.round(frame.car.speedMS * 3.6).toString() : '247'
  const gear = frame?.car.gear?.toString() ?? '3'
  const rpm = frame?.car.rpm ? Math.round(frame.car.rpm).toLocaleString('en-US') : '8,543'
  const fuel = frame?.car.fuel ? frame.car.fuel.toFixed(1) : '32.5'
  const bestLap = fmtLap(frame?.lap.bestLapTime ?? 93.892, prefs)
  const lastLap = fmtLap(frame?.lap.lastLapTime ?? 94.123, prefs)
  const delta = frame ? fmtDelta(frame.lap.delta ?? 0, prefs) : '+0.234'
  const deltaTone: Tone = frame && (frame.lap.delta ?? 0) < 0 ? 'green' : 'red'

  return (
    <section className="grid h-full min-h-0 grid-cols-12 gap-[14px] overflow-hidden">
      <div className="col-span-8 flex min-h-0 flex-col gap-[14px]">
        <Panel title="Dashboard" subtitle={frame ? 'Live telemetry stream' : 'Simulation preview'}>
          <div className="grid grid-cols-4 gap-[10px]">
            <Metric label="Speed" value={speed} unit="km/h" tone="orange" />
            <Metric label="Gear" value={gear} />
            <Metric label="RPM" value={rpm} tone="amber" />
            <Metric label="Fuel" value={fuel} unit="L" tone="green" />
          </div>
        </Panel>

        <div className="grid min-h-0 grid-cols-2 gap-[14px]">
          <Panel title="Lap Pace" subtitle="Current stint">
            <div className="grid grid-cols-3 gap-[10px]">
              <Metric label="Best" value={bestLap} tone="orange" />
              <Metric label="Last" value={lastLap} />
              <Metric label="Delta" value={delta} tone={deltaTone} />
            </div>
          </Panel>

          <Panel title="Track Map" subtitle={frame?.session.track ?? 'Spa-Francorchamps'}>
            <svg viewBox="0 0 260 132" className="h-[132px] w-full" aria-hidden="true">
              <path d="M38 98 C65 72 86 114 116 92 S154 42 185 64 S230 47 214 23 S156 13 140 35 S99 31 84 58 S43 55 38 98" fill="none" stroke="var(--border-2)" strokeWidth="12" strokeLinecap="round" />
              <path d="M38 98 C65 72 86 114 116 92 S154 42 185 64" fill="none" stroke="var(--orange)" strokeWidth="7" strokeLinecap="round" />
              <path d="M185 64 S230 47 214 23 S156 13 140 35" fill="none" stroke="var(--green)" strokeWidth="7" strokeLinecap="round" />
              <circle cx="38" cy="98" r="5" fill="var(--text)" />
              <circle cx="185" cy="64" r="5" fill="var(--orange)" />
            </svg>
          </Panel>
        </div>

        <Panel title="Tyres" subtitle="Temperature and wear">
          <div className="grid grid-cols-4 gap-[10px]">
            {['FL', 'FR', 'RL', 'RR'].map((label, index) => {
              const tire = frame?.tires[index]
              const temp = tire?.tempMiddle ? tire.tempMiddle.toFixed(0) : '93'
              const wear = tire?.wearPercent ? tire.wearPercent.toFixed(0) : '82'
              return <Metric key={label} label={`${label} tyre`} value={`${temp} / ${wear}`} unit="C %" tone={index === 0 ? 'amber' : 'green'} />
            })}
          </div>
        </Panel>
      </div>

      <aside className="col-span-4 flex min-h-0 flex-col gap-[14px] overflow-hidden">
        <Panel title="Alerts" subtitle="3 active">
          <div className="flex flex-col gap-[10px]">
            <AlertRow title="Low Fuel" body="8 laps remaining at current pace." tone="red" />
            <AlertRow title="Tyre Wear" body="Front-left graining detected in sector 2." tone="amber" />
            <AlertRow title="System Ready" body="Telemetry bridge and display output are healthy." tone="green" />
          </div>
        </Panel>

        <Panel title="Session Info" subtitle="Car and stint state" className="min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-[8px]">
            <InfoRow label="Car" value={frame?.session.car || 'GT3 #7'} />
            <InfoRow label="Track" value={frame?.session.track || 'Spa-Francorchamps'} />
            <InfoRow label="Weather" value="Dry / 24 C" />
            <InfoRow label="Session" value={frame ? fmtLap(frame.session.sessionTime, prefs) : '28:42'} />
          </div>
        </Panel>
      </aside>
    </section>
  )
}
