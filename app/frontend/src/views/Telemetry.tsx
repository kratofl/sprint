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
        <div className="surface flex flex-col gap-4 rounded p-4">
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
            <p className="mb-2 terminal-header text-[10px] text-on-surface-variant">
              Driver_Inputs
            </p>
            <InputTrace
              throttle={frame?.car.throttle ?? 0}
              brake={frame?.car.brake ?? 0}
              clutch={frame?.car.clutch ?? 0}
              steering={frame?.car.steering ?? 0}
            />
          </div>

          {/* Electronics */}
          <div>
            <p className="mb-2 terminal-header text-[10px] text-on-surface-variant">
              Electronics
            </p>
            <div className="space-y-1.5">
              <ElectronicsRow
                label="TC"
                setting={frame?.electronics.tc ?? 0}
                max={frame?.electronics.tcMax ?? 0}
                active={frame?.electronics.tcActive ?? false}
              />
              <ElectronicsRow
                label="ABS"
                setting={frame?.electronics.abs ?? 0}
                max={frame?.electronics.absMax ?? 0}
                active={frame?.electronics.absActive ?? false}
              />
            </div>
          </div>
        </div>

        {/* ── RIGHT: timing + fuel ── */}
        <div className="flex flex-col gap-3">
          {/* Lap times */}
          <div className="surface rounded p-4">
            <p className="mb-3 terminal-header text-[10px] text-on-surface-variant">
              Lap_Times
            </p>
            <div className="space-y-2">
              <LapRow label="Current" time={frame?.lap.currentLapTime} />
              <LapRow label="Last"    time={frame?.lap.lastLapTime}    />
              <LapRow label="Best"    time={frame?.lap.bestLapTime}    accent="teal" />
            </div>

            {/* Delta bar — only when a target is set */}
            {frame && frame.lap.targetLapTime > 0 && (
              <div className="mt-3">
                <p className="mb-1 terminal-header text-[10px] text-on-surface-variant">Δ_Target</p>
                <DeltaBar
                  delta={frame.lap.currentLapTime - frame.lap.targetLapTime}
                />
              </div>
            )}
          </div>

          {/* Sector times */}
          <div className="surface rounded p-3">
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
          <div className="surface rounded p-4">
            <p className="mb-2 terminal-header text-[10px] text-on-surface-variant">
              Fuel_Status
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
      <div className="surface rounded p-4">
        <p className="mb-3 terminal-header text-[10px] text-on-surface-variant">
          Tyre_Temperatures
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

function ElectronicsRow({
  label,
  setting,
  max,
  active,
}: {
  label: string
  setting: number
  max: number
  active: boolean
}) {
  const off = setting === 0
  return (
    <div className="flex items-center justify-between">
      <span className="w-8 text-xs text-text-muted">{label}</span>
      <span className={['text-xs font-mono tabular-nums', off ? 'text-disabled' : 'text-text-primary'].join(' ')}>
        {off ? 'OFF' : max > 0 ? `${setting} / ${max}` : String(setting)}
      </span>
      {/* Active indicator — orange dot when the system is currently intervening */}
      <span
        className={[
          'h-2 w-2 rounded-full',
          active ? 'bg-accent' : 'bg-disabled',
        ].join(' ')}
        title={active ? `${label} active` : `${label} inactive`}
      />
    </div>
  )
}

