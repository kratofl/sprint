'use client'

import type { ComponentProps } from 'react'
import { Separator as SeparatorPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

// A separator hairline, horizontal or vertical.
function Separator({ className, orientation = 'horizontal', decorative = true, ...props }: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-separator data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch',
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
