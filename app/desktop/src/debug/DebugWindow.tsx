import { useEffect, useState } from 'react'
import { bridge } from '../bridge'
import { Status } from '../shell/Status'
import { Switch } from '../shell/Switch'
import { debugView } from './debugModel'
import type { DebugCornerView, DebugRow, DebugScreenView, DebugSection, DebugUnavailable, DebugView } from './debugModel'
import './DebugWindow.css'

/**
 * The dev debug window's page (`?debug=1`, electron/debugWindow.ts): what is worth knowing while
 * driving and testing, refreshed on every state poll from the host's `/api/debug`. Its one control
 * is Keep on top, which Electron applies and remembers. Dev runs and the preview harness only.
 */
export default function DebugWindow() {
  const [view, setView] = useState<DebugView | DebugUnavailable | null>(null)
  const [onTop, setOnTop] = useState(false)

  useEffect(() => {
    document.title = 'Sprint debug'
    return bridge.subscribeDebug((message) => {
      setView(debugView(message))
      setOnTop(message.onTop)
    })
  }, [])

  const toggleOnTop = (next: boolean): void => {
    setOnTop(next)
    bridge.setDebugOnTop(next)
  }

  return (
    <div className="debug-root">
      <header className="debug-bar">
        <h1 className="debug-title">Debug</h1>
        {view?.kind === 'ready' && (
          <Status tone={view.link.tone} quiet role="status">
            {view.link.label}
          </Status>
        )}
        <span className="debug-on-top">
          <span id="debug-on-top-label">Keep on top</span>
          <Switch checked={onTop} onChange={toggleOnTop} stateText={false} aria-labelledby="debug-on-top-label" />
        </span>
      </header>
      {/* Focusable so the arrow and page keys scroll it without a mouse. */}
      <main className="debug-body" tabIndex={0} aria-label="Readings">
        {view === null ? (
          <div className="empty-state compact">
            <p>Waiting for the first reading…</p>
          </div>
        ) : view.kind === 'unavailable' ? (
          <div className="infobar error" role="alert">
            <span className="infobar-icon" aria-hidden="true">
              !
            </span>
            <strong className="infobar-title">No debug data</strong>
            <span className="infobar-message">{view.reason}</span>
          </div>
        ) : (
          <Readings view={view} />
        )}
      </main>
    </div>
  )
}

function Readings({ view }: { view: DebugView }) {
  return (
    <>
      {view.notices.map((notice) => (
        <div key={notice.title} className={`infobar ${notice.tone}`} role="alert">
          <span className="infobar-icon" aria-hidden="true">
            !
          </span>
          <strong className="infobar-title">{notice.title}</strong>
          <span className="infobar-message">{notice.message}</span>
        </div>
      ))}
      <div className="debug-tiles">
        {view.tiles.map((tile) => (
          <div key={tile.label} className="kpi">
            <span className="kpi-label">{tile.label}</span>
            <span className="kpi-value">{tile.value}</span>
            {tile.sub && <span className="kpi-delta tabular">{tile.sub}</span>}
          </div>
        ))}
      </div>
      <div className="debug-grid">
        {view.sections.map((section) => (
          <SectionCard key={section.title} section={section} />
        ))}
        <CornersCard corners={view.corners} />
        <ScreensCard screens={view.screens} />
        <SectionCard section={view.sprint} />
      </div>
    </>
  )
}

function Rows({ rows }: { rows: DebugRow[] }) {
  return (
    <ul className="list-rows">
      {rows.map((row) => (
        <li key={row.label} className="list-row static debug-row">
          <span className="debug-label">{row.label}</span>
          <span className="debug-value tabular">{row.tone ? <Status tone={row.tone}>{row.value}</Status> : row.value}</span>
        </li>
      ))}
    </ul>
  )
}

function SectionCard({ section }: { section: DebugSection }) {
  return (
    <section className="card list-card">
      <div className="card-header">
        <h2 className="card-title">{section.title}</h2>
      </div>
      <Rows rows={section.rows} />
    </section>
  )
}

function CornersCard({ corners }: { corners: DebugCornerView[] }) {
  return (
    <section className="card list-card">
      <div className="card-header">
        <h2 className="card-title">Tyres and brakes</h2>
      </div>
      {corners.length === 0 ? (
        <p className="list-card-empty">No tyres reported.</p>
      ) : (
        <div className="debug-corners">
          {corners.map((corner) => (
            <dl key={corner.name} className="debug-corner tabular">
              <dt className="debug-corner-name">
                {corner.name} <span className="debug-corner-compound">{corner.compound}</span>
              </dt>
              <dd>{corner.temps}</dd>
              <dd>
                core {corner.core} · {corner.pressure}
              </dd>
              <dd>
                wear {corner.wear} · brake {corner.brake}
              </dd>
            </dl>
          ))}
        </div>
      )}
    </section>
  )
}

function ScreensCard({ screens }: { screens: DebugScreenView[] }) {
  return (
    <section className="card list-card">
      <div className="card-header">
        <h2 className="card-title">Wheel screens</h2>
      </div>
      {screens.length === 0 ? (
        <p className="list-card-empty">No screen outputs. Add a wheel screen on Devices.</p>
      ) : (
        screens.map((screen) => (
          <div key={screen.id} className="debug-screen">
            <div className="debug-screen-head">
              <span className="debug-screen-name">{screen.title}</span>
              <Status tone={screen.tone} quiet>
                {screen.status}
              </Status>
            </div>
            <Rows rows={screen.rows} />
          </div>
        ))
      )}
    </section>
  )
}
