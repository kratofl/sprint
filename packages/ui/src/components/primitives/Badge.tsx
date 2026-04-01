import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "group/badge terminal-label inline-flex min-h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border px-2 py-0.5 text-[9px] whitespace-nowrap text-foreground transition-colors focus-visible:border-ring focus-visible:outline-none has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-2.5!",
  {
    variants: {
      variant: {
        default:
          "surface-active text-primary",
        primary:
          "surface-active text-primary",
        secondary:
          "surface-secondary text-secondary",
        connected:
          "surface-secondary text-secondary",
        /** Telemetry alert chips: Live, Pit, Gear */
        tertiary:
          "surface-tertiary text-tertiary",
        success:
          "surface-success text-success",
        warning:
          "surface-warning text-warning",
        destructive:
          "surface-destructive text-destructive [a]:hover:text-destructive",
        outline:
          "border-border text-text-muted",
        neutral:
          "border-border text-text-muted",
        active:
          "surface-active text-primary",
        ghost:
          "border-transparent text-text-muted",
        link: "text-accent underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>
export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

