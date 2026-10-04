import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { actionsPlacement, type ActionsPlacement } from './actionsPlacement'

/**
 * The macOS toolbar's slot for the current page's actions. App provides it from the element
 * TitleBar hands up, with `measureRoom`, which reads the toolbar's geometry on the spot and
 * returns the width (px) it can give the actions. The value is replaced whenever the toolbar
 * resizes, so consumers re-check. Windows provides nothing, so PageHeader keeps its CommandBar
 * in the content.
 */
export type ToolbarActions = { slot: HTMLElement; measureRoom: () => number }

export const ToolbarActionsContext = createContext<ToolbarActions | null>(null)

export const useToolbarActions = (): ToolbarActions | null => useContext(ToolbarActionsContext)

/**
 * Where a page header's actions go. The bar is drawn the same in both places (toolbar items,
 * styles.mac.css `.toolbar-items`), so its width is the width it needs in the toolbar wherever it
 * sits. Room and width are read together before paint on every render (page change, new
 * children, toolbar resize) and whenever the bar itself resizes (a label changes), then
 * `actionsPlacement` decides.
 */
export function useActionsPlacement(toolbar: ToolbarActions | null, bar: HTMLElement | null): ActionsPlacement {
  const [placement, setPlacement] = useState<ActionsPlacement>('toolbar')

  const decide = useCallback(() => {
    // Right after a move the old bar is still in state for one commit, detached and 0px wide;
    // deciding on it would send the actions straight back. The new bar's own render decides.
    if (!toolbar || !bar || !bar.isConnected) return
    const next = actionsPlacement({ available: toolbar.measureRoom(), needed: bar.offsetWidth, current: placement })
    if (next !== placement) setPlacement(next)
  }, [toolbar, bar, placement])

  useLayoutEffect(decide)

  useLayoutEffect(() => {
    if (!bar) return
    const observer = new ResizeObserver(decide)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [bar, decide])

  return placement
}

const SHELL_TITLE = 'data-toolbar-title'
const VIEW_TITLE = 'data-view-title'

/**
 * In the toolbar items a `.button.subtle` with a leading icon shows only the icon (styles.mac.css), so
 * the shell gives it a tooltip naming its label; a title the view set itself (a disabled reason)
 * follows the label. Views never set these. React still owns `title`: whatever differs from what
 * this last wrote came from the view, and is kept.
 */
export function useIconButtonTitles(bar: HTMLElement | null, active: boolean): void {
  useEffect(() => {
    if (!active || !bar) return
    const sync = () => {
      for (const button of bar.querySelectorAll<HTMLElement>('.button.subtle')) {
        if (!button.matches(':has(> svg:first-child)')) continue
        const current = button.getAttribute('title')
        const written = button.getAttribute(SHELL_TITLE)
        const viewTitle = current !== null && current === written ? button.getAttribute(VIEW_TITLE) : current
        if (viewTitle === null) button.removeAttribute(VIEW_TITLE)
        else button.setAttribute(VIEW_TITLE, viewTitle)
        const label = button.textContent?.trim() ?? ''
        const title = viewTitle ? `${label} — ${viewTitle}` : label
        if (title !== current) button.setAttribute('title', title)
        button.setAttribute(SHELL_TITLE, title)
      }
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(bar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title'] })
    return () => observer.disconnect()
  }, [bar, active])
}
