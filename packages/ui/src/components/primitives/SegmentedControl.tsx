"use client"

import * as React from "react"

import { cn } from "../../lib/utils"

export type SegmentedControlOption = {
  value: string
  label: React.ReactNode
  disabled?: boolean
  /** Optional trailing slot rendered inside the segment (lock / page-move / delete affordances). */
  trailing?: React.ReactNode
}

/**
 * `tone` is the Figma name for the active-fill treatment:
 *  - `accent` → active bg Orange/500, text Neutral/900 (default segmented control)
 *  - `light`  → active bg Neutral/50,  text Neutral/900 (the page-tab style)
 *
 * `variant` is the legacy prop the app already passes (`accent` | `neutral`).
 * It is kept for back-compat and maps onto `tone` when `tone` is not provided
 * (`neutral` → the inset/light-ish selected treatment).
 */
export type SegmentedControlTone = "accent" | "light"
export type SegmentedControlVariant = "accent" | "neutral"

export type SegmentedControlProps = Omit<React.ComponentProps<"div">, "onChange" | "aria-label"> & {
  label: string
  value: string
  options: readonly SegmentedControlOption[]
  onChange: (value: string) => void
  tone?: SegmentedControlTone
  variant?: SegmentedControlVariant
}

type IndicatorRect = { left: number; top: number; width: number; height: number; ready: boolean }

function SegmentedControl({
  label,
  value,
  options,
  onChange,
  tone,
  variant = "accent",
  className,
  ...props
}: SegmentedControlProps) {
  // Resolve the effective active-fill tone from the new `tone` prop, falling
  // back to the legacy `variant` (neutral → light, accent → accent).
  const resolvedTone: SegmentedControlTone = tone ?? (variant === "neutral" ? "light" : "accent")

  const containerRef = React.useRef<HTMLDivElement>(null)
  const buttonRefs = React.useRef<Record<string, HTMLButtonElement | null>>({})
  const [indicator, setIndicator] = React.useState<IndicatorRect>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    ready: false,
  })

  // Measure the active segment so a single pill can slide between segments with
  // a gentle overshoot (the "drop" moving from the old active to the new one).
  const prevValueRef = React.useRef(value)
  React.useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = (animate: boolean) => {
      const node = buttonRefs.current[value]
      // Skip until the segment has real geometry, so the pill never animates in
      // from (0,0) when a screen first mounts / is still laying out.
      if (!node || node.offsetWidth === 0) return
      setIndicator({
        left: node.offsetLeft,
        top: node.offsetTop,
        width: node.offsetWidth,
        height: node.offsetHeight,
        ready: animate,
      })
    }

    // Animate ONLY when the selected value actually changed — never on mount or
    // resize (those reposition instantly, so nothing "flies in" on load).
    const valueChanged = prevValueRef.current !== value
    prevValueRef.current = value
    measure(valueChanged)

    const observer = new ResizeObserver(() => measure(false))
    observer.observe(container)
    Object.values(buttonRefs.current).forEach((el) => el && observer.observe(el))

    return () => observer.disconnect()
  }, [value, options])

  const enabledOptions = options.filter((option) => !option.disabled)
  const focusValue = enabledOptions.find((option) => option.value === value)?.value ?? enabledOptions[0]?.value

  const selectOption = (nextValue: string) => {
    onChange(nextValue)
    buttonRefs.current[nextValue]?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentValue = event.currentTarget.value
    const currentIndex = enabledOptions.findIndex((option) => option.value === currentValue)

    if (currentIndex === -1) {
      return
    }

    let nextOption: SegmentedControlOption | undefined

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        nextOption = enabledOptions[(currentIndex - 1 + enabledOptions.length) % enabledOptions.length]
        break
      case "ArrowRight":
      case "ArrowDown":
        nextOption = enabledOptions[(currentIndex + 1) % enabledOptions.length]
        break
      case "Home":
        nextOption = enabledOptions[0]
        break
      case "End":
        nextOption = enabledOptions[enabledOptions.length - 1]
        break
      default:
        return
    }

    event.preventDefault()

    if (nextOption) {
      selectOption(nextOption.value)
    }
  }

  return (
    <div
      {...props}
      ref={containerRef}
      role="radiogroup"
      aria-label={label}
      data-slot="segmented-control"
      data-tone={resolvedTone}
      data-variant={variant}
      className={cn(
        "relative inline-flex items-center gap-1 rounded-pill bg-[var(--panel2)] p-1",
        className
      )}
    >
      {/* Sliding active fill — one pill that springs between segments. */}
      <span
        aria-hidden="true"
        data-slot="segment-indicator"
        data-tone={resolvedTone}
        data-ready={indicator.ready}
        style={{
          left: indicator.left,
          top: indicator.top,
          width: indicator.width,
          height: indicator.height,
        }}
        className={cn(
          "pointer-events-none absolute rounded-pill transition-[left,top,width,height] duration-[340ms] ease-[var(--ease-spring)]",
          "data-[ready=false]:transition-none motion-reduce:transition-none",
          "data-[tone=accent]:bg-[var(--accent)] data-[tone=light]:bg-[var(--primitive-color-neutral-50)]"
        )}
      />
      {options.map((option) => (
        <button
          key={option.value}
          ref={(element) => {
            buttonRefs.current[option.value] = element
          }}
          type="button"
          role="radio"
          value={option.value}
          disabled={option.disabled}
          aria-checked={option.value === value}
          tabIndex={option.value === focusValue ? 0 : -1}
          data-selected={option.value === value}
          data-tone={resolvedTone}
          className={cn(
            "relative z-10 inline-flex h-[25px] items-center justify-center gap-1 rounded-pill border border-transparent px-[18px] py-1.5 font-sans text-[13px] font-medium tracking-[0] whitespace-nowrap text-[var(--text2)] transition-colors outline-none",
            "data-[selected=false]:hover:text-[var(--text)]",
            "focus-visible:border-[var(--accent)] focus-visible:outline-none",
            "data-[tone=accent]:data-[selected=true]:text-[var(--panel)]",
            "data-[tone=light]:data-[selected=true]:text-[var(--panel)]",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
          )}
          onClick={() => selectOption(option.value)}
          onKeyDown={handleKeyDown}
        >
          {option.label}
          {option.trailing != null && (
            <span data-slot="segment-trailing" className="inline-flex shrink-0 items-center">
              {option.trailing}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export { SegmentedControl }
