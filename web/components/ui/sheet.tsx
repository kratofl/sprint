'use client'

import type { ComponentProps } from 'react'
import { Dialog as SheetPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

// A dialog that slides in from the right as a solid floating panel (surface-floating,
// e4, radius-xl), inset 8px from the window edges, over a dimmed page; full screen on
// phones. Not glass: forms and figures never sit on blur. FormSheet and DetailSheet
// (components/app/form-sheet.tsx) are the shapes pages use.

function Sheet(props: ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetContent({ className, children, ...props }: ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-black/30 duration-(--motion) data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 dark:bg-black/50"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'floating fixed inset-2 z-50 flex flex-col overflow-hidden rounded-xl text-label shadow-(--shadow-e4) duration-(--motion) ease-out data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-right-10 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-right-10 sm:left-auto sm:w-full sm:max-w-md',
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}

function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn('text-headline', className)} {...props} />
}

function SheetDescription({ className, ...props }: ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn('text-footnote text-label-secondary', className)} {...props} />
}

export { Sheet, SheetContent, SheetTitle, SheetDescription }
