import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { Icon } from '@tabler/icons-react'
import type { Kpi } from '@/lib/overview'

type CardProps = {
  title: string
  // Header action on the right: a text link or an S secondary button.
  action?: ReactNode
  // Flush cards carry edge-to-edge content (tables); the header keeps its padding.
  flush?: boolean
  className?: string
  children: ReactNode
}

// Flat content card: surface on bg, headline title, optional header action.
export function Card({ title, action, flush = false, className, children }: CardProps) {
  return (
    <section className={clsx('card', flush && 'card-flush', className)}>
      <div className="card-head">
        <h2 className="card-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

// Flat metric card: label, 24px value, caption. An empty KPI shows a dash
// instead of a number.
export function KpiCard({ kpi }: { kpi: Kpi }) {
  return (
    <div className="card kpi">
      <span className="kpi-label">{kpi.label}</span>
      {kpi.kind === 'value' ? (
        <span className="kpi-value">{kpi.value}</span>
      ) : (
        <span className="kpi-value" data-empty="true" aria-label="No data">—</span>
      )}
      <span className="kpi-caption">{kpi.caption}</span>
    </div>
  )
}

type EmptyStateProps = {
  icon: Icon
  title: string
  body: string
  action?: ReactNode
  // `error` marks a failure (red tint, announced as an alert) rather than
  // "nothing here yet".
  tone?: 'empty' | 'error'
}

// Centred placeholder for a card with nothing to show yet, or that failed to load.
export function EmptyState({ icon: StateIcon, title, body, action, tone = 'empty' }: EmptyStateProps) {
  return (
    <div className="empty-state" data-tone={tone} role={tone === 'error' ? 'alert' : undefined}>
      <span className="empty-icon" aria-hidden>
        <StateIcon size={22} stroke={1.8} />
      </span>
      <span className="empty-title">{title}</span>
      <span className="empty-body">{body}</span>
      {action}
    </div>
  )
}
