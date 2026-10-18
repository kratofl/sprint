// Several metrics side by side as one card (DESIGN.md → Web app → Metrics): cells
// divided by separator hairlines, never a row of separate cards. Up to five cells
// in one row on desktop, more wrap into evenly filled rows (6 → 3 + 3, 7 → 4 + 3);
// phones wrap to two columns. A short last row stretches its cells across. An
// optional header (headline title + link action) sits on top.
//
//   <MetricStrip cells={[
//     { label: 'Best lap', value: '2:03.481', note: <>on lap <strong>14</strong></> },
//     { label: 'Fuel', value: '—', empty: true, note: 'No telemetry yet' },
//   ]} />

import { useId, type ComponentProps, type ReactNode } from 'react'
import { HeaderAction, IconTile, Meter, listCardClass, type CardAction } from '@/components/app/grouped'
import type { Tone } from '@/lib/tone'
import { cn } from '@/lib/utils'

export type MetricCell = {
  label: string
  /** Pre-formatted, e.g. "2:03.481". */
  value: string
  /** No honest number to show: the value renders in label-disabled (pass "—"). */
  empty?: boolean
  /** The 26px tinted tile before the label. */
  icon?: { glyph: ComponentProps<typeof IconTile>['icon']; tone: Tone }
  /** The footnote line under the value; put a key figure in <strong>. */
  note?: ReactNode
  meter?: ComponentProps<typeof Meter>
  /** Shows the value in danger-text. */
  negative?: boolean
  /** A small action at the bottom of the cell. */
  action?: ReactNode
}

// A cell's width per row of 1–5 columns, less 1px so the hairlines still fit; cells
// grow from there. Written out so Tailwind sees every class.
const desktopBasis = ['', 'lg:basis-full', 'lg:basis-[calc(50%_-_1px)]', 'lg:basis-[calc(100%/3_-_1px)]', 'lg:basis-[calc(25%_-_1px)]', 'lg:basis-[calc(20%_-_1px)]']

/** Desktop columns: at most five, with the rows as evenly filled as possible. */
function desktopColumns(count: number) {
  const rows = Math.max(1, Math.ceil(count / 5))
  return Math.max(1, Math.ceil(count / rows))
}

export function MetricStrip({ cells, title, action, className }: { cells: readonly MetricCell[]; title?: string; action?: CardAction; className?: string }) {
  return (
    <section className={cn(listCardClass, className)} aria-label={title}>
      {title ? (
        <div className="flex min-h-10 items-center justify-between gap-3 px-4 py-2 max-lg:min-h-12">
          <h2 className="text-headline">{title}</h2>
          {action ? <HeaderAction action={action} /> : null}
        </div>
      ) : null}
      {/* The separator shows through the 1px gaps as hairlines between cells. */}
      <div className="flex flex-wrap gap-px bg-separator">
        {cells.map((cell) => (
          <MetricCellView key={cell.label} cell={cell} basis={desktopBasis[desktopColumns(cells.length)]} />
        ))}
      </div>
    </section>
  )
}

function MetricCellView({ cell, basis }: { cell: MetricCell; basis: string }) {
  const id = useId()
  return (
    // Two columns on phones, where an odd last cell grows across the row.
    <div className={cn('flex min-w-0 grow basis-[calc(50%_-_1px)] flex-col gap-2 bg-surface px-4 py-3.5', basis)}>
      <span className="flex min-w-0 items-center gap-2">
        {cell.icon ? <IconTile icon={cell.icon.glyph} tone={cell.icon.tone} size={26} /> : null}
        <span className="truncate text-callout font-medium text-label">{cell.label}</span>
      </span>
      <span
        id={`${id}-value`}
        aria-label={cell.empty ? 'No data' : undefined}
        className={cn(
          'block truncate text-kpi tabular-nums max-lg:text-title-2',
          cell.negative && 'text-danger-text',
          cell.empty && 'text-label-disabled',
        )}
      >
        {cell.value}
      </span>
      {cell.note ? <span className="block text-footnote text-label-secondary [&_strong]:font-semibold [&_strong]:text-label">{cell.note}</span> : null}
      {cell.meter ? <Meter {...cell.meter} /> : null}
      {cell.action ? <div className="mt-auto pt-1">{cell.action}</div> : null}
    </div>
  )
}
