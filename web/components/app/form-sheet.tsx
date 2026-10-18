'use client'

import { useState, type ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

/** What a form sheet's submit reports: done, so the sheet closes, or the message to show inside it. */
export type FormSheetResult = { ok: true } | { ok: false; message: string }

/**
 * A form in a solid sheet: title and description on top, the fields, then Cancel and
 * the submit action in the footer. A failed submit shows its message inside the
 * sheet, since the page behind it is covered. The error clears on resubmit and on
 * close; a successful submit closes the sheet through `close`. Raise a toast from
 * the caller to confirm.
 */
export function FormSheet(props: {
  open: boolean
  title: string
  description: string
  submitLabel: string
  /** `destructive` for a submit that takes something away (remove, leave): never the primary button. */
  submitVariant?: 'default' | 'destructive'
  cancelLabel?: string
  /** Blocks submit, e.g. while a required field is empty. */
  submitDisabled?: boolean
  submit: () => Promise<FormSheetResult>
  close: () => void
  children: ReactNode
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    setError(null)
    props.close()
  }

  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !pending) close()
      }}
    >
      <SheetContent>
        <SheetHead title={props.title} description={props.description} />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (event) => {
            event.preventDefault()
            setPending(true)
            setError(null)
            try {
              const result = await props.submit()
              if (result.ok) close()
              else setError(result.message)
            } finally {
              setPending(false)
            }
          }}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {props.children}
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-separator px-4 py-3">
            <Button type="button" variant="secondary" disabled={pending} onClick={close}>
              {props.cancelLabel ?? 'Cancel'}
            </Button>
            <Button type="submit" variant={props.submitVariant ?? 'default'} disabled={pending || props.submitDisabled}>
              {props.submitLabel}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/** The header both sheets share: title over a one-line description, above a separator. */
function SheetHead({ title, description, leading }: { title: string; description: string; leading?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-separator px-4 py-3">
      {leading}
      <div className="min-w-0 flex-1 space-y-0.5">
        <SheetTitle className="truncate">{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </div>
    </div>
  )
}

/**
 * A read-only sheet that inspects one thing: header (with an optional leading tile),
 * the content (figures as a MetricStrip, latest entries as a list), then its actions
 * in the footer beside Close.
 */
export function DetailSheet(props: {
  open: boolean
  title: string
  description: string
  leading?: ReactNode
  closeLabel?: string
  close: () => void
  /** Footer actions shown before Close, e.g. a link to the full list. */
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.close()
      }}
    >
      <SheetContent>
        <SheetHead title={props.title} description={props.description} leading={props.leading} />
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{props.children}</div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-separator px-4 py-3">
          {props.actions}
          <Button type="button" variant="secondary" onClick={props.close}>
            {props.closeLabel ?? 'Close'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
