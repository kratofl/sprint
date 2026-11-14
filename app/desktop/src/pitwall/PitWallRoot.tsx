import { useCallback, useEffect, useRef, useState } from 'react'
import { bridge, type LiveLink, type SprintState } from '../bridge'
import { ConfirmDialog } from '../shell/ContentDialog'
import { addPage, deletePage, duplicatePage, findTile, nextPageName, overDraft, renamePage, setDetached, shownPage } from './layoutOps'
import type { PitWallLayout } from './pitWallData'
import type { PitWallRoute } from './route'
import type { TileData } from './tileFrame'
import { KIND_LABEL } from './tileFrame'
import { PitWallBar, RenameDialog, type PageAction } from './PitWallBar'
import { PitWallGrid } from './PitWallGrid'
import { PitWallSlot } from './PitWallSlot'
import { waiting } from './waiting'
import './PitWall.css'

/** How long a saved layout is shown before the host's copy is trusted again, if the two never match. */
const PENDING_MS = 3000

const newId = (): string => crypto.randomUUID()

/** The board, the newest sample and the link's health, for the tiles; empty unless this PC is the linked engineer. */
const tileData = (link: LiveLink): TileData =>
  (link.phase === 'Connected' || link.phase === 'Interrupted') && link.role === 'Engineer'
    ? { pitWall: link.pitWall, latest: link.latest, health: link.health }
    : { pitWall: null, latest: null, health: null }

/**
 * A pit wall window's page (`?pitwall=main|page:<id>|tile:<id>`, electron/pitWallWindows.ts): the
 * wall itself, one page in its own window, or one tile in its own window. Like the dash designer
 * it keeps its own state subscription. A saved layout shows at once and until the host's state
 * carries it (or a moment passes), so an edit never flickers back.
 */
export function PitWallRoot({ route }: { route: PitWallRoute }) {
  const [sprint, setSprint] = useState<SprintState | null>(null)
  const [pending, setPending] = useState<{ layout: PitWallLayout; at: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    bridge
      .getState()
      .then((state) => setSprint((current) => current ?? state))
      .catch((failure: unknown) => console.error('Initial state load failed', failure))
    return bridge.subscribe(setSprint)
  }, [])

  const hostLayout = sprint?.pitWallLayout ?? null
  useEffect(() => {
    if (!pending) return
    if (hostLayout && JSON.stringify(hostLayout) === JSON.stringify(pending.layout)) setPending(null)
    else if (Date.now() - pending.at > PENDING_MS) setPending(null)
  }, [hostLayout, pending])

  const save = useCallback((layout: PitWallLayout) => {
    setPending({ layout, at: Date.now() })
    setError(null)
    bridge.sendCommand({ type: 'pitwall.saveLayout', layout }).catch((failure: unknown) => {
      setPending(null)
      setError(failure instanceof Error ? failure.message : 'The layout could not be saved.')
    })
  }, [])

  const layout = pending?.layout ?? hostLayout
  const latest = useRef(layout)
  latest.current = layout

  // An edit applied to the newest layout at the moment it is made, not the one a render saw, so a
  // window closing or Done never brings back what another window changed in the meantime.
  const change = useCallback(
    (edit: Edit): boolean => {
      const next = latest.current ? edit(latest.current) : null
      if (next) save(next)
      return next !== null
    },
    [save],
  )

  useEffect(() => {
    if (!layout) return
    const name = route.kind === 'page' ? layout.pages.find((page) => page.id === route.id)?.name : route.kind === 'tile' ? tileName(layout, route.id) : null
    document.title = name ? `Pit wall · ${name}` : 'Pit wall'
  }, [layout, route])

  if (!sprint || !layout) return <div className="pw-root" />
  const data = tileData(sprint.link)
  switch (route.kind) {
    case 'main':
      return <MainWall layout={layout} link={sprint.link} data={data} save={save} change={change} error={error} onDismissError={() => setError(null)} />
    case 'page':
      return <PageWindow layout={layout} pageId={route.id} link={sprint.link} data={data} save={save} change={change} />
    case 'tile':
      return <TileWindow layout={layout} tileId={route.id} link={sprint.link} data={data} save={save} change={change} />
  }
}

const tileName = (layout: PitWallLayout, tileId: string): string | null => {
  const found = findTile(layout, tileId)
  return found ? found.tile.layers.map((kind) => KIND_LABEL[kind]).join(' · ') : null
}

/**
 * A page or tile window that is closed while the layout still has it out puts it back on the
 * wall first (Electron cancels a close whose `beforeunload` is prevented, without asking).
 * Windows the wall itself destroys never ask.
 */
function useBackOnClose(stillOut: boolean, putBack: () => void): void {
  const closing = useRef(false)
  const latest = useRef({ stillOut, putBack })
  latest.current = { stillOut, putBack }
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (closing.current || !latest.current.stillOut) return
      closing.current = true
      event.preventDefault()
      event.returnValue = ''
      latest.current.putBack()
      window.setTimeout(() => window.close(), 300)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])
}

type Edit = (layout: PitWallLayout) => PitWallLayout | null

type WindowProps = { layout: PitWallLayout; link: LiveLink; data: TileData; save: (layout: PitWallLayout) => void; change: (edit: Edit) => boolean }

/** The wall: page tabs, the shown page's tiles, and Edit layout. */
function MainWall({ layout, link, data, save, change, error, onDismissError }: WindowProps & { error: string | null; onDismissError: () => void }) {
  const [chosen, setChosen] = useState<string | null>(null)
  const [draft, setDraft] = useState<PitWallLayout | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // The draft holds the edit; which pages and tiles are in their own windows stays live.
  const current = draft ? overDraft(draft, layout) : layout
  const page = shownPage(current, chosen)

  // Outside Edit layout every change saves at once; inside it, it waits for Done.
  const commit = (next: PitWallLayout | null, refusal: string): boolean => {
    if (!next) {
      setNotice(refusal)
      return false
    }
    setNotice(null)
    if (draft) setDraft(next)
    else save(next)
    return true
  }

  // Opening a page or tile in its own window, or putting it back, saves at once, even in Edit
  // layout: windows are not part of the draft.
  const place = (target: { kind: 'page' | 'tile'; id: string }, out: boolean, refusal: string): void => {
    const known = target.kind === 'page' ? layout.pages.some((candidate) => candidate.id === target.id) : findTile(layout, target.id) !== null
    if (!known) {
      setNotice('It is new in this edit. Press Done first.')
      return
    }
    setNotice(null)
    if (!change((latestLayout) => setDetached(latestLayout, target, out))) setNotice(refusal)
  }

  const onPageAction = (action: PageAction, pageId: string): void => {
    switch (action) {
      case 'detach':
        place({ kind: 'page', id: pageId }, true, 'That page is already in its own window.')
        return
      case 'rename':
        setRenaming(pageId)
        return
      case 'duplicate': {
        const id = newId()
        if (commit(duplicatePage(current, pageId, id, newId), 'A pit wall holds at most 12 pages.')) setChosen(id)
        return
      }
      case 'delete':
        setDeleting(pageId)
        return
    }
  }

  const onAddPage = (): void => {
    const id = newId()
    if (commit(addPage(current, id, nextPageName(current)), 'A pit wall holds at most 12 pages.')) setChosen(id)
  }

  const renamingPage = renaming ? current.pages.find((candidate) => candidate.id === renaming) : undefined
  const deletingPage = deleting ? current.pages.find((candidate) => candidate.id === deleting) : undefined

  return (
    <div className="pw-root">
      <PitWallBar
        mode={{ kind: 'main', editing: draft !== null }}
        layout={current}
        shownPageId={page?.id ?? null}
        link={link}
        data={data}
        onChoose={(pageId) => {
          const target = current.pages.find((candidate) => candidate.id === pageId)
          if (target?.detached) void bridge.openPitWall({ kind: 'page', id: pageId })
          else setChosen(pageId)
        }}
        onAddPage={onAddPage}
        onPageAction={onPageAction}
        onEdit={() => {
          setNotice(null)
          setDraft(layout)
        }}
        onCancelEdit={() => {
          setNotice(null)
          setDraft(null)
        }}
        onDoneEdit={() => {
          if (draft) change((latestLayout) => overDraft(draft, latestLayout))
          setNotice(null)
          setDraft(null)
        }}
        onClose={() => window.close()}
      />
      <WaitingBar link={link} />
      {(error || notice) && (
        <div className="infobar warning pw-notice" role="status">
          <span className="infobar-icon" aria-hidden="true">
            !
          </span>
          <span className="infobar-message">{error ?? notice}</span>
          <button
            type="button"
            className="button subtle small"
            onClick={() => {
              setNotice(null)
              onDismissError()
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {page ? (
        <PitWallGrid
          key={page.id}
          layout={current}
          page={page}
          data={data}
          editing={draft !== null}
          onChange={(next, refusal) => commit(next, refusal)}
          onPopOut={(tileId) => place({ kind: 'tile', id: tileId }, true, 'That tile is already in its own window.')}
          onPutBack={(tileId) => place({ kind: 'tile', id: tileId }, false, 'That tile is already on the page.')}
          onEditLayout={() => setDraft(layout)}
        />
      ) : (
        <div className="empty-state pw-all-out">
          <h2>Every page is in its own window</h2>
          <p>Pick a page tab to bring its window to the front, or add a page here.</p>
        </div>
      )}
      {renamingPage && (
        <RenameDialog
          name={renamingPage.name}
          onCancel={() => setRenaming(null)}
          onRename={(name) => {
            commit(renamePage(current, renamingPage.id, name), 'A page name is 1 to 40 characters.')
            setRenaming(null)
          }}
        />
      )}
      {deletingPage && (
        <ConfirmDialog
          title={`Delete “${deletingPage.name}”?`}
          message={`Its ${deletingPage.tiles.length === 1 ? 'tile goes' : `${deletingPage.tiles.length} tiles go`} with it.`}
          confirmLabel="Delete page"
          destructive
          onConfirm={() => {
            commit(deletePage(current, deletingPage.id), 'The pit wall keeps at least one page.')
            setDeleting(null)
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

/** One page in its own window: its tiles, and the way back onto the wall. */
function PageWindow({ layout, pageId, link, data, save, change }: WindowProps & { pageId: string }) {
  const page = layout.pages.find((candidate) => candidate.id === pageId) ?? null
  const putBack = () => void change((latestLayout) => setDetached(latestLayout, { kind: 'page', id: pageId }, false))
  useBackOnClose(page?.detached === true, putBack)
  return (
    <div className="pw-root">
      <PitWallBar mode={{ kind: 'own', title: page?.name ?? 'Page', onBack: putBack }} layout={layout} shownPageId={pageId} link={link} data={data} />
      <WaitingBar link={link} />
      {page ? (
        <PitWallGrid
          layout={layout}
          page={page}
          data={data}
          editing={false}
          onChange={(next) => {
            if (next) save(next)
            return next !== null
          }}
          onPopOut={(tileId) => void change((latestLayout) => setDetached(latestLayout, { kind: 'tile', id: tileId }, true))}
          onPutBack={(tileId) => void change((latestLayout) => setDetached(latestLayout, { kind: 'tile', id: tileId }, false))}
          onEditLayout={null}
        />
      ) : (
        <div className="empty-state pw-all-out">
          <h2>This page is gone</h2>
          <p>It was deleted on the pit wall. Close this window.</p>
        </div>
      )}
    </div>
  )
}

/** One tile in its own window, filling it. */
function TileWindow({ layout, tileId, link, data, change }: WindowProps & { tileId: string }) {
  const found = findTile(layout, tileId)
  const putBack = () => void change((latestLayout) => setDetached(latestLayout, { kind: 'tile', id: tileId }, false))
  useBackOnClose(found?.tile.detached === true, putBack)
  const tile = found?.tile ?? null
  return (
    <div className="pw-root">
      <PitWallBar mode={{ kind: 'own', title: tileName(layout, tileId) ?? 'Tile', onBack: putBack }} layout={layout} shownPageId={found?.page.id ?? null} link={link} data={data} />
      <WaitingBar link={link} />
      {tile ? (
        <div className="pw-single">
          <section className="pw-tile">
            <PitWallSlot tile={tile} data={data} editing={null} onPopOut={null} />
          </section>
        </div>
      ) : (
        <div className="empty-state pw-all-out">
          <h2>This tile is gone</h2>
          <p>It was removed on the pit wall. Close this window.</p>
        </div>
      )}
    </div>
  )
}

/** Said once for the whole wall while there is no board; the tiles below stay empty. */
function WaitingBar({ link }: { link: LiveLink }) {
  const notice = waiting(link)
  if (!notice) return null
  return (
    <div className={`infobar ${notice.tone} pw-notice`} role="status">
      <span className="infobar-icon" aria-hidden="true">
        {notice.tone === 'warning' ? '!' : 'i'}
      </span>
      <strong className="infobar-title">{notice.title}</strong>
      <span className="infobar-message">{notice.reason}</span>
    </div>
  )
}
