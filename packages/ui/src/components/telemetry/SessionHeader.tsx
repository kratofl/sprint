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
    <div
      className={cn(
        'flex items-center justify-between gap-4 rounded border border-[var(--outline)] bg-bg-container px-4 py-2.5',
        className,
      )}
      {...props}
    >
      {/* Left: track + car */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-bold uppercase tracking-wide text-foreground text-sm">
          {session.track || 'No_Track'}
        </span>
        <span className="truncate terminal-header text-[10px] text-on-surface-variant">
          {session.car || '——'}
        </span>
      </div>

      {/* Centre: session type + time */}
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="default">{sessionLabel.toUpperCase()}</Badge>
        {session.sessionTime > 0 && (
          <span className="font-mono text-xs tabular-nums text-on-surface-variant">
            {formatSessionTime(session.sessionTime)}
          </span>
        )}
      </div>

      {/* Right: connection indicator */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            connected ? 'bg-secondary animate-pulse' : 'bg-on-surface-variant',
          )}
        />
        <span className={cn('terminal-header text-[10px]', connected ? 'text-secondary' : 'text-on-surface-variant')}>
          {connected
            ? fps !== undefined ? `${fps}_FPS` : 'LIVE'
            : 'OFFLINE'}
        </span>
      </div>
    </div>
  )
}
