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

function tempColor(temp: number): string {
  if (temp < TEMP_COLD)  return 'var(--muted-2)'
  if (temp < TEMP_IDEAL) return 'var(--green)'
  if (temp < TEMP_HOT)   return 'var(--orange)'
  return 'var(--red)'
}

function wearColor(wear: number): string {
  if (wear > 80) return 'var(--red)'
  if (wear > 50) return 'var(--orange)'
  return 'var(--green)'
}

function TireCell({ data, label }: { data: TireData; label: string }) {
  const avgTemp = (data.tempInner + data.tempMiddle + data.tempOuter) / 3

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">{label}</span>

      {/* Three-zone temp strip */}
      <div className="flex h-10 gap-0.5">
        {[data.tempOuter, data.tempMiddle, data.tempInner].map((t, i) => (
          <div
            key={i}
            className="w-3 rounded-badge transition-colors duration-300"
            style={{ background: tempColor(t) }}
            title={`${t.toFixed(0)}°C`}
          />
        ))}
      </div>

      {/* Avg temp */}
      <span className="font-saira text-xs tabular-nums text-[var(--muted)]">
        {avgTemp.toFixed(0)}°
      </span>

      {/* Wear */}
      <div className="h-1 w-full overflow-hidden rounded-pill bg-[var(--panel-3)]">
        <div
          className="h-full rounded-pill transition-all duration-300"
          style={{
            width: `${Math.min(100, data.wearPercent)}%`,
            background: wearColor(data.wearPercent),
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
