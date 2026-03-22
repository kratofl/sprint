import * as React from 'react'
import { cn } from '../../lib/utils'

export interface InputTraceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–1 */
  throttle: number
  /** 0–1 */
  brake: number
  /** 0–1 */
  clutch: number
  /** -1 (full left) to 1 (full right) */
  steering: number
  /** Show clutch bar. Defaults to true. */
  showClutch?: boolean
}

interface BarProps {
  label: string
  value: number
  color: string
  /** If true, the bar is centred (for steering). */
  centered?: boolean
}

function Bar({ label, value, color, centered }: BarProps) {
  const clamped = Math.max(0, Math.min(1, value))
  const pct = clamped * 100

  // Steering: value is -1..1, re-map to 0..1 for display
  const steerClamped = Math.max(-1, Math.min(1, value))
  const steerPct = Math.abs(steerClamped) * 50 // 0–50 from centre

  return (
    <div className="flex items-center gap-2.5">
      <span className="w-14 text-[11px] text-text-muted">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-bg-elevated">
        {centered ? (
          <>
            {/* Centre mark */}
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-px bg-border-glass" />
            <div
              className={cn('absolute top-0 h-full rounded-full opacity-80 transition-[width,left] duration-75', color)}
              style={{
                left: steerClamped <= 0 ? `${50 - steerPct}%` : '50%',
                width: `${steerPct}%`,
              }}
            />
          </>
        ) : (
          <div
            className={cn('absolute left-0 top-0 h-full rounded-full opacity-80 transition-[width] duration-75', color)}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className="w-9 text-right text-[11px] tabular-nums text-text-secondary">
        {centered
          ? `${(steerClamped * 100).toFixed(0)}%`
          : `${(clamped * 100).toFixed(0)}%`}
      </span>
    </div>
  )
}

/**
 * Driver input trace — throttle, brake, clutch, and steering bars.
 * All bars animate on every React render (short CSS transition).
 */
export function InputTrace({
  throttle,
  brake,
  clutch,
  steering,
  showClutch = true,
  className,
  ...props
}: InputTraceProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)} {...props}>
      <Bar label="Throttle" value={throttle} color="bg-teal" />
      <Bar label="Brake"    value={brake}    color="bg-accent" />
      {showClutch && (
        <Bar label="Clutch" value={clutch} color="bg-text-muted" />
      )}
      <Bar label="Steering" value={steering} color="bg-text-secondary" centered />
    </div>
  )
}
