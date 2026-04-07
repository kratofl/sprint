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
  const isDefault = size === "default"
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-border-strong",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        isDefault ? "h-[16px] w-[28px]" : "h-[14px] w-[24px]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform",
          "data-[state=checked]:translate-x-[calc(100%_-_1px)] data-[state=unchecked]:translate-x-[1px]",
          isDefault ? "w-3.5 h-3.5" : "w-3 h-3",
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

