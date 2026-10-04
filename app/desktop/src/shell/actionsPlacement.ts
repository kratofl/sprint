/** Where a page's actions render on macOS: in the toolbar, or as a row at the top of the content. */
export type ActionsPlacement = 'toolbar' | 'content'

/**
 * Extra room evicted actions need before they move back into the toolbar. Without it a
 * window resized to exactly the actions' width would bounce them in and out on every pixel.
 * One toolbar icon button wide.
 */
const RETURN_MARGIN = 32

/**
 * Decides where a page's actions go, given the toolbar's free width and the width the actions
 * take in the toolbar (both in px). Actions leave the toolbar as soon as they would not fit (they
 * are never clipped), and return only once they fit with `RETURN_MARGIN` to spare.
 */
export const actionsPlacement = ({
  available,
  needed,
  current,
}: {
  available: number
  needed: number
  current: ActionsPlacement
}): ActionsPlacement => {
  if (current === 'toolbar') return needed <= available ? 'toolbar' : 'content'
  return needed + RETURN_MARGIN <= available ? 'toolbar' : 'content'
}
