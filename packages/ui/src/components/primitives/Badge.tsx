import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-[10px] overflow-hidden rounded-badge border px-[10px] py-1 font-wordmark text-[12px] font-bold whitespace-nowrap uppercase transition-colors focus-visible:border-[var(--orange)] focus-visible:outline-none has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-[var(--red)] [&>svg]:pointer-events-none [&>svg]:size-[10px]!",
  {
    variants: {
      variant: {
        default:
          "border-[var(--orange)] bg-transparent text-[var(--orange)]",
        primary:
          "border-[var(--orange)] bg-[var(--orange)] text-[var(--bg)]",
        secondary:
          "border-[var(--border)] bg-transparent text-[var(--muted)]",
        connected:
          "border-[var(--green)] bg-transparent text-[var(--green)]",
        /** Telemetry alert chips: Live, Pit, Gear */
        tertiary:
          "border-[var(--blue)] bg-transparent text-[var(--blue)]",
        success:
          "border-[var(--green)] bg-transparent text-[var(--green)]",
        warning:
          "border-[var(--amber)] bg-transparent text-[var(--amber)]",
        destructive:
          "border-[var(--red)] bg-transparent text-[var(--red)] [a]:hover:text-[var(--red)]",
        outline:
          "border-[var(--border)] text-[var(--muted)]",
        neutral:
          "border-[var(--border)] text-[var(--muted)]",
        active:
          "border-[var(--orange)] bg-[var(--orange)] text-[var(--bg)]",
        ghost:
          "border-transparent text-[var(--muted)]",
        link: "border-transparent text-[var(--orange)] underline-offset-4 hover:underline",
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
