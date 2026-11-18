import { useState } from 'react'
import { AppWindow, ExternalLink, Minus, Plus, Send, Undo2 } from 'lucide-react'
import { bridge } from '../../bridge'
import { MenuLayer, type MenuAnchor } from '../../shell/Menu'
import { Status } from '../../shell/Status'
import { headlineTarget } from '../../views/SessionPlannerDomain'
import { MAX_RADIO_TEXT, RADIO_CALLS, deliveryStatus, openable, ownWindows, sentClock, stepTarget, targetText, type WindowTarget } from '../radio'
import { TileEmpty, TileFrame, type FrameProps, type TileData } from '../tileFrame'
import { carNumber, lapClock, playerOf } from '../timing'

/**
 * The radio to the driver's wheel: one press for a call, a new target lap a tenth at a time, or a
 * typed line; below, what was sent and what became of it (on the wheel, seen, not acknowledged).
 * The host refuses what the wheel cannot show, and says why.
 */
export function RadioTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const { radio, actions, pitWall } = data
  const player = pitWall ? playerOf(pitWall.field) : null
  const planned = pitWall?.plan ? (headlineTarget(pitWall.plan)?.lapTimeSeconds ?? null) : null
  const [target, setTarget] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!radio || !actions) return <TileFrame frame={frame} title="Radio" />
  const title = player ? `Radio · #${carNumber(player)}` : 'Radio'
  if (!radio.canSend) {
    return (
      <TileFrame frame={frame} title={title}>
        <TileEmpty title="The driver needs a newer Sprint" text="Radio messages reach their wheel once they update." />
      </TileFrame>
    )
  }

  // The stepper starts from the plan's target lap, else the driver's best this session.
  const shownTarget = target ?? planned ?? player?.bestLap ?? null
  const send = (message: string, targetLapSeconds?: number) => {
    setError(null)
    actions
      .send({ type: 'radio.send', text: message, ...(targetLapSeconds === undefined ? {} : { targetLapSeconds }) })
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'The message was not sent.'))
  }

  return (
    <TileFrame frame={frame} title={title} extra={<span className="muted">to the wheel</span>} bodyClass="pw-radio">
      <div className="pw-radio-calls">
        {RADIO_CALLS.map((call) => (
          <button key={call} type="button" className="button small" onClick={() => send(call)}>
            {call}
          </button>
        ))}
      </div>
      <div className="pw-radio-target">
        <span className="pw-radio-label">Target lap</span>
        <span className="pw-stepper">
          <button
            type="button"
            className="icon-button"
            aria-label="A tenth faster"
            disabled={shownTarget === null}
            onClick={() => shownTarget !== null && setTarget(stepTarget(shownTarget, -1))}
          >
            <Minus size={14} />
          </button>
          <span className="pw-stepper-value tabular">{lapClock(shownTarget)}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="A tenth slower"
            disabled={shownTarget === null}
            onClick={() => shownTarget !== null && setTarget(stepTarget(shownTarget, 1))}
          >
            <Plus size={14} />
          </button>
        </span>
        <button type="button" className="button" disabled={shownTarget === null} onClick={() => shownTarget !== null && send(targetText(shownTarget), shownTarget)}>
          Send
        </button>
      </div>
      <form
        className="pw-radio-compose"
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim().length === 0) return
          send(text.trim())
          setText('')
        }}
      >
        <input className="input" placeholder="Message…" aria-label="Message to the driver" maxLength={MAX_RADIO_TEXT} value={text} onChange={(event) => setText(event.target.value)} />
        <button type="submit" className="icon-button" aria-label="Send the message" title="Send" disabled={text.trim().length === 0}>
          <Send size={14} />
        </button>
      </form>
      {error && <span className="field-error">{error}</span>}
      <ul className="pw-radio-sent" aria-label="Sent">
        {radio.sent.map((sent) => {
          const status = deliveryStatus(sent.delivery)
          return (
            <li key={sent.id}>
              <span className="pw-radio-text">{sent.text}</span>
              <span className="muted tabular">{sentClock(sent.sentAt)}</span>
              <Status tone={status.tone} quiet>
                {status.label}
              </Status>
            </li>
          )
        })}
      </ul>
    </TileFrame>
  )
}

/**
 * The pit wall's windows: what is in a window of its own (bring it forward, or put it back on
 * the wall) and New window for any page or tile. Electron opens each where it was last left, so
 * a window dragged to another monitor comes back there.
 */
export function WindowsTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const actions = data.actions
  if (!actions) return <TileFrame frame={frame} title="Windows" />
  const own = ownWindows(actions.layout)
  const offer = openable(actions.layout)
  const open = (target: WindowTarget) => {
    setMenu(null)
    actions.place(target, true)
  }

  return (
    <TileFrame
      frame={frame}
      title="Windows"
      extra={
        <button
          type="button"
          className="button subtle small pw-windows-new"
          aria-haspopup="menu"
          onClick={(event) => {
            // Under the button, or above it when the list would not fit below (the tile often sits low).
            const box = event.currentTarget.getBoundingClientRect()
            const height = (offer.pages.length + offer.tiles.length) * 30 + 72
            setMenu({ x: box.left, y: box.bottom + 4 + height <= window.innerHeight ? box.bottom + 4 : Math.max(8, box.top - 4 - height) })
          }}
        >
          <Plus /> New window
        </button>
      }
      bodyClass="pw-windows"
    >
      {own.length === 0 ? (
        <p className="muted pw-windows-hint">Open a page or a tile in a window of its own and drag it to another monitor. It opens there again next time.</p>
      ) : (
        <ul className="pw-windows-list">
          {own.map((window) => (
            <li key={`${window.kind}:${window.id}`}>
              <AppWindow size={14} aria-hidden="true" />
              <span className="pw-windows-name">{window.name}</span>
              <button type="button" className="icon-button" aria-label={`Bring ${window.name} forward`} title="Bring forward" onClick={() => void bridge.openPitWall({ kind: window.kind, id: window.id })}>
                <ExternalLink size={14} />
              </button>
              <button type="button" className="icon-button" aria-label={`Put ${window.name} back on the wall`} title="Put back on the wall" onClick={() => actions.place(window, false)}>
                <Undo2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {menu && (
        <MenuLayer anchor={menu} label="New window" width={260} onClose={() => setMenu(null)}>
          <span className="pw-menu-heading">A page</span>
          {offer.pages.map((page) => (
            <button key={page.id} type="button" role="menuitem" className="menu-item" onClick={() => open(page)}>
              <AppWindow />
              <span className="menu-item-label">{page.name}</span>
            </button>
          ))}
          <div className="menu-separator" role="separator" />
          <span className="pw-menu-heading">One tile</span>
          {offer.tiles.map((tile) => (
            <button key={tile.id} type="button" role="menuitem" className="menu-item" onClick={() => open(tile)}>
              <AppWindow />
              <span className="menu-item-label">{tile.name}</span>
            </button>
          ))}
        </MenuLayer>
      )}
    </TileFrame>
  )
}
