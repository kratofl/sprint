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
  "btn group/button ui-control inline-flex shrink-0 items-center justify-center border bg-transparent bg-clip-padding text-[13px] font-semibold tracking-[0] whitespace-nowrap normal-case transition-colors outline-none select-none focus-visible:border-[var(--accent)] focus-visible:ring-0 focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-30 aria-invalid:border-[var(--red)] aria-invalid:ring-0 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: buttonPrimaryClassName,
        primary: buttonPrimaryClassName,
        outline: buttonNeutralClassName,
        neutral: buttonNeutralClassName,
        secondary: buttonSecondaryClassName,
        ghost: cn("ghost", buttonGhostClassName),
        destructive: cn("danger", buttonDestructiveClassName),
        active: buttonActiveClassName,
        link: "border-transparent text-[var(--text2)] underline-offset-4 hover:text-[var(--accent)] hover:underline",
      },
      size: {
        default:
          "h-[36px] gap-1.5 rounded-[999px] px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4 [&_svg:not([class*='size-'])]:size-[15px]",
        xs: "h-[24px] gap-1 rounded-[999px] px-2 text-[11px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[30px] gap-1 rounded-[999px] px-3 text-[12px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-[14px]",
        lg: "h-[40px] gap-2 rounded-[999px] px-6 text-[14px] has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-[36px] rounded-[999px] p-0 [&_svg:not([class*='size-'])]:size-[16px]",
        "icon-xs": "size-6 rounded-[999px] p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-[30px] rounded-[999px] p-0 [&_svg:not([class*='size-'])]:size-[14px]",
        "icon-lg": "size-[40px] rounded-[999px] p-0 [&_svg:not([class*='size-'])]:size-[17px]",
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
