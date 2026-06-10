import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../../lib/utils"
import {
  buttonActiveClassName,
  buttonDestructiveClassName,
  buttonGhostClassName,
  buttonNeutralClassName,
  buttonPrimaryClassName,
  buttonSecondaryClassName,
} from "./controlClasses"

const buttonVariants = cva(
  "group/button ui-control inline-flex shrink-0 items-center justify-center border bg-transparent bg-clip-padding whitespace-nowrap transition-colors outline-none select-none focus-visible:border-[var(--orange)] focus-visible:ring-0 focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[var(--red)] aria-invalid:ring-0 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: buttonPrimaryClassName,
        primary: buttonPrimaryClassName,
        outline: buttonNeutralClassName,
        neutral: buttonNeutralClassName,
        secondary: buttonSecondaryClassName,
        ghost: buttonGhostClassName,
        destructive: buttonDestructiveClassName,
        active: buttonActiveClassName,
        link: "border-transparent text-text-muted underline-offset-4 hover:text-primary hover:underline",
      },
      size: {
        default:
          "h-[25px] gap-1.5 rounded-control px-[14px] py-[6px] text-[13px] has-data-[icon=inline-end]:pr-[10px] has-data-[icon=inline-start]:pl-[10px] [&_svg:not([class*='size-'])]:size-[13px]",
        xs: "h-5 gap-1 rounded-badge px-2 py-1 text-[10px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-2.5",
        sm: "h-[21px] gap-1 rounded-control px-[10px] py-[4px] text-[12px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        lg: "h-[25px] gap-1.5 rounded-control px-[14px] py-[6px] text-[13px] has-data-[icon=inline-end]:pr-[10px] has-data-[icon=inline-start]:pl-[10px] [&_svg:not([class*='size-'])]:size-[13px]",
        icon: "size-[25px] rounded-tile p-[6px] [&_svg:not([class*='size-'])]:size-[13px]",
        "icon-xs": "size-5 rounded-badge p-0 [&_svg:not([class*='size-'])]:size-2.5",
        "icon-sm": "size-[25px] rounded-tile p-[6px] [&_svg:not([class*='size-'])]:size-[13px]",
        "icon-lg": "size-[28px] rounded-tile p-[6px] [&_svg:not([class*='size-'])]:size-4",
      },
    },
    compoundVariants: [
      {
        variant: "link",
        className: "h-auto px-0 py-0",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>
export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
