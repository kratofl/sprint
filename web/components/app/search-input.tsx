'use client'

import type { ComponentProps } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

/**
 * A search field: a bordered surface field with the magnifier on the left, a pill
 * on fill below lg. `className` sizes the wrapper; every other prop goes to the
 * input, which needs an aria-label or a <label htmlFor>.
 */
export function SearchInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <div className={cn('relative', className)}>
      <IconSearch
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-label-secondary [stroke-width:2] max-lg:left-3.5 max-lg:size-[15px]"
      />
      <input
        type="search"
        className="h-7 w-full rounded-sm border border-border-control bg-surface pr-3 pl-8 text-callout text-label placeholder:text-label-secondary max-lg:h-11 max-lg:rounded-full max-lg:border-0 max-lg:bg-fill max-lg:pr-4 max-lg:pl-9 [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
    </div>
  )
}

/** A page's filter in the toolbar (PageHeader `search`): filters as you type, Esc clears. */
export function ToolbarSearch({
  value,
  onChange,
  label,
  placeholder = 'Search',
}: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
}) {
  return (
    <SearchInput
      className="w-56 max-lg:w-44"
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onChange('')
      }}
    />
  )
}
