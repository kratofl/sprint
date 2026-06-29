import * as React from "react"

import { cn } from "../../lib/utils"
import { Card, type CardProps } from "./Card"

export type SettingsCardProps = CardProps

function SettingsCard({ className, ...props }: SettingsCardProps) {
  return (
    <Card
      data-slot="settings-card"
      className={cn(
        "gap-0 rounded-xl border-[var(--line)] bg-[var(--panel)] p-0 text-[var(--text2)]",
        className
      )}
      {...props}
    />
  )
}

export { SettingsCard }
