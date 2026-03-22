import * as React from 'react'
import { cn } from '../../lib/utils'
import type { Flags } from '@sprint/types'

export interface FlagBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  flags: Flags
}

interface BannerConfig {
  label: string
  bg: string
  text: string
  pulse?: boolean
}

function resolveFlag(flags: Flags): BannerConfig | null {
  if (flags.red)
    return { label: 'RED FLAG', bg: 'bg-red-600', text: 'text-white', pulse: true }
  if (flags.safetyCar)
    return { label: 'SAFETY CAR', bg: 'bg-yellow-500', text: 'text-black' }
  if (flags.vsc)
    return { label: 'VIRTUAL SAFETY CAR', bg: 'bg-yellow-400', text: 'text-black' }
  if (flags.doubleYellow)
    return { label: 'DOUBLE YELLOW', bg: 'bg-yellow-400', text: 'text-black', pulse: true }
  if (flags.yellow)
    return { label: 'YELLOW FLAG', bg: 'bg-yellow-400', text: 'text-black' }
  if (flags.checkered)
    return { label: 'CHEQUERED', bg: 'bg-text-primary', text: 'text-bg-base', pulse: true }
  return null
}

/**
 * A full-width flag banner shown only when a flag is active.
 * Returns null (renders nothing) when no flag is in effect.
 */
export function FlagBanner({ flags, className, ...props }: FlagBannerProps) {
  const cfg = resolveFlag(flags)
  if (!cfg) return null

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-md py-1.5 text-xs font-bold tracking-widest',
        cfg.bg,
        cfg.text,
        cfg.pulse && 'animate-pulse',
        className,
      )}
      {...props}
    >
      {cfg.label}
    </div>
  )
}
