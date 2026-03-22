import {
  DeltaBar,
  FlagBanner,
  FuelWidget,
  GearDisplay,
  InputTrace,
  LapTime,
  RPMBar,
  SectorTimes,
  SessionHeader,
  TireTemp,
} from '@sprint/ui'
import type { TireData } from '@sprint/ui'
import type { TelemetryFrame } from '@sprint/types'

export interface TelemetryProps {
  frame: TelemetryFrame | null
  connected: boolean
  fps: number
}

export default function Telemetry({ frame, connected, fps }: TelemetryProps) {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-auto p-4">
      {/* Session header */}
      <SessionHeader
        session={frame?.session ?? emptySession}
        connected={connected}
        fps={fps}
      />

      {/* Flag banner — only rendered when a flag is active */}
      {frame && <FlagBanner flags={frame.flags} />}

      {/* ── Main two-column grid ── */}
      <div className="grid flex-1 grid-cols-2 gap-3">
        {/* ── LEFT: car state ── */}
        <div className="glass flex flex-col gap-4 rounded-lg p-4">
          {/* Gear + speed */}
          <GearDisplay
            gear={frame?.car.gear ?? 0}
            speedKph={frame ? frame.car.speedMS * 3.6 : 0}
          />

          {/* RPM bar */}
          <RPMBar
            rpm={frame?.car.rpm ?? 0}
            maxRpm={frame?.car.maxRPM ?? 10000}
          />

          {/* Driver inputs */}
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">
              Inputs
            </p>
            <InputTrace
              throttle={frame?.car.throttle ?? 0}
              brake={frame?.car.brake ?? 0}
              clutch={frame?.car.clutch ?? 0}
              steering={frame?.car.steering ?? 0}
            />
          </div>
        </div>

        {/* ── RIGHT: timing + fuel ── */}
        <div className="flex flex-col gap-3">
          {/* Lap times */}
          <div className="glass rounded-lg p-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-text-muted">
              Lap Times
            </p>
            <div className="space-y-2">
              <LapRow label="Current" time={frame?.lap.currentLapTime} />
              <LapRow label="Last"    time={frame?.lap.lastLapTime}    />
              <LapRow label="Best"    time={frame?.lap.bestLapTime}    accent="teal" />
            </div>

            {/* Delta bar — only when a target is set */}
            {frame && frame.lap.targetLapTime > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-[11px] text-text-muted">Δ Target</p>
                <DeltaBar
                  delta={frame.lap.currentLapTime - frame.lap.targetLapTime}
                />
              </div>
            )}
          </div>

          {/* Sector times */}
          <div className="glass rounded-lg p-3">
            <SectorTimes
              sector1Time={frame?.lap.sector1Time ?? 0}
              sector2Time={frame?.lap.sector2Time ?? 0}
              bestSector1={0}
              bestSector2={0}
              currentSector={frame?.lap.sector ?? 1}
              currentSectorTime={frame?.lap.currentLapTime ?? 0}
            />
          </div>

          {/* Fuel */}
          <div className="glass rounded-lg p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">
              Fuel
            </p>
            <FuelWidget
              fuel={frame?.car.fuel ?? 0}
              capacity={110}
              fuelPerLap={frame?.car.fuelPerLap ?? 0}
            />
          </div>
        </div>
      </div>

      {/* ── Tyre temps — full width ── */}
      <div className="glass rounded-lg p-4">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          Tyre Temperatures
        </p>
        <TireTemp tires={buildTires(frame)} />
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const emptySession = {
  game: '',
  track: '',
  car: '',
  sessionType: 'unknown' as const,
  sessionTime: 0,
  bestLapTime: 0,
}

function LapRow({
  label,
  time,
  accent,
}: {
  label: string
  time?: number
  accent?: 'teal' | 'orange'
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-muted">{label}</span>
      <LapTime
        seconds={time}
        className={[
          'text-sm',
          accent === 'teal'   ? 'text-teal'   :
          accent === 'orange' ? 'text-accent'  :
          'text-text-primary',
        ].join(' ')}
      />
    </div>
  )
}

const emptyTire: TireData = {
  tempInner: 0,
  tempMiddle: 0,
  tempOuter: 0,
  wearPercent: 0,
  compound: '—',
}

function buildTires(frame: TelemetryFrame | null) {
  if (!frame) {
    return {
      frontLeft:  emptyTire,
      frontRight: emptyTire,
      rearLeft:   emptyTire,
      rearRight:  emptyTire,
    }
  }
  const t = frame.tires
  const toData = (i: number): TireData => ({
    tempInner:   t[i].tempInner,
    tempMiddle:  t[i].tempMiddle,
    tempOuter:   t[i].tempOuter,
    wearPercent: t[i].wearPercent,
    compound:    t[i].compound,
  })
  return {
    frontLeft:  toData(0),
    frontRight: toData(1),
    rearLeft:   toData(2),
    rearRight:  toData(3),
  }
}

