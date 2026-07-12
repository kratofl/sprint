import * as React from "react"

import { cn } from "../../lib/utils"
import { Button, type ButtonProps } from "./Button"

export type IconButtonProps = Omit<ButtonProps, "children" | "size" | "aria-label"> & {
  label: string
  icon: React.ReactNode
  size?: Extract<ButtonProps["size"], "icon" | "icon-xs" | "icon-sm" | "icon-lg">
}

function IconButton({
  label,
  icon,
  className,
  size = "icon",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <Button
      {...props}
      type={type}
      size={size}
      title={props.title ?? label}
      className={cn("focus-visible:border-[var(--accent)]", className)}
      aria-label={label}
    >
      {icon}
    </Button>
  )
}

export { IconButton }
