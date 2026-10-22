import type { ReactNode } from 'react'
import { CardHead, listCardClass } from '@/components/app/grouped'
import { PageHeader } from '@/components/app/page-header'
import type { ToolbarPrimaryAction } from '@/components/app/toolbar'
import { cn } from '@/lib/utils'

// The Settings page type: the title, a one-line caption and the page's primary
// action in the toolbar, then one column of at most 720px with grouped lists. Each
// section is one list card whose header carries its title and hint, and whose rows
// are 36px (48px on phones) separated by hairlines. Nothing sits between the cards.

export function SettingsSurface({
  title,
  description,
  primaryAction,
  children,
}: {
  title: string
  /** One line about the page: the toolbar caption beside the title (hidden on phones). */
  description?: string
  primaryAction?: ToolbarPrimaryAction
  children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4">
      <PageHeader title={title} caption={description} primaryAction={primaryAction} />
      {children}
    </div>
  )
}

export function SettingsSection({
  title,
  description,
  aside,
  children,
}: {
  title: string
  /** A hint about the whole section, under its title inside the card. */
  description?: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={listCardClass} aria-label={title}>
      <CardHead title={title} description={description} aside={aside} />
      <div className="hairline-rows">{children}</div>
    </section>
  )
}

/** A row: title (and hint) left, its control right. */
export function SettingsRow({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-1.5 max-lg:min-h-12 max-lg:py-2.5', className)}>
      <div className="min-w-0 flex-1">
        <div className="truncate">{title}</div>
        {description ? <p className="text-footnote text-label-secondary">{description}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}

/** A read-only label and value. */
export function SettingsField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4 px-4 py-1.5 max-lg:min-h-12 max-lg:py-2.5">
      <span>{label}</span>
      <span className="truncate text-label-secondary">{value}</span>
    </div>
  )
}

/** A block inside a section that needs its own padding (forms, pickers, empty states). */
export function SettingsBlock({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 py-3', className)}>{children}</div>
}

/** What a list card shows when it has no rows: one centred line inside the card. */
export function SettingsEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-footnote text-label-secondary">{children}</p>
}
