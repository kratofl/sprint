/**
 * Up and Down in a flyout that is a search box over a list (the setup pickers): Down from the
 * search goes into the list, Up from the first item comes back to the search, and the ends stop
 * rather than wrap. True when the key was one of them, so the caller can prevent the default.
 */
export function moveInSearchList(root: HTMLElement | null, key: string): boolean {
  if (root === null || (key !== 'ArrowDown' && key !== 'ArrowUp')) return false
  const stops = [...root.querySelectorAll<HTMLElement>('input[type="search"], .menu-item:not(:disabled)')]
  const index = stops.findIndex((stop) => stop === document.activeElement)
  const next = key === 'ArrowDown' ? Math.min(index + 1, stops.length - 1) : Math.max(index - 1, 0)
  const target = stops[next]
  target?.focus()
  target?.scrollIntoView({ block: 'nearest' })
  return true
}
