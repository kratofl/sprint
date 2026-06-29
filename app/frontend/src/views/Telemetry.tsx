import {
  Card,
  CardDescription,
  CardTitle,
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
  cn,
} from '@sprint/ui'
import { IconSteeringWheel } from '@tabler/icons-react'
import type { TelemetryFrame } from '@sprint/types'

export interface TelemetryProps {
  frame: TelemetryFrame | null
  connected: boolean
  fps: number
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
    <Card className={cn('gap-0', className)}>
      <div className="mb-[14px] flex items-baseline justify-between gap-[10px]">
        <CardTitle>{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </div>
      {children}
    </Card>
  )
}

function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{children}</div>
  )
}

// Shown when there is no live telemetry frame. Distinguishes "sim connected but
// no frame yet" from "nothing running" — no demo/placeholder data is rendered.
function TelemetryEmptyState({ connected }: { connected: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-[18px] text-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-[var(--text3)]">
        <IconSteeringWheel size={34} stroke={1.5} />
      </div>
      <div className="flex flex-col gap-[6px]">
        <h2 className="text-[18px] font-bold text-[var(--text)]">
          {connected ? 'Waiting for telemetry' : 'No sim connected'}
        </h2>
        <p className="max-w-[360px] text-[12px] leading-relaxed text-[var(--text3)]">
          {connected
            ? 'Connected to your sim — get in the car and start a session to see live telemetry.'
            : 'Start your sim to stream live telemetry. Nothing is running right now.'}
        </p>
      </div>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text3)]">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            connected ? 'animate-pulse bg-[var(--green)]' : 'bg-[var(--text3)]',
          )}
        />
        {connected ? 'Sim link active' : 'Offline'}
      </div>
    </div>
  )
}

export default function Telemetry({ frame, connected, fps }: TelemetryProps) {
  if (!frame) return <TelemetryEmptyState connected={connected} />

  const { car, lap, tires, session, flags } = frame

  return (
    <div className="flex h-full min-h-0 flex-col gap-[14px] overflow-hidden">
      <FlagBanner flags={flags} />
      <SessionHeader session={session} connected={connected} fps={fps} />

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
