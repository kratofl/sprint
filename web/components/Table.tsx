import type { ReactNode } from 'react'

export type Column<Row> = {
  header: string
  // Numbers and amounts align right.
  align?: 'end'
  cell: (row: Row) => ReactNode
}

type TableProps<Row> = {
  columns: readonly Column<Row>[]
  // CSS grid-template-columns shared by the head and every row.
  template: string
  rows: readonly Row[]
  rowKey: (row: Row) => string
  // Shown under the column heads when there are no rows.
  empty: ReactNode
}

// Card table: caption column heads, 34px rows with hairlines. Place it in a
// flush Card so the empty state can fill the remaining height.
export default function Table<Row>({ columns, template, rows, rowKey, empty }: TableProps<Row>) {
  const align = (column: Column<Row>) => (column.align === 'end' ? 'cell-end' : undefined)

  return (
    <>
      <div role="table">
        <div role="row" className="table-head" style={{ gridTemplateColumns: template }}>
          {columns.map((column) => (
            <span key={column.header} role="columnheader" className={align(column)}>
              {column.header}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div key={rowKey(row)} role="row" className="table-row" style={{ gridTemplateColumns: template }}>
            {columns.map((column) => (
              <span key={column.header} role="cell" className={align(column)}>
                {column.cell(row)}
              </span>
            ))}
          </div>
        ))}
      </div>
      {rows.length === 0 && empty}
    </>
  )
}
