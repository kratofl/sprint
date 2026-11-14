import type { PitWallLayout, PitWallPage, PitWallTile, TileKind } from './pitWallData'

// Pure edits of the pit wall layout. Each returns the new layout, or null when the edit is not
// allowed (it would overlap, leave the grid, or break a limit the host also checks in
// `pitwall.saveLayout`). Views call these and send the result; nothing here touches I/O.

export const GRID_COLS = 12
export const GRID_ROWS = 8
export const MAX_LAYERS = 6
export const MAX_PAGES = 12
export const MAX_PAGE_NAME = 40
export const MIN_CYCLE_SECONDS = 3
export const MAX_CYCLE_SECONDS = 120

export type Rect = { x: number; y: number; w: number; h: number }

/** The size a new tile asks for; it shrinks to fit when the page has no room for it. */
const PREFERRED_SIZE: Record<TileKind, { w: number; h: number }> = {
  session: { w: 12, h: 1 },
  timing: { w: 7, h: 4 },
  track: { w: 5, h: 3 },
  stint: { w: 3, h: 3 },
  fuel: { w: 4, h: 3 },
  relative: { w: 3, h: 3 },
  target: { w: 3, h: 3 },
  tyres: { w: 6, h: 4 },
  pressure: { w: 5, h: 3 },
  damage: { w: 5, h: 3 },
  radar: { w: 3, h: 3 },
  traces: { w: 12, h: 4 },
  control: { w: 4, h: 3 },
  pitstop: { w: 4, h: 3 },
}

export const insideGrid = (rect: Rect): boolean =>
  Number.isInteger(rect.x) && Number.isInteger(rect.y) && Number.isInteger(rect.w) && Number.isInteger(rect.h) &&
  rect.w >= 1 && rect.h >= 1 && rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= GRID_COLS && rect.y + rect.h <= GRID_ROWS

export const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Whether `rect` lies on the grid without touching any tile of the page but those in `ignore`. */
export const canPlace = (page: PitWallPage, rect: Rect, ignore: readonly string[] = []): boolean =>
  insideGrid(rect) && page.tiles.every((tile) => ignore.includes(tile.id) || !overlaps(tile, rect))

/** The first free spot (row by row) for a tile of up to `size`, shrinking it until one fits; null on a full page. */
export function freeSpot(page: PitWallPage, size: { w: number; h: number }): Rect | null {
  for (let area = size.w * size.h; area >= 1; area--) {
    for (let h = Math.min(size.h, GRID_ROWS); h >= 1; h--) {
      for (let w = Math.min(size.w, GRID_COLS); w >= 1; w--) {
        if (w * h !== area) continue
        for (let y = 0; y + h <= GRID_ROWS; y++) {
          for (let x = 0; x + w <= GRID_COLS; x++) {
            const rect = { x, y, w, h }
            if (canPlace(page, rect)) return rect
          }
        }
      }
    }
  }
  return null
}

const withPage = (layout: PitWallLayout, pageId: string, edit: (page: PitWallPage) => PitWallPage | null): PitWallLayout | null => {
  const page = layout.pages.find((candidate) => candidate.id === pageId)
  const next = page ? edit(page) : null
  return next ? { ...layout, pages: layout.pages.map((candidate) => (candidate.id === pageId ? next : candidate)) } : null
}

const withTile = (layout: PitWallLayout, pageId: string, tileId: string, edit: (tile: PitWallTile, page: PitWallPage) => PitWallTile | null): PitWallLayout | null =>
  withPage(layout, pageId, (page) => {
    const tile = page.tiles.find((candidate) => candidate.id === tileId)
    const next = tile ? edit(tile, page) : null
    return next ? { ...page, tiles: page.tiles.map((candidate) => (candidate.id === tileId ? next : candidate)) } : null
  })

export const newTile = (id: string, kind: TileKind, rect: Rect): PitWallTile => ({
  id,
  layers: [kind],
  ...rect,
  cycleSeconds: 10,
  pauseOnHover: true,
  jumpRadar: true,
  jumpDamage: true,
  detached: false,
  bounds: null,
})

export const moveTile = (layout: PitWallLayout, pageId: string, tileId: string, x: number, y: number): PitWallLayout | null =>
  withTile(layout, pageId, tileId, (tile, page) => (canPlace(page, { x, y, w: tile.w, h: tile.h }, [tileId]) ? { ...tile, x, y } : null))

export const resizeTile = (layout: PitWallLayout, pageId: string, tileId: string, w: number, h: number): PitWallLayout | null =>
  withTile(layout, pageId, tileId, (tile, page) => (canPlace(page, { x: tile.x, y: tile.y, w, h }, [tileId]) ? { ...tile, w, h } : null))

export const removeTile = (layout: PitWallLayout, pageId: string, tileId: string): PitWallLayout | null =>
  withPage(layout, pageId, (page) => (page.tiles.some((tile) => tile.id === tileId) ? { ...page, tiles: page.tiles.filter((tile) => tile.id !== tileId) } : null))

/** Adds a tile of `kind` at the first free spot; null when the page is full. */
export const addTile = (layout: PitWallLayout, pageId: string, kind: TileKind, id: string): PitWallLayout | null =>
  withPage(layout, pageId, (page) => {
    const rect = freeSpot(page, PREFERRED_SIZE[kind])
    return rect ? { ...page, tiles: [...page.tiles, newTile(id, kind, rect)] } : null
  })

/**
 * Drops the tile `dragId` onto `ontoId`: one slot (the target's) with the target's layers first,
 * then the dropped tile's. Kinds already in the target are not repeated. Null when nothing new
 * would join or the stack would pass `MAX_LAYERS`.
 */
export const stackOnto = (layout: PitWallLayout, pageId: string, dragId: string, ontoId: string): PitWallLayout | null =>
  withPage(layout, pageId, (page) => {
    const drag = page.tiles.find((tile) => tile.id === dragId)
    const onto = page.tiles.find((tile) => tile.id === ontoId)
    if (!drag || !onto || drag === onto) return null
    const joining = drag.layers.filter((kind) => !onto.layers.includes(kind))
    if (joining.length === 0 || onto.layers.length + joining.length > MAX_LAYERS) return null
    const merged = { ...onto, layers: [...onto.layers, ...joining] }
    return { ...page, tiles: page.tiles.filter((tile) => tile.id !== dragId).map((tile) => (tile.id === ontoId ? merged : tile)) }
  })

export const addLayer = (layout: PitWallLayout, pageId: string, tileId: string, kind: TileKind): PitWallLayout | null =>
  withTile(layout, pageId, tileId, (tile) =>
    tile.layers.includes(kind) || tile.layers.length >= MAX_LAYERS ? null : { ...tile, layers: [...tile.layers, kind] },
  )

/** Takes one layer out of a stack; the last layer cannot go (remove the tile instead). */
export const removeLayer = (layout: PitWallLayout, pageId: string, tileId: string, index: number): PitWallLayout | null =>
  withTile(layout, pageId, tileId, (tile) =>
    tile.layers.length <= 1 || index < 0 || index >= tile.layers.length ? null : { ...tile, layers: tile.layers.filter((_, at) => at !== index) },
  )

/** Moves a layer one place up (−1) or down (+1); the first layer is the one shown first. */
export const moveLayer = (layout: PitWallLayout, pageId: string, tileId: string, index: number, delta: -1 | 1): PitWallLayout | null =>
  withTile(layout, pageId, tileId, (tile) => {
    const to = index + delta
    if (index < 0 || index >= tile.layers.length || to < 0 || to >= tile.layers.length) return null
    const layers = [...tile.layers]
    ;[layers[index], layers[to]] = [layers[to], layers[index]]
    return { ...tile, layers }
  })

/**
 * Splits a stack: its first layer keeps the slot, every other layer becomes a tile of its own at
 * a free spot. Null when the page has no room for all of them.
 */
export const unstack = (layout: PitWallLayout, pageId: string, tileId: string, newId: () => string): PitWallLayout | null =>
  withPage(layout, pageId, (page) => {
    const tile = page.tiles.find((candidate) => candidate.id === tileId)
    if (!tile || tile.layers.length < 2) return null
    let next: PitWallPage = { ...page, tiles: page.tiles.map((candidate) => (candidate.id === tileId ? { ...tile, layers: tile.layers.slice(0, 1) } : candidate)) }
    for (const kind of tile.layers.slice(1)) {
      const rect = freeSpot(next, { w: tile.w, h: tile.h })
      if (!rect) return null
      next = { ...next, tiles: [...next.tiles, newTile(newId(), kind, rect)] }
    }
    return next
  })

export type StackOptions = Partial<Pick<PitWallTile, 'cycleSeconds' | 'pauseOnHover' | 'jumpRadar' | 'jumpDamage'>>

/** Sets how a stack switches. A cycle outside 3–120 s is refused. */
export const setStackOptions = (layout: PitWallLayout, pageId: string, tileId: string, options: StackOptions): PitWallLayout | null => {
  const cycle = options.cycleSeconds
  if (cycle !== undefined && cycle !== null && !(Number.isInteger(cycle) && cycle >= MIN_CYCLE_SECONDS && cycle <= MAX_CYCLE_SECONDS)) return null
  return withTile(layout, pageId, tileId, (tile) => ({ ...tile, ...options }))
}

/** A page or tile in its own window (or back). Finds the tile on whichever page holds it. */
export const setDetached = (layout: PitWallLayout, target: { kind: 'page' | 'tile'; id: string }, detached: boolean): PitWallLayout | null => {
  if (target.kind === 'page') {
    return withPage(layout, target.id, (page) => (page.detached === detached ? null : { ...page, detached }))
  }
  const page = layout.pages.find((candidate) => candidate.tiles.some((tile) => tile.id === target.id))
  return page ? withTile(layout, page.id, target.id, (tile) => (tile.detached === detached ? null : { ...tile, detached })) : null
}

const cleanName = (name: string): string | null => {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= MAX_PAGE_NAME ? trimmed : null
}

/** "Page 4", the first such name not taken. */
export const nextPageName = (layout: PitWallLayout): string => {
  for (let n = layout.pages.length + 1; ; n++) {
    const name = `Page ${n}`
    if (!layout.pages.some((page) => page.name === name)) return name
  }
}

export const addPage = (layout: PitWallLayout, id: string, name: string): PitWallLayout | null => {
  const clean = cleanName(name)
  if (!clean || layout.pages.length >= MAX_PAGES || layout.pages.some((page) => page.id === id)) return null
  return { ...layout, pages: [...layout.pages, { id, name: clean, detached: false, bounds: null, tiles: [] }] }
}

export const renamePage = (layout: PitWallLayout, pageId: string, name: string): PitWallLayout | null => {
  const clean = cleanName(name)
  return clean ? withPage(layout, pageId, (page) => (page.name === clean ? null : { ...page, name: clean })) : null
}

/** A copy right after the original, "Race copy", every tile with a new id and back on the wall. */
export const duplicatePage = (layout: PitWallLayout, pageId: string, id: string, newId: () => string): PitWallLayout | null => {
  const index = layout.pages.findIndex((page) => page.id === pageId)
  if (index < 0 || layout.pages.length >= MAX_PAGES) return null
  const source = layout.pages[index]
  // Cut to the limit and trimmed, as the host stores it ("Long name copy" cut after a space).
  const name = `${source.name} copy`.slice(0, MAX_PAGE_NAME).trim()
  const copy: PitWallPage = { id, name, detached: false, bounds: null, tiles: source.tiles.map((tile) => ({ ...tile, id: newId(), detached: false, bounds: null })) }
  return { ...layout, pages: [...layout.pages.slice(0, index + 1), copy, ...layout.pages.slice(index + 1)] }
}

/**
 * Edit layout's draft laid over the newest saved layout: pages, names, tiles and layers from the
 * draft; whether each page and tile is in its own window, and where its window sits (and the
 * wall's own window), from the newest, since windows open, close and move during an edit. Pages
 * and tiles the draft added keep their own.
 */
export const overDraft = (draft: PitWallLayout, latest: PitWallLayout): PitWallLayout => {
  const pages = new Map(latest.pages.map((page) => [page.id, page]))
  const tiles = new Map(latest.pages.flatMap((page) => page.tiles).map((tile) => [tile.id, tile]))
  return {
    mainBounds: latest.mainBounds,
    pages: draft.pages.map((page) => {
      const live = pages.get(page.id)
      return {
        ...page,
        detached: live ? live.detached : page.detached,
        bounds: live ? live.bounds : page.bounds,
        tiles: page.tiles.map((tile) => {
          const out = tiles.get(tile.id)
          return out ? { ...tile, detached: out.detached, bounds: out.bounds } : tile
        }),
      }
    }),
  }
}

/** The last page cannot go. */
export const deletePage = (layout: PitWallLayout, pageId: string): PitWallLayout | null =>
  layout.pages.length <= 1 || !layout.pages.some((page) => page.id === pageId) ? null : { ...layout, pages: layout.pages.filter((page) => page.id !== pageId) }

/** Where a tile dragged by `dx`, `dy` cells from its place would land, kept on the grid. */
export const draggedTo = (tile: Rect, dx: number, dy: number): { x: number; y: number } => ({
  x: Math.min(GRID_COLS - tile.w, Math.max(0, tile.x + dx)),
  y: Math.min(GRID_ROWS - tile.h, Math.max(0, tile.y + dy)),
})

/** The size a tile resized by `dw`, `dh` cells would take, kept on the grid and at least one cell. */
export const resizedTo = (tile: Rect, dw: number, dh: number): { w: number; h: number } => ({
  w: Math.min(GRID_COLS - tile.x, Math.max(1, tile.w + dw)),
  h: Math.min(GRID_ROWS - tile.y, Math.max(1, tile.h + dh)),
})

/** The page the main window shows: the chosen one while it is on the wall, else the first page still there. */
export const shownPage = (layout: PitWallLayout, chosenId: string | null): PitWallPage | null =>
  layout.pages.find((page) => page.id === chosenId && !page.detached) ?? layout.pages.find((page) => !page.detached) ?? null

/** Finds a tile and its page anywhere in the layout. */
export const findTile = (layout: PitWallLayout, tileId: string): { page: PitWallPage; tile: PitWallTile } | null => {
  for (const page of layout.pages) {
    const tile = page.tiles.find((candidate) => candidate.id === tileId)
    if (tile) return { page, tile }
  }
  return null
}
