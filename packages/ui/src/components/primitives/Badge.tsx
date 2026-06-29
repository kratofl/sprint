import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../../lib/utils"

// Figma "Chip / Badge": transparent bg, 1px colored INNER border, radius xxs (4),
// pad 4×10, text Saira Semi Condensed Bold 12, uppercase.
// Color is driven by the Badge component tokens: text = family/500 (neutral 300),
// border = family/700.
const badgeVariants = cva(
  "tag group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-[4px] border bg-transparent px-2.5 py-1 font-saira-sc text-[12px] font-bold leading-none tracking-[0] whitespace-nowrap uppercase transition-colors focus-visible:border-[var(--accent)] focus-visible:outline-none aria-invalid:border-[var(--red)] [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      // New Figma color prop (Chip / Badge component).
      color: {
        red: "t-red border-[var(--primitive-color-red-700)] text-[var(--red)]",
        green: "t-green border-[var(--primitive-color-green-700)] text-[var(--green)]",
        blue: "t-blue border-[var(--primitive-color-blue-700)] text-[var(--blue)]",
        orange: "t-accent border-[var(--primitive-color-orange-700)] text-[var(--accent)]",
        neutral: "border-[var(--line)] text-[var(--text2)]",
      },
      // Legacy semantic variant names kept for app back-compat; each maps to a
      // Figma color treatment so existing call sites keep rendering.
      variant: {
        default: "t-accent border-[var(--primitive-color-orange-700)] text-[var(--accent)]",
        primary: "t-accent border-[var(--primitive-color-orange-700)] text-[var(--accent)]",
        secondary: "border-[var(--line)] text-[var(--text2)]",
        connected: "t-green border-[var(--primitive-color-green-700)] text-[var(--green)]",
        tertiary: "t-blue border-[var(--primitive-color-blue-700)] text-[var(--blue)]",
        success: "t-green border-[var(--primitive-color-green-700)] text-[var(--green)]",
        warning: "border-[var(--primitive-color-yellow-700)] text-[var(--yellow)]",
        destructive: "t-red border-[var(--primitive-color-red-700)] text-[var(--red)]",
        outline: "border-[var(--line)] text-[var(--text2)]",
        neutral: "border-[var(--line)] text-[var(--text2)]",
        active: "t-accent border-[var(--primitive-color-orange-700)] text-[var(--accent)]",
        ghost: "border-transparent text-[var(--text2)]",
        link: "border-transparent text-[var(--accent)] underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export type BadgeColor = NonNullable<VariantProps<typeof badgeVariants>["color"]>
export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>
export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }

function Badge({
  className,
  color,
  variant,
  asChild = false,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot.Root : "span"
  // `color` (Figma prop) wins; fall back to the legacy `variant` otherwise.
  const resolvedVariant = color ? undefined : (variant ?? "default")

  return (
    <Comp
      data-slot="badge"
      data-color={color}
      data-variant={resolvedVariant}
      className={cn(badgeVariants({ color, variant: resolvedVariant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
