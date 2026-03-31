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

/** Returns a warm-gradient style based on temperature */
function tempGradient(temp: number): string {
  if (temp < TEMP_COLD)  return 'linear-gradient(180deg, #60A5FA 0%, #3B82F6 100%)'
  if (temp < TEMP_IDEAL) return 'linear-gradient(180deg, #8afcff 0%, #5af8fb 100%)'
  if (temp < TEMP_HOT)   return 'linear-gradient(180deg, #FFAA8A 0%, #ff906c 100%)'
  return 'linear-gradient(180deg, #EF4444 0%, #DC2626 100%)'
}

function wearGradient(wear: number): string {
  if (wear > 80) return 'linear-gradient(90deg, #DC2626 0%, #EF4444 100%)'
  if (wear > 50) return 'linear-gradient(90deg, #ff784d 0%, #ff906c 100%)'
  return 'linear-gradient(90deg, #5af8fb 0%, #8afcff 100%)'
}

function TireCell({ data, label }: { data: TireData; label: string }) {
  const avgTemp = (data.tempInner + data.tempMiddle + data.tempOuter) / 3

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</span>

      {/* Three-zone temp strip */}
      <div className="flex h-10 gap-0.5">
        {[data.tempOuter, data.tempMiddle, data.tempInner].map((t, i) => (
          <div
            key={i}
            className="w-3 rounded-sm transition-colors duration-300"
            style={{ background: tempGradient(t) }}
            title={`${t.toFixed(0)}°C`}
          />
        ))}
      </div>

      {/* Avg temp */}
      <span className="font-mono text-xs tabular-nums text-text-secondary">
        {avgTemp.toFixed(0)}°
      </span>

      {/* Wear */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-bg-surface">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(100, data.wearPercent)}%`,
            background: wearGradient(data.wearPercent),
          }}
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
