import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

// Status pill: a small pill-radius chip on the Neutral/800 tile surface with a
// colored hairline border, colored label and a live status dot. Colors map onto
// the new status family tokens (success / danger / info / warning families;
// neutral text/surface). The dot pairs with the text color so color is never the
// only status signal.
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
    /** Hide the leading live dot. Defaults to shown. */
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
