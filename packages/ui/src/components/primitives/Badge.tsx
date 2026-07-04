import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "tag group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-[6px] overflow-hidden rounded-[6px] border px-[8px] py-0 font-sans text-[9.5px] font-bold tracking-[0.14em] whitespace-nowrap uppercase transition-colors focus-visible:border-[var(--accent)] focus-visible:outline-none has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-[var(--red)] [&>svg]:pointer-events-none [&>svg]:size-[10px]!",
  {
    variants: {
      variant: {
        default:
          "t-accent border-[var(--accent)] bg-transparent text-[var(--accent)]",
        primary:
          "t-solid border-[var(--accent)] bg-[var(--accent)] text-[#050505]",
        secondary:
          "border-[var(--line)] bg-transparent text-[var(--text2)]",
        connected:
          "t-green border-[var(--green)] bg-transparent text-[var(--green)]",
        /** Telemetry alert chips: Live, Pit, Gear */
        tertiary:
          "t-blue border-[var(--blue)] bg-transparent text-[var(--blue)]",
        success:
          "t-green border-[var(--green)] bg-transparent text-[var(--green)]",
        warning:
          "border-[var(--yellow)] bg-transparent text-[var(--yellow)]",
        destructive:
          "t-red border-[var(--red)] bg-transparent text-[var(--red)] [a]:hover:text-[var(--red)]",
        outline:
          "border-[var(--line)] text-[var(--text2)]",
        neutral:
          "border-[var(--line)] text-[var(--text2)]",
        active:
          "t-solid border-[var(--accent)] bg-[var(--accent)] text-[#050505]",
        ghost:
          "border-transparent text-[var(--text2)]",
        link: "border-transparent text-[var(--accent)] underline-offset-4 hover:underline",
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
