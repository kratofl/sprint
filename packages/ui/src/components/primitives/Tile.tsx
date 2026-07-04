import * as React from "react"

import { cn } from "../../lib/utils"

export type TileProps = React.ComponentProps<"div"> & {
  selected?: boolean
}

function Tile({ selected = false, className, ...props }: TileProps) {
  return (
    <div
      data-slot="tile"
      data-selected={selected}
      className={cn(
        "rounded-[calc(var(--r)-2px)] border border-[var(--line)] bg-[var(--panel2)] p-3 text-[12px] text-[var(--text2)] transition-colors",
        "data-[selected=true]:border-[var(--accent)] data-[selected=true]:bg-[var(--panel)] data-[selected=true]:text-[var(--text)]",
        className
      )}
      {...props}
    />
  )
}

export { Tile }
