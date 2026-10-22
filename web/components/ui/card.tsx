import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// A soft card: surface on bg, radius-lg, 16px padding, a separator border and
// shadow-e1. Titles are headline, descriptions footnote in label-secondary.
// Lists and tables use the flush list card in components/app/grouped.tsx instead.
function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('flex flex-col gap-4 rounded-lg border border-separator bg-surface p-4 text-label shadow-(--shadow-e1)', className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('grid gap-1', className)} {...props} />
}

function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 data-slot="card-title" className={cn('text-headline', className)} {...props} />
}

function CardDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-description" className={cn('text-footnote text-label-secondary', className)} {...props} />
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={className} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent }
