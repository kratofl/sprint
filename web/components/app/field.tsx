'use client'

import { useId, useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** A label above its control; the control gets the shared id: `{(id) => <Input id={id} />}`. */
export function Field({ label, className, children }: { label: string; className?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  )
}

type TextFieldProps = {
  label: string
  name: string
  type?: 'text' | 'password' | 'email'
  autoComplete: string
  defaultValue?: string
  className?: string
  // Checks the value when the field loses focus (validate on blur, never while
  // typing). `form` reaches sibling fields, e.g. for a confirmation.
  validate?: (value: string, form: HTMLFormElement | null) => string | null
}

/**
 * A labelled, required text input for forms. A failed check shows under the field
 * in danger-text with a red edge until the user edits it again.
 */
export function TextField({ label, name, type = 'text', autoComplete, defaultValue, className, validate }: TextFieldProps) {
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  return (
    <Field label={label} className={className}>
      {(id) => (
        <>
          <Input
            id={id}
            name={name}
            type={type}
            autoComplete={autoComplete}
            spellCheck={false}
            required
            defaultValue={defaultValue}
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : errorId}
            onBlur={(event) => setError(validate?.(event.currentTarget.value, event.currentTarget.form) ?? null)}
            onChange={() => setError(null)}
          />
          {error !== null && (
            <p id={errorId} className="text-footnote text-danger-text">
              {error}
            </p>
          )}
        </>
      )}
    </Field>
  )
}
