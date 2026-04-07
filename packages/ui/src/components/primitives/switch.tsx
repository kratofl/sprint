import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "../../lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-foreground/20",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        "data-[size=default]:h-[16px] data-[size=default]:w-[28px]",
        "data-[size=sm]:h-[14px] data-[size=sm]:w-[24px]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform",
          "data-[state=checked]:translate-x-[calc(100%_-_1px)] data-[state=unchecked]:translate-x-[1px]",
          "group-data-[size=default]/switch:size-3.5",
          "group-data-[size=sm]/switch:size-3",
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

