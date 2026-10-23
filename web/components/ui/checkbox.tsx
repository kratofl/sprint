'use client'

import type { ComponentProps } from 'react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import { IconCheck } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

// A choice that waits for the form's Save button (settings that apply at once are
// switches). 16px on surface with a border-control edge and radius-xs; checked is
// brand-500 with an on-brand check. 20px with a 44px hit area below lg.
function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative grid size-4 shrink-0 place-items-center rounded-xs border border-border-control bg-surface data-checked:border-brand-500 data-checked:bg-brand-500 data-checked:text-on-brand data-disabled:cursor-not-allowed data-disabled:opacity-50 max-lg:size-5 max-lg:after:absolute max-lg:after:-inset-3',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <IconCheck className="size-3 [stroke-width:3] max-lg:size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
