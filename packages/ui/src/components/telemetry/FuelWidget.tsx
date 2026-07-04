import * as React from 'react'
import { cn } from '../../lib/utils'

export interface FuelWidgetProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Fuel remaining in litres. */
  fuel: number
  /** Tank capacity in litres. Used to compute fill percentage. */
  capacity: number
  /** Rolling average fuel consumption per lap in litres. 0 = unknown. */
  fuelPerLap: number
}

/**
 * Fuel level bar with litres remaining, per-lap consumption, and laps-to-empty estimate.
 */
export function FuelWidget({ fuel, capacity, fuelPerLap, className, ...props }: FuelWidgetProps) {
  const safeCap = capacity > 0 ? capacity : 110
  const fillPct = Math.max(0, Math.min(100, (fuel / safeCap) * 100))
  const lapsLeft = fuelPerLap > 0 ? fuel / fuelPerLap : null

  const fillColor =
    fillPct < 10 ? 'var(--red)' :
    fillPct < 25 ? 'var(--orange)' :
    'var(--green)'

  return (
    <div className={cn('flex flex-col gap-2', className)} {...props}>
      {/* Bar */}
      <div className="relative h-2 w-full overflow-hidden rounded-pill bg-[var(--panel-3)]">
        <div
          className="absolute left-0 top-0 h-full rounded-pill transition-[width] duration-300"
          style={{ width: `${fillPct}%`, background: fillColor }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-saira font-semibold tabular-nums text-[var(--text)]">
          {fuel.toFixed(1)}
          <span className="ml-0.5 text-[10px] font-normal text-[var(--muted)]">L</span>
        </span>

        {fuelPerLap > 0 && (
          <span className="text-[var(--muted)]">
            {fuelPerLap.toFixed(2)}
            <span className="ml-0.5 text-[var(--muted)]">L/lap</span>
          </span>
        )}

        {lapsLeft !== null && (
          <span className={cn('font-saira tabular-nums', fillPct < 10 ? 'text-[var(--red)]' : 'text-[var(--muted)]')}>
            ~{Math.floor(lapsLeft)}
            <span className="ml-0.5 text-[var(--muted)]">laps</span>
          </span>
        )}
      </div>
    </div>
  )
}
