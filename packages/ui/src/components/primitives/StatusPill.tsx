import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const statusPillVariants = cva(
  "inline-flex h-5 items-center gap-1 rounded-[6px] border border-[var(--line)] bg-[var(--panel2)] px-2 text-[10px] font-semibold text-[var(--text2)]",
  {
    variants: {
      status: {
        neutral: "border-[var(--line)] text-[var(--text2)]",
        success: "border-[var(--green)] text-[var(--green)]",
        warning: "border-[var(--yellow)] text-[var(--yellow)]",
        danger: "border-[var(--red)] text-[var(--red)]",
        info: "border-[var(--blue)] text-[var(--blue)]",
      },
    },
    defaultVariants: {
      status: "neutral",
    },
  }
)

export type StatusPillStatus = NonNullable<VariantProps<typeof statusPillVariants>["status"]>
export type StatusPillProps = React.ComponentProps<"span"> &
  VariantProps<typeof statusPillVariants>

function StatusPill({ status = "neutral", className, ...props }: StatusPillProps) {
  return (
    <span
      data-slot="status-pill"
      data-status={status}
      className={cn(statusPillVariants({ status }), className)}
      {...props}
    />
  )
}

export { StatusPill, statusPillVariants }
