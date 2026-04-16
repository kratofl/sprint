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
  onlineLabel = "UPLINK_STABLE",
  offlineLabel = "UPLINK_OFFLINE",
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
        "flex h-6 shrink-0 items-center border-t border-border bg-background px-4",
        "font-mono text-[9px] text-text-muted",
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
              connected ? "bg-secondary animate-pulse" : "bg-text-muted"
            )}
          />
          <Badge variant={connected ? "connected" : "neutral"} className="font-mono">
            {connected ? onlineLabel : offlineLabel}
          </Badge>
        </div>

        {leftSlot ? <div className="flex items-center gap-3">{leftSlot}</div> : null}

        <div className="ml-auto flex items-center gap-2">
          {rightSlot}
          {version ? (
            <span className="italic tracking-widest opacity-40">SPRINT v{version}</span>
          ) : null}
          {showChannel ? (
            <Badge variant={channelVariant[channel]} className="font-mono">
              {channel.toUpperCase()}
            </Badge>
          ) : null}
        </div>
      </div>
    </footer>
  )
}
