import * as React from "react"

import { cn } from "../../lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Input role: bg Surface/Tile, 1px Border/Default, radius xl (18),
        // accent focus border per the Input idiom. Flat, single-mode dark.
        "flex field-sizing-content min-h-16 w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--panel2)] px-[10px] py-2 font-sans text-[13px] text-[var(--text)] transition-colors outline-none",
        "placeholder:text-[var(--text3)]",
        "hover:border-[var(--line2)]",
        "focus:border-[var(--accent)] focus:ring-0 focus:outline-none focus-visible:border-[var(--accent)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-[var(--red)] aria-invalid:ring-0",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
