import * as React from "react"
import {
  IconAlertTriangle,
  IconCheck,
  IconInfoCircle,
  IconX,
} from "@tabler/icons-react"

import { cn } from "../../lib/utils"
import { Indicator, type IndicatorColor } from "./Indicator"

// Figma "Alert": a tinted banner (radius md 12, pad 6/16/6/8, gap 10) whose
// surface is the status soft-bg token for the type. A leading small Indicator
// (28) carries a Tabler status icon (16) so color is never the only signal.
// Content: Title (Inter Bold 13, Neutral/50) + Message (Inter Regular 11,
// Neutral/300).
//
// Danger / warning use role="alert" (assertive); success / info use
// role="status" (polite).
export type AlertType = "success" | "danger" | "warning" | "info"

export type AlertProps = Omit<React.ComponentProps<"div">, "title"> & {
  type: AlertType
  title: React.ReactNode
  message?: React.ReactNode
  /** Override the default status icon (Tabler). */
  icon?: React.ReactNode
}

const typeToColor: Record<AlertType, IndicatorColor> = {
  success: "green",
  danger: "red",
  warning: "orange",
  info: "blue",
}

const typeToSurface: Record<AlertType, string> = {
  success: "bg-[var(--green-soft)]",
  danger: "bg-[var(--red-soft)]",
  warning: "bg-[var(--amber-soft)]",
  info: "bg-[var(--blue-soft)]",
}

const defaultIcon: Record<AlertType, React.ReactNode> = {
  success: <IconCheck />,
  danger: <IconX />,
  warning: <IconAlertTriangle />,
  info: <IconInfoCircle />,
}

function Alert({ type, title, message, icon, className, ...props }: AlertProps) {
  // Danger and warning are urgent → assertive alert role; the rest are polite.
  const role = type === "danger" || type === "warning" ? "alert" : "status"

  return (
    <div
      data-slot="alert"
      data-type={type}
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      className={cn(
        "flex items-center gap-2.5 rounded-[12px] py-1.5 pr-4 pl-2 text-left",
        typeToSurface[type],
        className
      )}
      {...props}
    >
      <Indicator color={typeToColor[type]} size={28} icon={icon ?? defaultIcon[type]} />
      <div data-slot="alert-content" className="flex flex-col gap-1">
        <span className="font-sans text-[13px] font-bold leading-none text-[var(--text)]">
          {title}
        </span>
        {message != null && (
          <span className="font-sans text-[11px] font-normal leading-none text-[var(--text2)]">
            {message}
          </span>
        )}
      </div>
    </div>
  )
}

export { Alert }
