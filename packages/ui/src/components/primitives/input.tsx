import * as React from "react"

import { cn } from "../../lib/utils"

// Figma "Input": bg Neutral/800, 1px Neutral/700 border, radius xl (18), h32,
// pad 8×10, gap 6, value Inter Regular 13 Neutral/50.
// States: default · focus → border Orange/500 · error → border Red/500 · disabled.
const inputBaseClassName = cn(
  "h-[32px] w-full min-w-0 rounded-[18px] border border-[var(--line)] bg-[var(--panel2)] px-2.5 py-2 font-sans text-[13px] font-normal tracking-[0] text-[var(--text)] transition-colors outline-none",
  "placeholder:text-[var(--text3)]",
  "hover:border-[var(--line2)]",
  "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground",
  "focus:border-[var(--accent)] focus:text-[var(--text)] focus:ring-0 focus:outline-none focus-visible:border-[var(--accent)]",
  "data-[readout=true]:text-right data-[readout=true]:font-sans data-[readout=true]:tabular-nums",
  "data-[status=accent]:border-[var(--accent)] data-[status=accent]:text-[var(--accent)] data-[status=accent]:focus:border-[var(--accent)]",
  "data-[status=neutral]:text-[var(--text2)] data-[status=neutral]:focus:border-[var(--line)] data-[status=neutral]:focus:text-[var(--text)]",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-[var(--text3)] disabled:opacity-80",
  "aria-invalid:border-[var(--red)] aria-invalid:ring-0 data-[error=true]:border-[var(--red)]"
)

export type InputProps = React.ComponentProps<"input"> & {
  /** Optional leading Tabler icon (16px). */
  leadingIcon?: React.ReactNode
  /** Optional trailing Tabler icon (16px). */
  trailingIcon?: React.ReactNode
  /** Mark the field invalid (border Red/500). Mirrors aria-invalid. */
  error?: boolean
}

function Input({
  className,
  type,
  leadingIcon,
  trailingIcon,
  error,
  ...props
}: InputProps) {
  // Plain path: bare <input> so existing callers and data-* hooks stay intact.
  if (!leadingIcon && !trailingIcon) {
    return (
      <input
        type={type}
        data-slot="input"
        data-error={error || undefined}
        aria-invalid={error || props["aria-invalid"]}
        className={cn(inputBaseClassName, className)}
        {...props}
      />
    )
  }

  // Icon path: wrap the field so leading/trailing Tabler icons sit inside the
  // bordered surface (gap 6) per the Figma "Input" anatomy.
  return (
    <div
      data-slot="input-wrapper"
      data-error={error || undefined}
      className={cn(
        "flex h-[32px] w-full min-w-0 items-center gap-1.5 rounded-[18px] border border-[var(--line)] bg-[var(--panel2)] px-2.5 transition-colors",
        "hover:border-[var(--line2)]",
        "focus-within:border-[var(--accent)]",
        "data-[error=true]:border-[var(--red)]",
        "has-[input:disabled]:pointer-events-none has-[input:disabled]:opacity-80",
        className
      )}
    >
      {leadingIcon ? (
        <span className="inline-flex shrink-0 items-center text-[var(--text3)] [&_svg]:size-4">
          {leadingIcon}
        </span>
      ) : null}
      <input
        type={type}
        data-slot="input"
        data-error={error || undefined}
        aria-invalid={error || props["aria-invalid"]}
        className={cn(
          "h-full w-full min-w-0 border-0 bg-transparent p-0 font-sans text-[13px] font-normal tracking-[0] text-[var(--text)] outline-none",
          "placeholder:text-[var(--text3)]",
          "disabled:cursor-not-allowed disabled:text-[var(--text3)]"
        )}
        {...props}
      />
      {trailingIcon ? (
        <span className="inline-flex shrink-0 items-center text-[var(--text3)] [&_svg]:size-4">
          {trailingIcon}
        </span>
      ) : null}
    </div>
  )
}

// Figma "Input w Label": Label (Inter Regular 11, Neutral/300) above the field,
// and a footer row with an optional right-aligned Hint (Saira Regular 12,
// Neutral/400, e.g. "0/20") and/or Error message (Inter Regular 11, Red/500).
export type FieldProps = React.ComponentProps<"div"> & {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  /** Toggle visibility without unmounting children (mirrors the Figma BOOL props). */
  showLabel?: boolean
  showHint?: boolean
  showError?: boolean
  htmlFor?: string
}

function Field({
  className,
  label,
  hint,
  error,
  showLabel = true,
  showHint = true,
  showError = true,
  htmlFor,
  children,
  ...props
}: FieldProps) {
  const labelVisible = showLabel && label != null
  const errorVisible = showError && error != null && error !== false
  const hintVisible = showHint && hint != null
  const footerVisible = errorVisible || hintVisible

  return (
    <div
      data-slot="field"
      className={cn("flex w-full flex-col gap-0.5", className)}
      {...props}
    >
      {labelVisible ? (
        <label
          htmlFor={htmlFor}
          data-slot="field-label"
          className="font-sans text-[11px] font-normal leading-none text-[var(--text2)] data-[error=true]:text-[var(--red)]"
          data-error={errorVisible || undefined}
        >
          {label}
        </label>
      ) : null}
      {children}
      {footerVisible ? (
        <div
          data-slot="field-footer"
          className={cn(
            "flex items-center gap-2.5 pt-0.5",
            errorVisible ? "justify-between" : "justify-end"
          )}
        >
          {errorVisible ? (
            <span
              data-slot="field-error"
              className="font-sans text-[11px] font-normal leading-none text-[var(--red)]"
            >
              {error}
            </span>
          ) : null}
          {hintVisible ? (
            <span
              data-slot="field-hint"
              className="text-right font-saira text-[12px] font-normal leading-none text-[var(--text3)]"
            >
              {hint}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export { Input, Field }
