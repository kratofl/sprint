import * as React from 'react'
import { cn } from '../../lib/utils'

export type BadgeVariant = 'default' | 'accent' | 'teal' | 'success' | 'warning' | 'danger'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variantClasses: Record<BadgeVariant, string> = {
  default:  'bg-bg-surface text-text-secondary border border-border-glass',
  accent:   'bg-accent-muted text-accent border border-accent-border',
  teal:     'bg-teal-muted text-teal border border-teal-border',
  success:  'bg-green-500/15 text-green-400 border border-green-500/30',
  warning:  'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  danger:   'bg-red-500/15 text-red-400 border border-red-500/30',
}

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
