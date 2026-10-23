'use client'

import type { ComponentProps } from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

// On/off for settings that apply immediately: a 32×18 pill with a 14px white
// knob, brand-500 when on and fill-strong with a border-control edge when off;
// 51×31 below lg. Anything that waits for a Save button is a checkbox instead.
function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full p-0.5 transition-colors data-checked:bg-brand-500 data-unchecked:bg-fill-strong data-unchecked:shadow-[inset_0_0_0_1px_var(--border-control)] data-disabled:cursor-not-allowed data-disabled:opacity-50 max-lg:h-[31px] max-lg:w-[51px]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform data-checked:translate-x-3.5 max-lg:size-[27px] max-lg:data-checked:translate-x-5"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
