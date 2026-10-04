import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useActionsPlacement, useIconButtonTitles, useToolbarActions } from './toolbarActions'

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
 *
 * On macOS the toolbar names the page, so the in-content title is for screen readers only, and
 * the CommandBar moves into the toolbar's trailing slot (the shell provides it through
 * `ToolbarActionsContext`), drawn as toolbar items (`.toolbar-items` in styles.mac.css). When the
 * toolbar is too narrow for it, the same items fall back to a row at the top of the content
 * (`useActionsPlacement`).
 *
 * `detail` marks a title that names an item (the dash being edited) rather than the
 * page: it stays on screen, and its CommandBar stays with it in the content.
 */
export function PageHeader({ title, detail = false, children }: { title: string; detail?: boolean; children?: ReactNode }) {
  const provided = useToolbarActions()
  const toolbar = detail ? null : provided
  const [bar, setBar] = useState<HTMLDivElement | null>(null)
  const placement = useActionsPlacement(toolbar, bar)
  const inToolbar = toolbar !== null && placement === 'toolbar'
  useIconButtonTitles(bar, toolbar !== null)

  const commandBar = children ? (
    <div ref={setBar} className={toolbar ? 'command-bar toolbar-items' : 'command-bar'} role="toolbar" aria-label={`${title} commands`}>
      {children}
    </div>
  ) : null
  return (
    <div className="page-header">
      <h1 className={detail ? 'page-title detail' : 'page-title'}>{title}</h1>
      {toolbar && inToolbar ? createPortal(commandBar, toolbar.slot) : commandBar}
    </div>
  )
}

/** 1×16px separator between CommandBar groups. */
export function CommandDivider() {
  return <span className="command-divider" role="separator" aria-orientation="vertical" />
}
