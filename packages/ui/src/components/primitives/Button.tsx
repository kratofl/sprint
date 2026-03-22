import * as React from 'react'
import { cn } from '../../lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover active:opacity-90 shadow-glow/30',
  secondary:
    'bg-teal text-white hover:bg-teal-hover active:opacity-90 shadow-glow-teal/30',
  ghost:
    'bg-transparent text-text-secondary border border-border-glass hover:bg-bg-surface hover:text-text-primary',
  destructive:
    'bg-red-600/80 text-white hover:bg-red-500 active:opacity-90',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-xs rounded-sm',
  md: 'h-9 px-4 text-sm rounded',
  lg: 'h-11 px-6 text-base rounded-md',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        'disabled:opacity-40 disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
)

Button.displayName = 'Button'
