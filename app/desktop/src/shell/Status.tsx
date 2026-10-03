import type { ReactNode } from 'react'

/** Status colours, shared by every view: the same state always gets the same tone and word. */
export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral' | 'brand'

/**
 * Status as an 8px dot + word (`.status` in styles.css); colour never carries the meaning alone.
 * The word inherits the surrounding text; `quiet` makes it 12px secondary for chrome and dense
 * metadata. `className` adds a view's own layout class.
 *
 *   <Status tone="success">Connected</Status>
 */
export function Status({
  tone,
  quiet = false,
  className,
  title,
  role,
  children,
}: {
  tone: StatusTone
  quiet?: boolean
  className?: string
  title?: string
  role?: 'status'
  children: ReactNode
}) {
  const classes = ['status', `tone-${tone}`, quiet ? 'quiet' : null, className ?? null].filter(Boolean).join(' ')
  return (
    <span className={classes} title={title} role={role}>
      <span className="status-dot" aria-hidden="true" />
      <span className="status-label">{children}</span>
    </span>
  )
}
