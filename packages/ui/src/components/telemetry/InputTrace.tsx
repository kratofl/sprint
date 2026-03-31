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

const GRADIENTS = {
  throttle: 'linear-gradient(90deg, #1EA58C 0%, #25C4A8 100%)',
  brake:    'linear-gradient(90deg, #D96A10 0%, #F5922A 100%)',
  clutch:   'linear-gradient(90deg, #3B3B42 0%, #52525C 100%)',
  steering: 'linear-gradient(90deg, #71717A 0%, #A1A1AA 100%)',
} as const

type InputKey = keyof typeof GRADIENTS

interface BarProps {
  label: string
  value: number
  gradient: string
  centered?: boolean
}

function Bar({ label, value, gradient, centered }: BarProps) {
  const clamped = Math.max(0, Math.min(1, value))
  const pct = clamped * 100

  const steerClamped = Math.max(-1, Math.min(1, value))
  const steerPct = Math.abs(steerClamped) * 50

  return (
    <div className="flex items-center gap-2.5">
      <span className="w-14 text-[11px] text-text-muted">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-bg-elevated">
        {centered ? (
          <>
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-px bg-border-base" />
            <div
              className="absolute top-0 h-full rounded-full transition-[width,left] duration-75"
              style={{
                background: gradient,
                left: steerClamped <= 0 ? `${50 - steerPct}%` : '50%',
                width: `${steerPct}%`,
              }}
            />
          </>
        ) : (
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-[width] duration-75"
            style={{ width: `${pct}%`, background: gradient }}
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
      <Bar label="Throttle" value={throttle} gradient={GRADIENTS.throttle} />
      <Bar label="Brake"    value={brake}    gradient={GRADIENTS.brake} />
      {showClutch && (
        <Bar label="Clutch" value={clutch} gradient={GRADIENTS.clutch} />
      )}
      <Bar label="Steering" value={steering} gradient={GRADIENTS.steering} centered />
    </div>
  )
}
