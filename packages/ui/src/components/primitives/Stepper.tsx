import * as React from "react"
import { IconMinus, IconPlus } from "@tabler/icons-react"

import { cn } from "../../lib/utils"
import { Button } from "./Button"
import { Input } from "./input"

export type StepperProps = Omit<React.ComponentProps<"div">, "onChange"> & {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  inputLabel?: string
  decrementLabel?: string
  incrementLabel?: string
}

function clamp(value: number, min?: number, max?: number) {
  if (typeof min === "number" && value < min) return min
  if (typeof max === "number" && value > max) return max
  return value
}

function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  inputLabel = "Value",
  decrementLabel = "Decrease value",
  incrementLabel = "Increase value",
  className,
  ...props
}: StepperProps) {
  const [draftValue, setDraftValue] = React.useState(String(value))

  React.useEffect(() => {
    setDraftValue(String(value))
  }, [value])

  const setNextValue = (nextValue: number) => {
    if (Number.isFinite(nextValue)) {
      const clampedValue = clamp(nextValue, min, max)
      setDraftValue(String(clampedValue))
      onChange(clampedValue)
    }
  }

  const commitDraftValue = () => {
    if (draftValue.trim() === "") {
      setDraftValue(String(value))
      return
    }

    const nextValue = Number(draftValue)

    if (Number.isFinite(nextValue)) {
      setNextValue(nextValue)
      return
    }

    setDraftValue(String(value))
  }

  return (
    <div
      data-slot="stepper"
      className={cn("inline-flex items-center gap-1 text-[var(--text2)]", className)}
      {...props}
    >
      <Button
        type="button"
        variant="neutral"
        size="icon-sm"
        aria-label={decrementLabel}
        className="focus-visible:border-[var(--accent)]"
        onClick={() => setNextValue(value - step)}
        disabled={typeof min === "number" && value <= min}
      >
        <IconMinus />
      </Button>
      <Input
        type="number"
        aria-label={inputLabel}
        value={draftValue}
        min={min}
        max={max}
        step={step}
        data-readout="true"
        className="w-[72px] focus-visible:border-[var(--accent)]"
        onChange={(event) => setDraftValue(event.currentTarget.value)}
        onBlur={commitDraftValue}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitDraftValue()
          }
        }}
      />
      <Button
        type="button"
        variant="neutral"
        size="icon-sm"
        aria-label={incrementLabel}
        className="focus-visible:border-[var(--accent)]"
        onClick={() => setNextValue(value + step)}
        disabled={typeof max === "number" && value >= max}
      >
        <IconPlus />
      </Button>
    </div>
  )
}

export { Stepper }
