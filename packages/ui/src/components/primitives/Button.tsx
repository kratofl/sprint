import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "group/button terminal-label inline-flex shrink-0 items-center justify-center rounded-sm border bg-transparent bg-clip-padding whitespace-nowrap text-foreground transition-colors outline-none select-none focus-visible:border-ring focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary text-primary hover:bg-primary hover:text-primary-foreground",
        primary:
          "border-primary text-primary hover:bg-primary hover:text-primary-foreground",
        outline:
          "border-border text-text-muted hover:border-border-strong hover:text-foreground",
        neutral:
          "border-border text-text-muted hover:border-border-strong hover:text-foreground",
        secondary:
          "border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground",
        ghost:
          "border-transparent text-text-muted hover:border-border hover:text-foreground",
        destructive:
          "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground",
        active:
          "border-primary bg-accent/5 text-primary hover:bg-accent/10",
        link: "border-transparent text-text-muted underline-offset-4 hover:text-primary hover:underline",
      },
      size: {
        default:
          "h-7 gap-1.5 px-3 text-[10px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-5 gap-1 rounded-sm px-2 text-[9px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-2.5",
        sm: "h-6 gap-1.5 px-2.5 text-[10px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        lg: "h-8 gap-2 px-4 text-[11px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-7 p-0 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-xs": "size-5 rounded-sm p-0 [&_svg:not([class*='size-'])]:size-2.5",
        "icon-sm": "size-6 p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-lg": "size-8 p-0 [&_svg:not([class*='size-'])]:size-4",
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

