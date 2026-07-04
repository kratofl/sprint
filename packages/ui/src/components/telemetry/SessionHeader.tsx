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
        'flex items-center justify-between gap-4 rounded-panel border border-[var(--border)] bg-[var(--panel)] px-[14px] py-[10px]',
        className,
      )}
      {...props}
    >
      {/* Left: track + car */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-inter text-[13px] font-bold text-[var(--text)]">
          {session.track || 'No track'}
        </span>
        <span className="truncate font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
          {session.car || '——'}
        </span>
      </div>

      {/* Centre: session type + time */}
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="default">{sessionLabel}</Badge>
        {session.sessionTime > 0 && (
          <span className="font-saira text-xs tabular-nums text-[var(--muted)]">
            {formatSessionTime(session.sessionTime)}
          </span>
        )}
      </div>

      {/* Right: connection indicator */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            connected ? 'animate-pulse bg-[var(--green)]' : 'bg-[var(--muted)]',
          )}
        />
        <span className={cn('ui-label text-[10px]', connected ? 'text-[var(--green)]' : 'text-[var(--muted)]')}>
          {connected
            ? fps !== undefined ? `${fps} FPS` : 'Live'
            : 'Offline'}
        </span>
      </div>
    </div>
  )
}
