import * as React from "react"
import { IconCheck, IconX } from "@tabler/icons-react"

import { cn } from "../../lib/utils"
import { Indicator, type IndicatorColor } from "./Indicator"

// Figma "Toast" (presentational): pill container on the Neutral/800 tile surface,
// pad 6/16/6/8, gap 10, row aligned center. A leading Indicator (32) carries the
// status — Success = green check, Danger = red x — so color is never the only
// signal. Content column (gap 4): Title (Inter Bold 13, Neutral/50) + Message
// (Inter Regular 11, Neutral/300).
//
// Announced politely to assistive tech via role="status" + aria-live="polite".
// No global provider this wave; render/position toasts in app shells.
export type ToastType = "success" | "danger"

export type ToastProps = Omit<React.ComponentProps<"div">, "title"> & {
  type: ToastType
  title: React.ReactNode
  message?: React.ReactNode
  /** Override the default status icon (Tabler check / x). */
  icon?: React.ReactNode
  /** When provided, renders a trailing dismiss button. */
  onDismiss?: () => void
  /** Accessible label for the dismiss button. */
  dismissLabel?: string
}

const typeToColor: Record<ToastType, IndicatorColor> = {
  success: "green",
  danger: "red",
}

const defaultIcon: Record<ToastType, React.ReactNode> = {
  success: <IconCheck />,
  danger: <IconX />,
}

function Toast({
  type,
  title,
  message,
  icon,
  onDismiss,
  dismissLabel = "Dismiss notification",
  className,
  ...props
}: ToastProps) {
  return (
    <div
      data-slot="toast"
      data-type={type}
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2.5 rounded-pill bg-[var(--panel2)] py-1.5 pr-4 pl-2 text-left",
        className
      )}
      {...props}
    >
      <Indicator color={typeToColor[type]} size={32} icon={icon ?? defaultIcon[type]} />
      <div data-slot="toast-content" className="flex flex-col gap-1">
        <span className="font-sans text-[13px] font-bold leading-none text-[var(--text)]">
          {title}
        </span>
        {message != null && (
          <span className="font-sans text-[11px] font-normal leading-none text-[var(--text2)]">
            {message}
          </span>
        )}
      </div>
      {onDismiss != null && (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded-pill text-[var(--text2)] transition-colors outline-none hover:text-[var(--text)] focus-visible:border focus-visible:border-[var(--accent)] focus-visible:outline-none [&_svg]:size-4 [&_svg]:shrink-0"
        >
          <IconX />
        </button>
      )}
    </div>
  )
}

export { Toast }
