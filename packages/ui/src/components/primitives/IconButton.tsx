import * as React from "react"

import { cn } from "../../lib/utils"
import { Button, type ButtonProps } from "./Button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip"

// Figma "Indicator"/icon-button: 32×32 circle (radius pill), centered Tabler icon.
// tone=primary → bg Orange/500 + 1px inner border Orange/400.
// tone=secondary → bg Neutral/800 + 1px inner border Neutral/700.
export type IconButtonTone = "primary" | "secondary"

export type IconButtonProps = Omit<ButtonProps, "children" | "size" | "aria-label" | "icon"> & {
  label: string
  icon: React.ReactNode
  /** Figma icon-button tone. Maps onto the Button variant when no variant is given. */
  tone?: IconButtonTone
  /** Optional tooltip text; wired to the shared Tooltip primitive. Defaults to label. */
  tooltip?: React.ReactNode
  size?: Extract<ButtonProps["size"], "icon" | "icon-xs" | "icon-sm" | "icon-lg">
}

const toneToVariant: Record<IconButtonTone, NonNullable<ButtonProps["variant"]>> = {
  primary: "primary",
  secondary: "secondary",
}

function IconButton({
  label,
  icon,
  className,
  size = "icon",
  type = "button",
  tone = "secondary",
  variant,
  tooltip,
  ...props
}: IconButtonProps) {
  const resolvedVariant = variant ?? toneToVariant[tone]

  const button = (
    <Button
      {...props}
      type={type}
      size={size}
      variant={resolvedVariant}
      title={tooltip == null ? (props.title ?? label) : undefined}
      className={cn("focus-visible:border-[var(--accent)]", className)}
      aria-label={label}
    >
      {icon}
    </Button>
  )

  if (tooltip == null) {
    return button
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export { IconButton }
