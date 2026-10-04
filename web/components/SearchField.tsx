'use client'

import { IconSearch } from '@tabler/icons-react'

type SearchFieldProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}

// Pill search for the toolbar's trailing end. Esc clears the query.
export default function SearchField({ value, onChange, placeholder, label }: SearchFieldProps) {
  return (
    <label className="search-field">
      <IconSearch size={13} stroke={2.2} aria-hidden />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onChange('')
        }}
      />
    </label>
  )
}
