'use client'

import { useId, useState } from 'react'

type FieldProps = {
  label: string
  name: string
  type?: 'text' | 'password'
  autoComplete: string
  defaultValue?: string
  // Checks the value when the field loses focus (DESIGN.md: validate on blur,
  // never while typing). `form` reaches sibling fields, e.g. for a confirmation.
  validate?: (value: string, form: HTMLFormElement | null) => string | null
}

// Labelled text input for settings forms. A failed check shows under the field
// with a red border until the user edits it again.
export default function Field({ label, name, type = 'text', autoComplete, defaultValue, validate }: FieldProps) {
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  return (
    <label className="field">
      {label}
      <input
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
        <span id={errorId} className="field-error">
          {error}
        </span>
      )}
    </label>
  )
}
