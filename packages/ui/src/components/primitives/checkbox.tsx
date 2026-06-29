"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "../../lib/utils"
import { IconCheck } from "@tabler/icons-react"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Small control: bg Surface/Tile, 1px Border/Default, radius xxs (4),
        // accent focus-visible border + checked fill (text Text/Dark on accent).
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-xxs border border-[var(--line)] bg-[var(--panel2)] text-[var(--text)] transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-[var(--accent)] focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[var(--red)] aria-invalid:ring-0 data-checked:border-[var(--accent)] data-checked:bg-[var(--accent)] data-checked:text-[var(--panel)]",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <IconCheck
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }

