import * as React from 'react'
import { cn } from '../../lib/utils'
import { Badge } from '../primitives'
import type { Session, SessionType } from '@sprint/types'

export interface SessionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  session: Session
  connected: boolean
  /** Frames per second received from backend. Optional. */
  fps?: number
}

const SESSION_LABEL: Record<SessionType, string> = {
  practice: 'Practice',
  qualify:  'Qualifying',
  race:     'Race',
  warmup:   'Warm-up',
  unknown:  'Session',
}

function formatSessionTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Top-of-view session metadata strip.
 * Shows track name, car, session type badge, session elapsed time, and connection status.
 */
export function SessionHeader({ session, connected, fps, className, ...props }: SessionHeaderProps) {
  const sessionLabel = SESSION_LABEL[session.sessionType] ?? 'Session'

  return (
    <div className={cn('flex items-center justify-between gap-4', className)} {...props}>
      {/* Left: track + car */}
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-display text-base font-semibold text-text-primary">
          {session.track || 'No Track'}
        </span>
        <span className="truncate text-xs text-text-muted">{session.car || '—'}</span>
      </div>

      {/* Centre: session type + time */}
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="default">{sessionLabel}</Badge>
        {session.sessionTime > 0 && (
          <span className="font-mono text-xs tabular-nums text-text-secondary">
            {formatSessionTime(session.sessionTime)}
          </span>
        )}
      </div>

      {/* Right: connection indicator */}
      <div className="flex shrink-0 items-center gap-1.5 text-xs text-text-muted">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            connected ? 'bg-teal animate-pulse' : 'bg-text-disabled',
          )}
        />
        {connected
          ? fps !== undefined
            ? <span className="text-text-secondary">{fps} fps</span>
            : <span>Live</span>
          : <span>Waiting…</span>}
      </div>
    </div>
  )
}
