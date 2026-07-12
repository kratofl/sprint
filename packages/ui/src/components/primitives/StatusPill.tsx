import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const statusPillVariants = cva(
  "inline-flex h-5 items-center gap-1.5 rounded-pill border bg-[var(--panel2)] px-2 font-sans text-[10px] font-semibold tracking-[0] whitespace-nowrap",
  {
    variants: {
      status: {
        neutral: "border-[var(--line)] text-[var(--text2)]",
        success: "border-[var(--primitive-color-green-700)] text-[var(--green)]",
        warning: "border-[var(--primitive-color-yellow-700)] text-[var(--yellow)]",
        danger: "border-[var(--primitive-color-red-700)] text-[var(--red)]",
        info: "border-[var(--primitive-color-blue-700)] text-[var(--blue)]",
      },
    },
    defaultVariants: {
      status: "neutral",
    },
  }
)

const dotVariants = cva("size-1.5 shrink-0 rounded-pill", {
  variants: {
    status: {
      neutral: "bg-[var(--text3)]",
      success: "bg-[var(--green)]",
      warning: "bg-[var(--yellow)]",
      danger: "bg-[var(--red)]",
      info: "bg-[var(--blue)]",
    },
  },
  defaultVariants: {
    status: "neutral",
  },
})

export type StatusPillStatus = NonNullable<VariantProps<typeof statusPillVariants>["status"]>
export type StatusPillProps = React.ComponentProps<"span"> &
  VariantProps<typeof statusPillVariants> & {
    showDot?: boolean
  }

function StatusPill({
  status = "neutral",
  showDot = true,
  className,
  children,
  ...props
}: StatusPillProps) {
  return (
    <span
      data-slot="status-pill"
      data-status={status}
      className={cn(statusPillVariants({ status }), className)}
      {...props}
    >
      {showDot ? <span aria-hidden="true" className={cn(dotVariants({ status }))} /> : null}
      {children}
    </span>
  )
}

export { StatusPill, statusPillVariants }
