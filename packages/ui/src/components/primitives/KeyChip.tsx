import * as React from "react"

import { cn } from "../../lib/utils"

export type KeyChipProps = React.ComponentProps<"kbd">

function KeyChip({ className, ...props }: KeyChipProps) {
  return (
    <kbd
      data-slot="key-chip"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-[var(--line)] bg-[var(--panel2)] px-1.5 font-mono text-[10px] font-semibold text-[var(--text2)]",
        className
      )}
      {...props}
    />
  )
}

export { KeyChip }
