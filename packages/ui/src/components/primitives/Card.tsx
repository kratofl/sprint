import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"
import {
  cardAccentClassName,
  cardDefaultClassName,
  cardDestructiveClassName,
  cardElevatedClassName,
  cardSecondaryClassName,
} from "./controlClasses"

// Figma panel surface: bg Surface/Panel #141414, radius xl (18),
// 1px Border/Default #2E2E2E, flat (no shadow). Title/Description use Inter.
const cardVariants = cva(
  `group/card flex flex-col overflow-hidden rounded-xl p-[14px] text-[13px] text-[var(--text)] transition-colors has-[>img:first-child]:pt-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl ${cardDefaultClassName}`,
  {
    variants: {
      size: {
        default: "gap-[14px]",
        sm: "gap-[10px] p-[10px]",
      },
      variant: {
        default: "",
        accent: cardAccentClassName,
        primary: cardAccentClassName,
        selected: cardAccentClassName,
        teal: cardSecondaryClassName,
        secondary: cardSecondaryClassName,
        elevated: cardElevatedClassName,
        destructive: cardDestructiveClassName,
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  }
)

export type CardVariant = NonNullable<VariantProps<typeof cardVariants>["variant"]>
export type CardProps = React.ComponentProps<"div"> &
  VariantProps<typeof cardVariants>
export type CardHeaderProps = React.ComponentProps<"div">
export type CardTitleProps = React.ComponentProps<"div">
export type CardDescriptionProps = React.ComponentProps<"div">
export type CardActionProps = React.ComponentProps<"div">
export type CardContentProps = React.ComponentProps<"div">
export type CardFooterProps = React.ComponentProps<"div">

function Card({
  className,
  size = "default",
  variant = "default",
  ...props
}: CardProps) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(cardVariants({ size, variant }), className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1.5 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-[14px] group-data-[size=sm]/card:[.border-b]:pb-[10px]",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-inter text-[13px] font-bold text-[var(--text)]", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <div
      data-slot="card-description"
      className={cn("font-inter text-[11px] text-[var(--muted)]", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: CardActionProps) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: CardContentProps) {
  return (
    <div
      data-slot="card-content"
      className={cn(className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center [.border-t]:pt-[14px] group-data-[size=sm]/card:[.border-t]:pt-[10px]",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
}
