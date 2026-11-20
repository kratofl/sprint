import { useState } from 'react'
import { Flag, LogOut, Pencil, Plus, Trash2 } from 'lucide-react'
import type { DashLayout, DashPage, DashPageBars, DashPageJump } from '@sprint/dashboard'
import type { DashMode } from '../bridge'
import { ConfirmDialog } from '../shell/ContentDialog'
import { MenuLayer, type MenuAnchor } from '../shell/Menu'
import { Switch } from '../shell/Switch'
import { SESSIONS, setEverySession, setPageJump, showsEverywhere, toggleShowIn } from './pageModes'
import { setPageBars } from './layoutOps'
import type { Mutate } from './useDesignerDoc'

type Apply = (mutate: Mutate, group?: string) => boolean

/** The driver's own modes, kept by the host (`dash.mode.*`); creating one resolves to its id, or null when refused. */
export type ModeActions = {
  modes: readonly DashMode[]
  create: (name: string) => Promise<string | null>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

const JUMPS: readonly { id: DashPageJump | null; label: string; hint: string }[] = [
  { id: null, label: 'Never', hint: 'Only the wheel’s buttons bring it up.' },
  { id: 'outLap', label: 'Out lap', hint: 'As you leave the pit lane, at the start of your out lap.' },
  { id: 'flyingLap', label: 'Flying lap', hint: 'As you cross the line at the end of your out lap, and again at the start of every lap after it.' },
]

const BARS: readonly { id: DashPageBars; label: string; hint: string }[] = [
  { id: 'both', label: 'Both', hint: 'Bars down both sides and across the top.' },
  { id: 'top', label: 'Top', hint: 'Only the top bar; the side grids grow to the edges.' },
  { id: 'sides', label: 'Sides', hint: 'Only the side bars; the widgets move up to the top edge.' },
  { id: 'none', label: 'None', hint: 'No bars; the widgets use the whole screen.' },
]

/**
 * The page's own panel, on the right of the Layout section while nothing is selected: where the
 * wheel cycles it — every session (what every page starts as), or only the picked sessions and
 * the driver's own modes — and when the wheel jumps to it by itself. The idle page has neither.
 * On a zoned dash, every page (the idle one too) also picks the bar spots it keeps.
 */
export function PageInspector({ layout, page, isIdlePage, apply, modes }: { layout: DashLayout; page: DashPage; isIdlePage: boolean; apply: Apply; modes: ModeActions }) {
  const index = layout.pages.findIndex((candidate) => candidate.id === page.id)
  const every = showsEverywhere(page)
  const jump = JUMPS.find((candidate) => candidate.id === (page.jump ?? null)) ?? JUMPS[0]
  const picked = new Set(page.showIn ?? [])

  return (
    <aside className="designer-glass designer-inspector" aria-label={`${page.name} page`}>
      <div className="designer-panel-head">
        <h2 className="designer-panel-title">{page.name}</h2>
        <span className="muted designer-page-count">{isIdlePage ? 'Idle page' : `Page ${index + 1} of ${layout.pages.length}`}</span>
      </div>

      {isIdlePage ? (
        <>
          <p className="field-hint">Shown while you are in the menus or the garage.</p>
          {layout.zoned && <BarsGroup page={page} apply={apply} />}
        </>
      ) : (
        <>
          <div className="designer-group">
            <div className="designer-switch-row">
              <span className="designer-switch-text">
                <span id="page-every-session" className="designer-switch-title">
                  Every session
                </span>
                <span className="muted designer-switch-hint">{every ? 'Shows whatever you drive. Turn off to pick.' : 'Off: shows only where picked below.'}</span>
              </span>
              <Switch checked={every} onChange={(next) => apply((current) => setEverySession(current, page.id, next))} stateText={false} aria-labelledby="page-every-session" />
            </div>
            {!every && (
              <>
                <div className="designer-chips" role="group" aria-label="Sessions">
                  {SESSIONS.map((session) => (
                    <button key={session.id} type="button" className="filter-chip" aria-pressed={picked.has(session.id)} onClick={() => apply((current) => toggleShowIn(current, page.id, session.id))}>
                      {session.label}
                    </button>
                  ))}
                </div>
                <h3 className="designer-group-title designer-modes-title">Your modes</h3>
                <ModeChips modes={modes} picked={picked} onToggle={(id) => apply((current) => toggleShowIn(current, page.id, id))} />
              </>
            )}
          </div>

          {layout.zoned && <BarsGroup page={page} apply={apply} />}

          <div className="designer-group">
            <h3 id="page-jump" className="designer-group-title">
              Jump to this page
            </h3>
            <div className="segmented designer-jump" role="radiogroup" aria-labelledby="page-jump">
              {JUMPS.map((candidate) => (
                <button
                  key={candidate.label}
                  type="button"
                  role="radio"
                  className="segmented-item"
                  aria-checked={candidate.id === jump.id}
                  onClick={() => apply((current) => setPageJump(current, page.id, candidate.id))}
                >
                  {candidate.id === 'outLap' && <LogOut aria-hidden="true" />}
                  {candidate.id === 'flyingLap' && <Flag aria-hidden="true" />}
                  {candidate.label}
                </button>
              ))}
            </div>
            <p className="field-hint designer-jump-hint">{jump.hint}</p>
          </div>
        </>
      )}
    </aside>
  )
}

/** The bar spots the page keeps, as four tiny wheels; a dropped spot folds away and the grids grow into it. */
function BarsGroup({ page, apply }: { page: DashPage; apply: Apply }) {
  const bars = BARS.find((candidate) => candidate.id === (page.bars ?? 'both')) ?? BARS[0]
  return (
    <div className="designer-group">
      <h3 id="page-bars" className="designer-group-title">
        Bars
      </h3>
      <div className="designer-choices" role="radiogroup" aria-labelledby="page-bars">
        {BARS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="radio"
            className="designer-choice"
            aria-checked={candidate.id === bars.id}
            onClick={() => apply((current) => setPageBars(current, page.id, candidate.id))}
          >
            <BarsThumb bars={candidate.id} />
            <span className="designer-choice-name">{candidate.label}</span>
          </button>
        ))}
      </div>
      <p className="field-hint designer-jump-hint">{bars.hint}</p>
    </div>
  )
}

/** A tiny wheel for one bars choice: the kept bars in the brand colour, the side grids and centre grown into the rest. */
function BarsThumb({ bars }: { bars: DashPageBars }) {
  const sides = bars === 'both' || bars === 'sides'
  const top = bars === 'both' || bars === 'top'
  const gx = sides ? 7 : 3
  const gy = top ? 8 : 3
  const gw = (64 - gx * 2 - 12) / 2
  return (
    <svg className="designer-thumb" viewBox="0 0 64 40" aria-hidden="true">
      <rect x={0.5} y={0.5} width={63} height={39} rx={5} className="designer-thumb-face" />
      {sides && <rect x={2} y={3} width={3} height={34} rx={1} className="designer-thumb-bar" />}
      {sides && <rect x={59} y={3} width={3} height={34} rx={1} className="designer-thumb-bar" />}
      {top && <rect x={gx} y={3} width={64 - gx * 2} height={3} rx={1} className="designer-thumb-bar" />}
      <rect x={gx} y={gy} width={gw} height={37 - gy} rx={1} className="designer-thumb-zone" />
      <rect x={gx + gw + 2} y={gy} width={8} height={37 - gy} rx={1} className="designer-thumb-zone" />
      <rect x={gx + gw + 12} y={gy} width={gw} height={37 - gy} rx={1} className="designer-thumb-zone" />
    </svg>
  )
}

/**
 * The driver's modes as chips, picked or not, and "+ New" that turns into a name field. A
 * right-click on a mode renames or deletes it (everywhere: modes are app-wide).
 */
function ModeChips({ modes, picked, onToggle }: { modes: ModeActions; picked: ReadonlySet<string>; onToggle: (id: string) => void }) {
  const [editing, setEditing] = useState<{ kind: 'new' } | { kind: 'rename'; id: string } | null>(null)
  const [menu, setMenu] = useState<{ id: string; anchor: MenuAnchor } | null>(null)
  const [deleting, setDeleting] = useState<DashMode | null>(null)
  const [error, setError] = useState<string | null>(null)

  const commit = async (name: string): Promise<void> => {
    const trimmed = name.trim()
    const target = editing
    setEditing(null)
    if (!trimmed || !target) return
    try {
      if (target.kind === 'new') {
        const id = await modes.create(trimmed)
        if (id) onToggle(id)
      } else if (modes.modes.find((mode) => mode.id === target.id)?.name !== trimmed) {
        await modes.rename(target.id, trimmed)
      }
      setError(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The mode could not be saved.')
    }
  }

  const field = (initial: string, label: string) => (
    <input
      className="designer-chip-field"
      aria-label={label}
      defaultValue={initial}
      maxLength={24}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.value = ''
          event.currentTarget.blur()
        }
      }}
      onBlur={(event) => void commit(event.currentTarget.value)}
    />
  )

  const menuMode = menu ? modes.modes.find((mode) => mode.id === menu.id) : undefined
  return (
    <>
      <div className="designer-chips" role="group" aria-label="Your modes">
        {modes.modes.map((mode) =>
          editing?.kind === 'rename' && editing.id === mode.id ? (
            <span key={mode.id}>{field(mode.name, 'Mode name')}</span>
          ) : (
            <button
              key={mode.id}
              type="button"
              className="filter-chip"
              aria-pressed={picked.has(mode.id)}
              title="Right-click to rename or delete"
              onClick={() => onToggle(mode.id)}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({ id: mode.id, anchor: { x: event.clientX, y: event.clientY } })
              }}
            >
              {mode.name}
            </button>
          ),
        )}
        {editing?.kind === 'new' ? (
          field('', 'New mode name')
        ) : (
          <button type="button" className="filter-chip" onClick={() => setEditing({ kind: 'new' })}>
            <Plus /> New
          </button>
        )}
      </div>
      {error && <p className="field-error">{error}</p>}

      {menu && menuMode && (
        <MenuLayer anchor={menu.anchor} label={`${menuMode.name} actions`} width={200} onClose={() => setMenu(null)}>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setMenu(null)
              setEditing({ kind: 'rename', id: menuMode.id })
            }}
          >
            <Pencil />
            <span className="menu-item-label">Rename</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item destructive"
            onClick={() => {
              setMenu(null)
              setDeleting(menuMode)
            }}
          >
            <Trash2 />
            <span className="menu-item-label">Delete…</span>
          </button>
        </MenuLayer>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="Pages in it on every dash lose it, and multi-dial positions that switched it on switch nothing on. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const id = deleting.id
            setDeleting(null)
            modes.remove(id).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'The mode could not be deleted.'))
          }}
        />
      )}
    </>
  )
}
