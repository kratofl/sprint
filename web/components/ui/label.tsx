'use client'

import type { ComponentProps } from 'react'
import { Label as LabelPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

// Field label above a control: footnote semibold.
function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-footnote font-semibold select-none peer-disabled:cursor-not-allowed peer-disabled:text-label-disabled',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
