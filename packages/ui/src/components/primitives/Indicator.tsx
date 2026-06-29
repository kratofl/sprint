import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

// Figma "Indicator": a circle (radius pill) with a tinted status background, a
// 1px OUTER colored border, and a centered Tabler icon.
//   - size 32 → icon 24 (default; toasts use this)
//   - size 28 → icon 16 (Alert uses this)
// Colors map onto the semantic status soft-bg / status-border tokens (and the
// neutral surface/line tokens), never raw hex:
//   green   bg Green/950   · border Green/700
//   red     bg Red/950     · border Red/700
//   orange  bg Orange/950  · border Orange/700
//   blue    bg Blue/950    · border Blue/700
//   neutral bg Neutral/900 · border Neutral/700
const indicatorVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-pill border bg-clip-padding text-[var(--text)] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      color: {
        green:
          "border-[var(--primitive-color-green-700)] bg-[var(--green-soft)] text-[var(--green)]",
        red: "border-[var(--primitive-color-red-700)] bg-[var(--red-soft)] text-[var(--red)]",
        orange:
          "border-[var(--primitive-color-orange-700)] bg-[var(--primitive-color-orange-950)] text-[var(--accent)]",
        blue: "border-[var(--primitive-color-blue-700)] bg-[var(--blue-soft)] text-[var(--blue)]",
        neutral: "border-[var(--line)] bg-[var(--panel)] text-[var(--text2)]",
      },
      size: {
        32: "size-[32px] [&_svg:not([class*='size-'])]:size-6",
        28: "size-[28px] [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      color: "neutral",
      size: 32,
    },
  }
)

export type IndicatorColor = NonNullable<VariantProps<typeof indicatorVariants>["color"]>
export type IndicatorSize = NonNullable<VariantProps<typeof indicatorVariants>["size"]>

export type IndicatorProps = Omit<React.ComponentProps<"span">, "color"> &
  VariantProps<typeof indicatorVariants> & {
    /** Tabler icon element rendered centered inside the circle. */
    icon: React.ReactNode
  }

function Indicator({
  color = "neutral",
  size = 32,
  icon,
  className,
  ...props
}: IndicatorProps) {
  return (
    <span
      data-slot="indicator"
      data-color={color}
      data-size={size}
      aria-hidden="true"
      className={cn(indicatorVariants({ color, size }), className)}
      {...props}
    >
      {icon}
    </span>
  )
}

export { Indicator, indicatorVariants }
