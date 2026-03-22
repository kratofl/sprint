import { useTelemetry } from '@/hooks/useTelemetry'

export default function Telemetry() {
  const { frame, connected } = useTelemetry()

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Live Telemetry</h1>
        <div className="flex items-center gap-2 text-xs">
          <span className={[
            'h-1.5 w-1.5 rounded-full',
            connected ? 'bg-teal animate-pulse' : 'bg-text-disabled',
          ].join(' ')} />
          <span className="text-text-secondary">{connected ? 'Connected' : 'Waiting for game…'}</span>
        </div>
      </div>

      {/* Top row — key stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Speed" value={frame ? `${(frame.car.speedMS * 3.6).toFixed(0)}` : '—'} unit="km/h" />
        <StatCard label="Gear"  value={frame ? gearLabel(frame.car.gear) : '—'} />
        <StatCard label="RPM"   value={frame ? frame.car.rpm.toFixed(0) : '—'} />
        <StatCard label="Fuel"  value={frame ? frame.car.fuel.toFixed(1) : '—'} unit="L" />
      </div>

      {/* Lap times */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Current Lap" value={frame ? formatTime(frame.lap.currentLapTime) : '—:---.---'} mono />
        <StatCard label="Last Lap"    value={frame ? formatTime(frame.lap.lastLapTime)    : '—:---.---'} mono />
        <StatCard label="Target"      value={frame ? formatTime(frame.lap.targetLapTime)  : '—:---.---'} mono accent="teal" />
      </div>

      {/* Inputs */}
      <div className="glass rounded-lg p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">Driver Inputs</p>
        <div className="space-y-2">
          <InputBar label="Throttle" value={frame?.car.throttle ?? 0} color="bg-teal" />
          <InputBar label="Brake"    value={frame?.car.brake    ?? 0} color="bg-accent" />
          <InputBar label="Steering" value={frame ? (frame.car.steering + 1) / 2 : 0.5} color="bg-text-secondary" center />
        </div>
      </div>

      {/* Tyre temps */}
      <div className="glass rounded-lg p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">Tyre Temperatures (°C)</p>
        <div className="grid grid-cols-2 gap-3">
          {(['FL', 'FR', 'RL', 'RR'] as const).map((corner, i) => (
            <TyreCard
              key={corner}
              label={corner}
              temp={frame?.tires[i]?.tempSurface}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label, value, unit, mono, accent,
}: {
  label: string; value: string; unit?: string; mono?: boolean; accent?: 'orange' | 'teal'
}) {
  return (
    <div className="glass rounded-lg p-4">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className={[
        'text-2xl font-semibold tabular',
        mono ? 'font-mono' : '',
        accent === 'teal' ? 'text-teal' : accent === 'orange' ? 'text-accent' : 'text-text-primary',
      ].join(' ')}>
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-text-muted">{unit}</span>}
      </p>
    </div>
  )
}

function InputBar({
  label, value, color, center,
}: {
  label: string; value: number; color: string; center?: boolean
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 text-xs text-text-secondary">{label}</span>
      <div className="relative h-2 flex-1 rounded-full bg-bg-elevated">
        {center ? (
          <div
            className={`absolute top-0 h-full rounded-full ${color} opacity-70`}
            style={{
              left: `${Math.min(pct, 50)}%`,
              width: `${Math.abs(pct - 50)}%`,
            }}
          />
        ) : (
          <div
            className={`absolute left-0 top-0 h-full rounded-full ${color} opacity-70`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className="w-10 text-right text-xs tabular text-text-secondary">
        {center
          ? `${((value * 2 - 1) * 100).toFixed(0)}%`
          : `${(value * 100).toFixed(0)}%`}
      </span>
    </div>
  )
}

function TyreCard({ label, temp }: { label: string; temp?: number }) {
  const display = temp != null ? temp.toFixed(1) : '—'
  const color = temp != null ? tyreColor(temp) : 'text-text-disabled'
  return (
    <div className="flex items-center justify-between rounded-md bg-bg-elevated px-3 py-2">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className={`text-sm font-semibold tabular ${color}`}>{display}</span>
    </div>
  )
}

function tyreColor(temp: number): string {
  if (temp < 60)  return 'text-blue-400'
  if (temp < 80)  return 'text-teal'
  if (temp < 100) return 'text-accent'
  return 'text-red-400'
}

function gearLabel(gear: number): string {
  if (gear === -1) return 'R'
  if (gear === 0)  return 'N'
  return gear.toString()
}

function formatTime(seconds: number): string {
  if (!seconds) return '—:---.---'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}
