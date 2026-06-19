import * as React from "react"

import { cn } from "../../lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-[36px] w-full min-w-0 rounded-[999px] border border-[var(--line)] bg-[var(--panel2)] px-4 text-[13px] font-normal tracking-[0] text-[var(--text)] transition-colors outline-none",
        "placeholder:text-[var(--text3)]",
        "hover:border-[var(--line2)]",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground",
        "focus:border-[var(--accent)] focus:text-[var(--text)] focus:ring-0 focus:outline-none",
        "data-[readout=true]:text-right data-[readout=true]:font-sans data-[readout=true]:tabular-nums",
        "data-[status=accent]:border-[var(--accent)] data-[status=accent]:text-[var(--accent)] data-[status=accent]:focus:border-[var(--accent)]",
        "data-[status=neutral]:text-[var(--text2)] data-[status=neutral]:focus:border-[var(--line)] data-[status=neutral]:focus:text-[var(--text)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-[var(--red)] aria-invalid:ring-0",
        className
      )}
      {...props}
    />
  )
}

export { Input }
