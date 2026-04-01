import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const cardVariants = cva(
  "group/card flex flex-col overflow-hidden rounded-sm border bg-card text-xs/relaxed text-foreground transition-colors has-[>img:first-child]:pt-0 *:[img:first-child]:rounded-t-sm *:[img:last-child]:rounded-b-sm",
  {
    variants: {
      size: {
        default: "gap-4 py-4",
        sm: "gap-3 py-3",
      },
      variant: {
        default: "border-border",
        accent: "surface-active",
        primary: "surface-active",
        selected: "surface-active",
        teal: "surface-secondary",
        secondary: "surface-secondary",
        elevated: "border-border bg-bg-elevated",
        destructive: "surface-destructive",
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
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1.5 rounded-t px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
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
      className={cn("terminal-label text-[10px] text-text-muted", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <div
      data-slot="card-description"
      className={cn("status-readout text-[10px] text-text-muted", className)}
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
      className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b px-4 group-data-[size=sm]/card:px-3 [.border-t]:pt-4 group-data-[size=sm]/card:[.border-t]:pt-3",
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
}

