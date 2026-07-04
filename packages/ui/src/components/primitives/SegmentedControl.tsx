import * as React from "react"

import { cn } from "../../lib/utils"

export type SegmentedControlOption = {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

export type SegmentedControlProps = Omit<React.ComponentProps<"div">, "onChange" | "aria-label"> & {
  label: string
  value: string
  options: readonly SegmentedControlOption[]
  onChange: (value: string) => void
  variant?: "accent" | "neutral"
}

function SegmentedControl({
  label,
  value,
  options,
  onChange,
  variant = "accent",
  className,
  ...props
}: SegmentedControlProps) {
  const buttonRefs = React.useRef<Record<string, HTMLButtonElement | null>>({})
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
      role="radiogroup"
      aria-label={label}
      data-slot="segmented-control"
      data-variant={variant}
      className={cn(
        "inline-flex items-center gap-1 rounded-[999px] border border-[var(--line)] bg-[var(--panel2)] p-1",
        className
      )}
    >
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
          data-variant={variant}
          className={cn(
            "inline-flex h-[28px] min-w-[96px] items-center justify-center rounded-full border border-transparent px-4 text-[13px] font-semibold tracking-[0] text-[var(--text2)] transition-colors outline-none",
            "hover:border-[var(--line)] hover:bg-[var(--panel3)] hover:text-[var(--text)]",
            "focus-visible:border-[var(--accent)] focus-visible:outline-none",
            "data-[selected=true]:border-[var(--accent)]",
            "data-[variant=accent]:data-[selected=true]:border-[var(--accent)] data-[variant=accent]:data-[selected=true]:bg-[var(--accent)] data-[variant=accent]:data-[selected=true]:text-[#050505]",
            "data-[variant=neutral]:data-[selected=true]:border-[var(--line2)] data-[variant=neutral]:data-[selected=true]:bg-[var(--panel3)] data-[variant=neutral]:data-[selected=true]:text-[var(--text)]",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
          )}
          onClick={() => selectOption(option.value)}
          onKeyDown={handleKeyDown}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export { SegmentedControl }
