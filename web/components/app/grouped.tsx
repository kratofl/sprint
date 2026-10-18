// List building blocks: a surface card edged by a separator hairline with an
// optional headline, rows of 36px (48px on phones) separated by hairlines, and the
// common row shapes. Lists are flat rows inside one card, never cards in cards.

import Link from 'next/link'
import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { IconArrowRight } from '@tabler/icons-react'
import { toneTint, type Tone } from '@/lib/tone'
import { cn } from '@/lib/utils'

/** The card behind a list or table. Header and rows are its children. */
export const listCardClass = 'overflow-hidden rounded-lg border border-separator bg-surface shadow-(--shadow-e1)'

/** A card header's action: a link, or a button. */
export type CardAction = { label: string; href: string } | { label: string; onClick: () => void }

/** The 40px (48px on phones) card header: headline title, an optional hint below it, an optional aside right. */
export function CardHead({ title, description, aside }: { title: string; description?: string; aside?: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 px-4 py-2 max-lg:min-h-12 max-lg:py-3">
      <div className="min-w-0">
        <h2 className="text-headline">{title}</h2>
        {description ? <p className="mt-0.5 text-footnote text-pretty text-label-secondary">{description}</p> : null}
      </div>
      {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
    </div>
  )
}

/** A card header's quiet action ("Show all"): label-secondary with a trailing arrow, label on hover. */
export function HeaderAction({ action }: { action: CardAction }) {
  const className = 'inline-flex shrink-0 items-center gap-1 font-medium text-label-secondary transition-colors hover:text-label'
  const content = (
    <>
      {action.label}
      <IconArrowRight aria-hidden className="size-3.5 [stroke-width:2]" />
    </>
  )
  return 'href' in action ? (
    <Link href={action.href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={action.onClick} className={className}>
      {content}
    </button>
  )
}

/** A list card: optional header (title, link action or a quiet trailing note), then hairline rows. */
export function Group({
  title,
  action,
  trailing,
  footer,
  className,
  children,
}: {
  title?: string
  action?: CardAction
  trailing?: ReactNode
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  const header = title || action || trailing
  return (
    <section className={cn('flex flex-col', className)} aria-label={title}>
      <div className={cn(listCardClass, 'flex-1')}>
        {header ? (
          <div className="flex min-h-10 items-center justify-between gap-3 px-4 py-2 max-lg:min-h-12 max-lg:pt-3">
            {title ? <h2 className="text-headline">{title}</h2> : <span />}
            {action ? (
              <HeaderAction action={action} />
            ) : trailing ? (
              <span className="text-footnote text-label-secondary tabular-nums">{trailing}</span>
            ) : null}
          </div>
        ) : null}
        <div className="hairline-rows">{children}</div>
      </div>
      {footer ? <p className="mt-2 px-1 text-footnote text-label-secondary">{footer}</p> : null}
    </section>
  )
}

const rowClass = 'flex min-h-9 w-full items-center gap-3 px-4 py-1.5 text-left max-lg:min-h-12 max-lg:py-2.5'

/** One list row: a link, a button, or plain content. */
export function Row({ children, href, onClick, className }: { children: ReactNode; href?: string; onClick?: () => void; className?: string }) {
  // Rows fill the clipped card, so their focus ring is drawn inside them.
  const interactive = cn(rowClass, 'transition-colors hover:bg-fill focus-visible:outline-offset-[-2px]', className)
  if (href) {
    return (
      <Link href={href} className={interactive}>
        {children}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={interactive}>
        {children}
      </button>
    )
  }
  return <div className={cn(rowClass, className)}>{children}</div>
}

/** A row's text: a title over an optional footnote line. */
export function RowText({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-medium">{title}</span>
      {meta ? <span className="truncate text-footnote text-label-secondary">{meta}</span> : null}
    </span>
  )
}

/** Label left, control right; the form-row shape of settings and editors. */
export function FormRow({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-1.5 max-lg:min-h-12 max-lg:py-2.5">
      <label htmlFor={htmlFor} className="min-w-0">
        <span className="block">{label}</span>
        {hint ? <span className="block text-footnote text-label-secondary">{hint}</span> : null}
      </label>
      <div className="flex min-w-0 items-center justify-end gap-2 text-right">{children}</div>
    </div>
  )
}

/** A padded block inside a list card for content that is not a row. */
export function Block({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 py-3', className)}>{children}</div>
}

/** The trailing arrow of a row that navigates. */
export function Disclosure() {
  return <IconArrowRight aria-hidden className="size-4 shrink-0 text-label-secondary [stroke-width:2]" />
}

/** Tile corners keep the 10px-on-36px proportion of the design system's app tile. */
export function tileRadius(size: number) {
  return Math.round((size * 10) / 36)
}

/** A tinted icon tile for a category or a figure. */
export function IconTile({
  icon: Icon,
  tone,
  size = 32,
}: {
  icon: ComponentType<{ className?: string; style?: CSSProperties }>
  tone: Tone
  size?: number
}) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center', toneTint[tone])}
      style={{ width: size, height: size, borderRadius: tileRadius(size) }}
    >
      <Icon style={{ width: size * 0.56, height: size * 0.56 }} />
    </span>
  )
}

/**
 * The 6px meter: a meter-track (brand tint) with the value in brand-500. The
 * optional marker is a hairline, e.g. where the value should be by now; `label`
 * explains the meter to screen readers and as a tooltip.
 */
export function Meter({ fraction, marker, label, className }: { fraction: number; marker?: number; label?: string; className?: string }) {
  const width = Math.min(100, Math.max(0, fraction * 100))
  return (
    <div role={label ? 'img' : undefined} aria-label={label} title={label} className={cn('relative h-1.5 w-full rounded-full bg-meter-track', className)}>
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${width}%` }} />
      {marker !== undefined ? (
        <div className="absolute -top-1 h-3.5 w-px bg-label" style={{ left: `${Math.min(100, Math.max(0, marker * 100))}%` }} aria-hidden />
      ) : null}
    </div>
  )
}
