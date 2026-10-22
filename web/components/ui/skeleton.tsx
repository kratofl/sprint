import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// A static placeholder block. It does not pulse: animations stay finite.
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('rounded-sm bg-fill', className)} {...props} />
}

export { Skeleton }
