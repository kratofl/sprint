import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Inline banner for persistent page-level states: a -100 tint with -900 text and
// radius-md. It belongs to the view that raised it. Short-lived confirmations are
// toasts, not banners.
const alertVariants = cva('grid w-full gap-0.5 rounded-md px-3 py-2 text-left text-footnote max-lg:px-4 max-lg:py-3', {
  variants: {
    variant: {
      info: 'bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-100',
      warning: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-100',
      destructive: 'bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-100',
    },
  },
  defaultVariants: { variant: 'info' },
})

function Alert({ className, variant, ...props }: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('font-semibold', className)} {...props} />
}

function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-description" className={cn('text-pretty', className)} {...props} />
}

export { Alert, AlertTitle, AlertDescription }
