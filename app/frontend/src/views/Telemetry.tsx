import {
  DeltaBar,
  RPMBar,
  InputTrace,
} from '@sprint/ui'
import type { TelemetryFrame } from '@sprint/types'
import { cn } from '@sprint/ui'

export interface TelemetryProps {
  frame: TelemetryFrame | null
}

// Go LapState sends times in seconds (float64).
function fmt(sec: number | undefined): string {
  if (!sec || sec <= 0) return '—:——.———'
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(3).padStart(6, '0')
  return `${m}:${s}`
}

function fmtDelta(sec: number): string {
  const s = Math.abs(sec).toFixed(3)
  return sec >= 0 ? `+${s}` : `-${s}`
}

export default function Telemetry({ frame }: TelemetryProps) {
  const tires = frame?.tires ?? []
  const TIRE_LABELS = [
    { pos: 'POS_FL', name: 'FRONT_LEFT' },
    { pos: 'POS_FR', name: 'FRONT_RIGHT' },
    { pos: 'POS_RL', name: 'REAR_LEFT'  },
    { pos: 'POS_RR', name: 'REAR_RIGHT' },
  ]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

      {/* ── Top row: 12-col grid ───────────────────────────────────────── */}
      <div className="grid grid-cols-12 border-b border-[#2a2a2a] flex-[0_0_auto] min-h-0" style={{ height: '60%' }}>

        {/* Left: chart area — col-span-9 */}
        <section className="col-span-9 flex flex-col border-r border-[#2a2a2a] p-6 overflow-hidden">
          {/* Section header: title + big stats */}
          <div className="mb-6 flex items-start justify-between flex-shrink-0">
            <div>
              <h2 className="terminal-header mb-1 text-sm font-bold tracking-[0.2em]">
                LIVE_TELEMETRY_FEED
              </h2>
              <p className="font-mono text-[10px] text-[#808080]">
                SESSION: {frame?.session.sessionType?.toUpperCase() ?? 'NO_SESSION'} | TRACK: {frame?.session.track?.toUpperCase().replace(/\s+/g, '_') ?? '——'}
              </p>
            </div>
            <div className="flex gap-12">
              <div className="text-right">
                <span className="terminal-header block mb-1 text-[9px] text-[#808080]">Velocity</span>
                <span className="font-mono text-3xl font-bold leading-none">
                  {frame ? (frame.car.speedMS * 3.6).toFixed(1) : '——'}
                  <span className="text-[10px] text-[#808080]"> KM/H</span>
                </span>
              </div>
              <div className="text-right">
                <span className="terminal-header block mb-1 text-[9px] text-[#808080]">T_Angular</span>
                <span className="font-mono text-3xl font-bold leading-none text-[#ff906c]">
                  {frame ? Math.round(frame.car.rpm).toLocaleString('en-US') : '——'}
                  <span className="text-[10px] text-[#808080]"> RPM</span>
                </span>
              </div>
              <div className="text-right">
                <span className="terminal-header block mb-1 text-[9px] text-[#808080]">Gear</span>
                <span className="font-mono text-3xl font-bold leading-none">
                  {frame ? (frame.car.gear === 0 ? 'N' : frame.car.gear === -1 ? 'R' : String(frame.car.gear)) : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* RPM bar + inputs */}
          <div className="flex flex-col gap-4 flex-shrink-0">
            <RPMBar rpm={frame?.car.rpm ?? 0} maxRpm={frame?.car.maxRPM || 10000} />
            <div>
              <span className="terminal-header mb-2 block text-[9px] text-[#808080]">DRIVER_INPUTS</span>
              <InputTrace
                throttle={frame?.car.throttle ?? 0}
                brake={frame?.car.brake ?? 0}
                clutch={frame?.car.clutch ?? 0}
                steering={frame?.car.steering ?? 0}
              />
            </div>
          </div>
        </section>

        {/* Right: chrono — col-span-3 */}
        <section className="col-span-3 flex flex-col overflow-hidden">
          <div className="border-b border-[#2a2a2a] p-4">
            <h3 className="terminal-header mb-4 text-[10px] font-bold text-[#808080]">
              CHRONO_SUMMARY
            </h3>
            <div className="space-y-1">
              <div className="flex items-center justify-between border border-[#2a2a2a] bg-white/[0.02] p-3">
                <span className="font-mono text-[9px] text-[#808080]">P1_BEST</span>
                <span className="font-mono text-lg font-bold text-[#5af8fb]">
                  {fmt(frame?.lap.bestLapTime)}
                </span>
              </div>
              <div className="flex items-center justify-between border border-[#2a2a2a] bg-white/[0.01] p-3">
                <span className="font-mono text-[9px] text-[#808080]">L_SESS</span>
                <span className="font-mono text-lg font-bold">
                  {fmt(frame?.lap.lastLapTime)}
                </span>
              </div>
              {frame && frame.lap.targetLapTime > 0 && (
                <div className="mt-2">
                  <span className="terminal-header text-[9px] text-[#808080] block mb-1">Δ_TARGET</span>
                  <DeltaBar delta={frame.lap.currentLapTime - frame.lap.targetLapTime} />
                </div>
              )}
            </div>
          </div>

          {/* Lap table */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full font-mono text-[10px]">
              <thead className="sticky top-0 border-b border-[#2a2a2a] bg-[#0a0a0a]">
                <tr className="text-[#808080]/60">
                  <th className="px-4 py-2 text-left font-normal uppercase">Lap</th>
                  <th className="px-4 py-2 text-left font-normal uppercase">Time</th>
                  <th className="px-4 py-2 text-right font-normal uppercase">Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]/30">
                {frame?.lap.lastLapTime ? (
                  <>
                    <tr className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-[#808080]">L</td>
                      <td className="px-4 py-2.5 font-bold">{fmt(frame.lap.lastLapTime)}</td>
                      <td className={cn('px-4 py-2.5 text-right', frame.lap.lastLapTime <= (frame.lap.bestLapTime || Infinity) ? 'text-[#5af8fb]' : 'text-[#ff906c]')}>
                        {frame.lap.bestLapTime ? fmtDelta(frame.lap.lastLapTime - frame.lap.bestLapTime) : '——'}
                      </td>
                    </tr>
                    <tr className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-[#808080]">PB</td>
                      <td className="px-4 py-2.5 font-bold text-[#5af8fb]">{fmt(frame.lap.bestLapTime)}</td>
                      <td className="px-4 py-2.5 text-right text-[#5af8fb]">——</td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-center text-[#808080]">AWAITING_DATA</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ── Bottom row: 4-col tire grid ────────────────────────────────── */}
      <div className="grid flex-1 grid-cols-4 min-h-0">
        {TIRE_LABELS.map(({ pos, name }, i) => {
          const tire = tires[i]
          const temp = tire?.tempMiddle ?? 0
          const isHot = temp > 105
          const isCold = temp > 0 && temp < 70
          const stateLabel = temp === 0 ? '——' : isHot ? 'OVERHEAT' : isCold ? 'WARMING' : 'OPTIMAL'
          const stateColor = isHot ? '#ff906c' : isCold ? '#5af8fb' : undefined

          return (
            <div
              key={name}
              className={cn(
                'flex flex-col p-4 overflow-hidden',
                i < 3 && 'border-r border-[#2a2a2a]',
              )}
            >
              {/* Header */}
              <div className="mb-4 flex items-start justify-between flex-shrink-0">
                <div>
                  <span className="terminal-header block text-[9px] text-[#808080]">{pos}</span>
                  <span className="terminal-header text-[10px] font-bold">{name}</span>
                </div>
                <span
                  className="font-mono text-xl font-bold"
                  style={{ color: stateColor }}
                >
                  {temp > 0 ? `${temp.toFixed(0)}°C` : '——'}
                </span>
              </div>

              {/* Visual bar */}
              <div
                className="relative flex-1 min-h-0 overflow-hidden bg-black/40"
                style={{ border: isHot ? '1px solid rgba(255,144,108,0.30)' : '1px solid #2a2a2a' }}
              >
                {/* Subtle horizontal scan lines */}
                <div className="absolute inset-0 pointer-events-none opacity-10 flex flex-col justify-around py-2">
                  {[0,1,2,3].map(j => <div key={j} className="h-px bg-white" />)}
                </div>
                {/* Heat gradient */}
                {temp > 0 && (
                  <div
                    className="absolute inset-x-0 bottom-0"
                    style={{
                      height: `${Math.min(temp / 120 * 100, 100)}%`,
                      background: isHot
                        ? 'linear-gradient(to top, rgba(255,144,108,0.20), transparent)'
                        : 'linear-gradient(to top, rgba(90,248,251,0.10), transparent)',
                    }}
                  />
                )}
                {/* State label */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="terminal-header text-[10px] font-bold tracking-[0.4em] opacity-40"
                    style={{ color: stateColor }}
                  >
                    {stateLabel}
                  </span>
                </div>
              </div>

              {/* Stats row */}
              <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-[9px] text-[#808080] flex-shrink-0">
                <div className="flex justify-between border-b border-[#2a2a2a]/30 pb-1">
                  <span>WEAR</span>
                  <span className="text-white">{tire?.wearPercent != null ? `${tire.wearPercent.toFixed(0)}%` : '——'}</span>
                </div>
                <div className="flex justify-between border-b border-[#2a2a2a]/30 pb-1">
                  <span>CMPD</span>
                  <span className="text-white">{tire?.compound ?? '——'}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}


