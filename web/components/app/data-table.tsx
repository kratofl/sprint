import type { ReactNode } from 'react'
import Link from 'next/link'
import { CardHead, HeaderAction, listCardClass, type CardAction } from '@/components/app/grouped'
import { cn } from '@/lib/utils'

// The table card of a list page (DESIGN.md → Web app → Tables and lists): one list
// card with a 40px header, caption column heads in label-secondary, 36px rows (48px
// on phones) divided by separator hairlines. Rows are flat; a card never holds
// another card. Figures align right with tabular numbers (`align: 'end'`). What a
// row only shows opens in a DetailSheet instead of extra columns. With `rowHref`
// each row opens its own page: the first cell holds the link, stretched over the row.

export type Column<Row> = {
  header: string
  cell: (row: Row) => ReactNode
  // Numbers and amounts align right.
  align?: 'end'
  // Fixed width for short columns (e.g. 'w-24'); the rest share what is left.
  width?: string
  // Secondary columns that phones leave out.
  hideOnPhone?: boolean
}

const headClass = 'h-9 px-4 text-left align-middle text-caption text-label-secondary'
const cellClass = 'h-9 truncate px-4 py-1.5 align-middle max-lg:h-12 max-lg:py-2.5'

export function DataTable<Row>({
  title,
  action,
  columns,
  rows,
  rowKey,
  rowHref,
  empty,
  className,
}: {
  title: string
  action?: CardAction
  columns: readonly Column<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  rowHref?: (row: Row) => string
  // Shown under the header instead of the table when there are no rows.
  empty: ReactNode
  className?: string
}) {
  const columnClass = (column: Column<Row>) => cn(column.width, column.align === 'end' && 'text-right', column.hideOnPhone && 'max-lg:hidden')
  return (
    <section className={cn(listCardClass, 'flex flex-col', className)} aria-label={title}>
      <CardHead title={title} aside={action ? <HeaderAction action={action} /> : undefined} />
      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col">{empty}</div>
      ) : (
        <table className="w-full table-fixed text-callout">
          <thead>
            <tr className="border-b border-separator">
              {columns.map((column) => (
                <th key={column.header} scope="col" className={cn(headClass, columnClass(column))}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="hairline-rows">
            {rows.map((row) => (
              <tr key={rowKey(row)} className={cn(rowHref && 'relative transition-colors hover:bg-fill')}>
                {columns.map((column, index) => (
                  <td key={column.header} className={cn(cellClass, columnClass(column))}>
                    {rowHref && index === 0 ? (
                      <Link href={rowHref(row)} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-focus-ring">
                        {column.cell(row)}
                      </Link>
                    ) : (
                      column.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
