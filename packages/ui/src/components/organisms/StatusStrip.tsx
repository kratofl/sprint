import * as React from "react"

import { cn } from "../../lib/utils"
import { Badge } from "../primitives/Badge"

const channelVariant = {
  dev: "warning",
  alpha: "active",
  beta: "neutral",
  release: "connected",
} as const

export type StatusStripChannel = keyof typeof channelVariant

export interface StatusStripProps extends React.ComponentProps<"footer"> {
  connected?: boolean
  version?: string
  channel?: StatusStripChannel
  onlineLabel?: string
  offlineLabel?: string
  leftSlot?: React.ReactNode
  rightSlot?: React.ReactNode
}

export function StatusStrip({
  connected = true,
  version,
  channel,
  onlineLabel = "Connected",
  offlineLabel = "Offline",
  leftSlot,
  rightSlot,
  className,
  ...props
}: StatusStripProps) {
  const showChannel = channel != null && channel !== "release"

  return (
    <footer
      data-slot="status-strip"
      className={cn(
        "flex h-6 shrink-0 items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--panel)] px-[10px]",
        "font-sans text-[10px] tabular-nums text-[var(--text2)]",
        className
      )}
      {...props}
    >
      <div className="flex w-full items-center gap-6 overflow-x-auto">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "h-1.5 w-1.5 shrink-0",
              connected ? "animate-[fdpulse_1.2s_ease-in-out_infinite] bg-[var(--green)]" : "bg-[var(--text3)]"
            )}
          />
          <Badge variant={connected ? "connected" : "neutral"}>
            {connected ? onlineLabel : offlineLabel}
          </Badge>
        </div>

        {leftSlot ? <div className="flex items-center gap-3">{leftSlot}</div> : null}

        <div className="ml-auto flex items-center gap-2">
          {rightSlot}
          {version ? (
            <span className="opacity-50">Sprint v{version}</span>
          ) : null}
          {showChannel ? (
            <Badge variant={channelVariant[channel]}>
              {channel.toUpperCase()}
            </Badge>
          ) : null}
        </div>
      </div>
    </footer>
  )
}
