"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "../../lib/utils"

// Figma "Toggle": pill track, padding 4, square-ish rounded knob 24.
// On = track Green/500, knob pushed right. Off = track Neutral/800, knob left.
// Knob fill Neutral/50; disabled knob Neutral/600; disabled-on track Green/800.
// Accent focus-visible ring (macOS HIG). Smooth 120–160ms knob transition.
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
        "group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-pill border border-transparent p-[4px] outline-none transition-colors duration-[160ms] ease-[var(--motion-ease)]",
        "focus-visible:border-[var(--accent)] focus-visible:ring-0 focus-visible:outline-none",
        "data-[state=checked]:bg-[var(--green)] data-[state=unchecked]:bg-[var(--panel2)]",
        "data-[disabled]:cursor-not-allowed",
        "data-[state=checked]:data-[disabled]:bg-[var(--primitive-color-green-800)]",
        "data-[size=default]:h-[33px] data-[size=default]:w-[57px]",
        "data-[size=sm]:h-[26px] data-[size=sm]:w-[46px]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-pill bg-[var(--primitive-color-neutral-50)] ring-0 transition-transform duration-[160ms] ease-[var(--motion-ease)]",
          "group-data-[disabled]/switch:bg-[var(--primitive-color-neutral-600)]",
          "data-[state=checked]:translate-x-[24px] data-[state=unchecked]:translate-x-0",
          "group-data-[size=default]/switch:size-[25px]",
          "group-data-[size=sm]/switch:size-[18px]",
          "group-data-[size=sm]/switch:data-[state=checked]:translate-x-[20px]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
