import type { ReactNode } from 'react'

/**
 * The Fluent page header every view starts with: a 24px Display title and,
 * when the page has actions, a 36px CommandBar row underneath.
 *
 * Children are the CommandBar's contents, left to right: at most one
 * `.button.primary`, standard/subtle `.button`s, a `<select>` for view options
 * (Windows prefers a select over a segmented control here), `<CommandDivider />`
 * between groups, then `<span className="command-spacer" />` and trailing
 * `.icon-button`s (e.g. the "More options" …).
 *
 *   <PageHeader title="Devices">
 *     <button type="button" className="button primary"><Plus />Add device</button>
 *     <CommandDivider />
 *     <button type="button" className="button subtle"><RefreshCw />Rescan</button>
 *     <span className="command-spacer" />
 *     <button type="button" className="icon-button" aria-label="More options"><MoreHorizontal /></button>
 *   </PageHeader>
 */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-header">
      <h1 className="page-title">{title}</h1>
      {children ? (
        <div className="command-bar" role="toolbar" aria-label={`${title} commands`}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

/** 1×16px separator between CommandBar groups. */
export function CommandDivider() {
  return <span className="command-divider" role="separator" aria-orientation="vertical" />
}
