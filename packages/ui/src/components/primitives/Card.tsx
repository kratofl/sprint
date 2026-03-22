import * as React from 'react'
import { cn } from '../../lib/utils'

// ── Card ──────────────────────────────────────────────────────────────────────

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Elevate the glass level for modal/overlay contexts */
  elevated?: boolean
}

export function Card({ elevated = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg',
        elevated ? 'glass-elevated' : 'glass',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// ── CardHeader ────────────────────────────────────────────────────────────────

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export function CardHeader({ className, children, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn('flex items-center justify-between px-4 py-3 border-b border-border-glass', className)}
      {...props}
    >
      {children}
    </div>
  )
}

// ── CardTitle ─────────────────────────────────────────────────────────────────

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export function CardTitle({ className, children, ...props }: CardTitleProps) {
  return (
    <h3 className={cn('text-sm font-semibold text-text-primary', className)} {...props}>
      {children}
    </h3>
  )
}

// ── CardContent ───────────────────────────────────────────────────────────────

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export function CardContent({ className, children, ...props }: CardContentProps) {
  return (
    <div className={cn('p-4', className)} {...props}>
      {children}
    </div>
  )
}

// ── CardFooter ────────────────────────────────────────────────────────────────

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export function CardFooter({ className, children, ...props }: CardFooterProps) {
  return (
    <div
      className={cn('flex items-center px-4 py-3 border-t border-border-glass', className)}
      {...props}
    >
      {children}
    </div>
  )
}
