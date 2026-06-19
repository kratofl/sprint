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
  TrackMap,
} from '@sprint/ui'
import type { TelemetryFrame } from '@sprint/types'

export interface TelemetryProps {
  frame: TelemetryFrame | null
  connected: boolean
  fps: number
}

const DEMO_TELEMETRY_FRAME: TelemetryFrame = {
  timestamp: Date.now(),
  session: {
    game: 'Assetto Corsa Competizione',
    track: 'Falkenberg GP',
    car: 'Porsche 992 GT3 R',
    sessionType: 'race',
    sessionTime: 1842,
    bestLapTime: 83.418,
    maxLaps: 42,
    inCar: true,
  },
  car: {
    speedMS: 67.8,
    gear: 5,
    rpm: 7420,
    maxRPM: 8800,
    throttle: 0.78,
    brake: 0.12,
    clutch: 0,
    steering: -0.18,
    fuel: 38.6,
    fuelPerLap: 2.74,
    positionX: 142,
    positionY: 0,
    positionZ: -86,
    brakeBiasRear: 0.44,
  },
  tires: [
    {
      position: 0,
      tempInner: 84,
      tempMiddle: 87,
      tempOuter: 91,
      tempSurface: 89,
      tempCore: 86,
      pressureKPa: 183,
      wearPercent: 8,
      compound: 'Soft',
    },
    {
      position: 1,
      tempInner: 86,
      tempMiddle: 88,
      tempOuter: 92,
      tempSurface: 90,
      tempCore: 87,
      pressureKPa: 184,
      wearPercent: 9,
      compound: 'Soft',
    },
    {
      position: 2,
      tempInner: 82,
      tempMiddle: 84,
      tempOuter: 87,
      tempSurface: 86,
      tempCore: 84,
      pressureKPa: 181,
      wearPercent: 7,
      compound: 'Soft',
    },
    {
      position: 3,
      tempInner: 83,
      tempMiddle: 85,
      tempOuter: 88,
      tempSurface: 86,
      tempCore: 84,
      pressureKPa: 182,
      wearPercent: 8,
      compound: 'Soft',
    },
  ],
  lap: {
    currentLap: 18,
    currentLapTime: 47.632,
    positionLapTime: 47.632,
    lastLapTime: 84.106,
    bestLapTime: 83.418,
    targetLapTime: 83.418,
    delta: -0.214,
    sector: 2,
    sector1Time: 26.731,
    sector2Time: 28.916,
    isInLap: false,
    isOutLap: false,
    isValid: true,
    trackPosition: 0.58,
  },
  flags: {
    yellow: false,
    doubleYellow: false,
    red: false,
    safetyCar: false,
    vsc: false,
    checkered: false,
  },
  electronics: {
    tcActive: true,
    tc: 4,
    tcMax: 10,
    tcCut: 2,
    tcCutMax: 10,
    tcSlip: 3,
    tcSlipMax: 10,
    absActive: false,
    abs: 3,
    absMax: 8,
    motorMap: 2,
    motorMapMax: 4,
    drsActive: false,
    absAvailable: true,
    tcAvailable: true,
    tcCutAvailable: true,
    tcSlipAvailable: true,
    motorMapAvailable: true,
  },
  race: {
    position: 4,
    totalPositions: 28,
    gapAhead: 1.42,
    gapBehind: 0.86,
  },
  energy: {
    virtualEnergy: 2280,
    soc: 0.62,
    regenPower: 18,
    deployPower: 42,
  },
  penalties: {
    incidents: 1,
    trackLimitSteps: 0,
    pitStops: 1,
  },
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
    <section className={`flex flex-col rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px] ${className}`}>
      <div className="mb-[14px] flex items-baseline justify-between gap-[10px]">
        <div className="font-inter text-[13px] font-bold text-[var(--text)]">{title}</div>
        {subtitle && <div className="font-inter text-[11px] text-[var(--muted)]">{subtitle}</div>}
      </div>
      {children}
    </section>
  )
}

function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{children}</div>
  )
}

export default function Telemetry({ frame, connected, fps }: TelemetryProps) {
  const liveFrame = frame ?? DEMO_TELEMETRY_FRAME
  const liveConnected = connected || frame == null
  const liveFps = frame ? fps : 60

  const { car, lap, tires, session, flags } = liveFrame

  return (
    <div className="flex h-full min-h-0 flex-col gap-[14px] overflow-hidden">
      <FlagBanner flags={flags} />
      <SessionHeader session={session} connected={liveConnected} fps={liveFps} />

      <div className="grid min-h-0 flex-1 grid-cols-12 gap-[14px] overflow-y-auto">
        {/* Primary column */}
        <div className="col-span-8 flex min-h-0 flex-col gap-[14px]">
          <Panel title="Car" subtitle="Live" className="gap-[14px]">
            <div className="flex items-center gap-[24px]">
              <GearDisplay gear={car.gear} speedKph={car.speedMS * 3.6} />
              <div className="flex flex-1 flex-col gap-[14px]">
                <div>
                  <StatLabel>Engine</StatLabel>
                  <RPMBar className="mt-[8px]" rpm={car.rpm} maxRpm={car.maxRPM} />
                </div>
                <div>
                  <StatLabel>Inputs</StatLabel>
                  <InputTrace
                    className="mt-[8px]"
                    throttle={car.throttle}
                    brake={car.brake}
                    clutch={car.clutch}
                    steering={car.steering}
                  />
                </div>
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-[14px]">
            <Panel title="Lap Pace" subtitle="Current stint">
              <div className="grid grid-cols-2 gap-[10px]">
                <div>
                  <StatLabel>Best</StatLabel>
                  <LapTime seconds={lap.bestLapTime} className="mt-[6px] block text-[20px] font-semibold text-[var(--orange)]" />
                </div>
                <div>
                  <StatLabel>Last</StatLabel>
                  <LapTime seconds={lap.lastLapTime} className="mt-[6px] block text-[20px] font-semibold text-[var(--text)]" />
                </div>
              </div>
              <div className="mt-[14px]">
                <StatLabel>Delta to reference</StatLabel>
                <DeltaBar className="mt-[8px]" delta={lap.delta} />
              </div>
            </Panel>

            <Panel title="Sectors" subtitle={`Lap ${lap.currentLap}`}>
              <SectorTimes
                sector1Time={lap.sector1Time}
                sector2Time={lap.sector2Time}
                bestSector1={0}
                bestSector2={0}
                currentSector={lap.sector}
                currentSectorTime={lap.currentLapTime}
              />
            </Panel>
          </div>
        </div>

        {/* Secondary column */}
        <aside className="col-span-4 flex min-h-0 flex-col gap-[14px]">
          <Panel title="Track Map" subtitle={session.track || '—'}>
            <TrackMap
              className="h-[150px]"
              positionX={car.positionX}
              positionZ={car.positionZ}
              trackPosition={lap.trackPosition}
              trackId={session.track}
            />
          </Panel>

          <Panel title="Tyres" subtitle="Temp · wear">
            <TireTemp
              tires={{
                frontLeft: tires[0],
                frontRight: tires[1],
                rearLeft: tires[2],
                rearRight: tires[3],
              }}
            />
          </Panel>

          <Panel title="Fuel" subtitle="Remaining">
            <FuelWidget fuel={car.fuel} capacity={0} fuelPerLap={car.fuelPerLap} />
          </Panel>
        </aside>
      </div>
    </div>
  )
}
