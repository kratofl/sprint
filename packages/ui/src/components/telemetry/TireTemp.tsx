import * as React from 'react'
import { cn } from '../../lib/utils'

export interface TireData {
  tempInner: number
  tempMiddle: number
  tempOuter: number
  wearPercent: number
  compound: string
}

export interface TireTempProps extends React.HTMLAttributes<HTMLDivElement> {
  tires: {
    frontLeft: TireData
    frontRight: TireData
    rearLeft: TireData
    rearRight: TireData
  }
}

const TEMP_COLD  = 70
const TEMP_IDEAL = 90
const TEMP_HOT   = 110

/** Returns a Tailwind colour class based on temperature. */
function tempColour(temp: number): string {
  if (temp < TEMP_COLD)  return 'bg-blue-400'
  if (temp < TEMP_IDEAL) return 'bg-teal'
  if (temp < TEMP_HOT)   return 'bg-accent'
  return 'bg-red-500'
}

function TireCell({ data, label }: { data: TireData; label: string }) {
  const avgTemp = (data.tempInner + data.tempMiddle + data.tempOuter) / 3

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider">{label}</span>

      {/* Three-zone temp strip */}
      <div className="flex gap-0.5 h-10">
        {[data.tempOuter, data.tempMiddle, data.tempInner].map((t, i) => (
          <div
            key={i}
            className={cn('w-3 rounded-sm opacity-80 transition-colors duration-300', tempColour(t))}
            title={`${t.toFixed(0)}°C`}
          />
        ))}
      </div>

      {/* Avg temp */}
      <span className="text-xs font-mono tabular-nums text-text-secondary">
        {avgTemp.toFixed(0)}°
      </span>

      {/* Wear */}
      <div className="w-full bg-bg-surface rounded-full h-1 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            data.wearPercent > 80 ? 'bg-red-500' : data.wearPercent > 50 ? 'bg-accent' : 'bg-teal',
          )}
          style={{ width: `${Math.min(100, data.wearPercent)}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Four-corner tire temperature and wear display.
 * Laid out FL–FR on top, RL–RR on bottom, mirroring the car's footprint.
 */
export function TireTemp({ tires, className, ...props }: TireTempProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-x-6 gap-y-4', className)} {...props}>
      <TireCell data={tires.frontLeft}  label="FL" />
      <TireCell data={tires.frontRight} label="FR" />
      <TireCell data={tires.rearLeft}   label="RL" />
      <TireCell data={tires.rearRight}  label="RR" />
    </div>
  )
}
