'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type FormSelectOption<T extends string> = { value: T; label: string }

/**
 * A pick-one field over a fixed option list. `id` lets a <label htmlFor> name it.
 * Radix reserves the empty string, so option values must not be ''.
 */
export function FormSelect<T extends string>({
  id,
  value,
  onValueChange,
  options,
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  id?: string
  value: T
  onValueChange: (value: T) => void
  options: readonly FormSelectOption<T>[]
  disabled?: boolean
  className?: string
  'aria-label'?: string
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        // Radix hands back the string; map it to the typed option it came from.
        const option = options.find((candidate) => candidate.value === next)
        if (option) onValueChange(option.value)
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
