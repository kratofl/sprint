import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// Text field: a flat 28px fill-strong field with radius-sm and no edge at rest; focus lifts it
// to surface under the focus ring. A pill of at least 44px below lg. Inside the toolbar it sits
// on the toolbar fill.
function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-7 w-full min-w-0 rounded-sm border border-transparent bg-fill-strong px-2.5 focus:bg-surface text-callout text-label placeholder:text-label-secondary disabled:cursor-not-allowed disabled:bg-bg disabled:text-label-disabled aria-invalid:border-red-500 max-lg:h-11 max-lg:rounded-full max-lg:px-4 in-[.toolbar-band]:border-0 in-[.toolbar-band]:bg-toolbar-fill',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Quiet fields for editable table rows: no edge at rest, so a table of fields reads
 * like a table. A text field shows as plain text and gains a fill on hover; a value
 * field (amount, select) keeps the fill. Focus brings back the border-control edge
 * on surface. Pass one to `className` of an Input or a select trigger.
 */
const quietTextField = 'border-transparent bg-transparent hover:bg-fill focus:border-border-control focus:bg-surface disabled:bg-transparent max-lg:px-2.5'
const quietValueField = 'border-transparent bg-fill focus:border-border-control focus:bg-surface disabled:bg-fill'

export { Input, quietTextField, quietValueField }
