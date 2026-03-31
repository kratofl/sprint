import * as React from 'react'
import { cn } from '../../lib/utils'
import { formatLapTime } from './LapTime'

export interface SectorTimesProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Last-completed-lap sector 1 time in seconds; 0 = not yet set. */
  sector1Time: number
  /** Last-completed-lap sector 2 time in seconds; 0 = not yet set. */
  sector2Time: number
  /** Personal-best sector 1 in seconds; 0 = none. */
  bestSector1: number
  /** Personal-best sector 2 in seconds; 0 = none. */
  bestSector2: number
  /** Current sector index (1, 2, or 3). */
  currentSector: number
  /** Time elapsed in the current sector in seconds. */
  currentSectorTime: number
}

type SectorState = 'pb' | 'faster' | 'slower' | 'inactive' | 'active'

function sectorState(time: number, best: number, active: boolean): SectorState {
  if (active) return 'active'
  if (!time)  return 'inactive'
  if (!best || time <= best) return 'pb'
  if (time < best * 1.005)   return 'faster'
  return 'slower'
}

const STATE_CLASS: Record<SectorState, string> = {
  pb:       'text-purple-400',
  faster:   'text-teal',
  slower:   'text-accent',
  inactive: 'text-text-disabled',
  active:   'text-text-primary',
}

interface SectorCellProps {
  label: string
  time: number
  state: SectorState
}

function SectorCell({ label, time, state }: SectorCellProps) {
  const display = state === 'active'
    ? formatLapTime(time, true)
    : time
      ? formatLapTime(time, true)
      : '–:––.–––'

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</span>
      <span className={cn('font-mono text-sm tabular-nums font-semibold', STATE_CLASS[state])}>
        {display}
      </span>
    </div>
  )
}

/**
 * Three-sector time display (S1 · S2 · S3/current).
 * Colours: purple = personal best, teal = faster-than-best, orange = slower, pulsing = active sector.
 */
export function SectorTimes({
  sector1Time,
  sector2Time,
  bestSector1,
  bestSector2,
  currentSector,
  currentSectorTime,
  className,
  ...props
}: SectorTimesProps) {
  const s1State = sectorState(sector1Time, bestSector1, currentSector === 1)
  const s2State = sectorState(sector2Time, bestSector2, currentSector === 2)
  const s3State: SectorState = currentSector === 3 ? 'active' : 'inactive'

  return (
    <div className={cn('flex justify-around', className)} {...props}>
      <SectorCell label="S1" time={currentSector === 1 ? currentSectorTime : sector1Time} state={s1State} />
      <div className="w-px self-stretch bg-border-base" />
      <SectorCell label="S2" time={currentSector === 2 ? currentSectorTime : sector2Time} state={s2State} />
      <div className="w-px self-stretch bg-border-base" />
      <SectorCell label="S3" time={currentSector === 3 ? currentSectorTime : 0} state={s3State} />
    </div>
  )
}
