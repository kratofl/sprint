import { useState, type ReactNode } from 'react'
import { AppWindow, ChevronLeft, ExternalLink, Eye, Maximize2, Radio, Share2 } from 'lucide-react'
import { parseCarMarks, type CarMarks } from '../carMarks'
import { bridge, type LinkRadio, type LiveLink, type SprintCommand } from '../bridge'
import type { RuntimeState } from '../shell/runtime'
import { PageHeader } from '../shell/PageHeader'
import { Status } from '../shell/Status'
import { setDetached } from '../pitwall/layoutOps'
import { KIND_LABEL, type PitWallLayout } from '../pitwall/pitWallData'
import { deliveryStatus, sentClock } from '../pitwall/radio'
import { carName, carNumber, playerOf } from '../pitwall/timing'
import { CarName, TrackName } from './CarBadges'
import { LinkSetup, PasteField, Sharing, VersionNotice } from './LinkSetup'
import { healthParts, linkStatus } from './LiveLinkDomain'
import './RaceEngineerView.css'

type Linked = Extract<LiveLink, { phase: 'Connected' | 'Interrupted' }>

const isLinked = (link: LiveLink): link is Linked => link.phase === 'Connected' || link.phase === 'Interrupted'

/**
 * Race engineer: the live link and everything on it, on one page. Not linked, it offers the two
 * ways in (watch a driver, share your driving); while the codes are traded, the steps
 * (LinkSetup). Linked as the engineer: who is driving, the pit wall and its pages, each in a
 * window of its own if wanted, and what was sent to the driver's wheel. Linked as the driver:
 * what is shared, and what the engineer sent. The host owns every phase; local state is only
 * which way in was picked.
 */
export function RaceEngineerView({ runtime, send }: { runtime: RuntimeState; send: (command: SprintCommand) => Promise<void> }) {
  const link: LiveLink = runtime.kind === 'ready' ? runtime.sprint.link : { phase: 'Off' }
  const layout = runtime.kind === 'ready' ? runtime.sprint.pitWallLayout : null
  const linkMarks = runtime.kind === 'ready' ? runtime.sprint.linkMarks : null
  const status = linkStatus(link)
  const close = () => void send({ type: 'link.close' })

  const commands =
    link.phase === 'Off' ? null : link.phase === 'Failed' || link.phase === 'Ended' ? (
      <button type="button" className="button primary" onClick={close}>
        Start over
      </button>
    ) : (
      <button type="button" className="button subtle" onClick={close}>
        {isLinked(link) ? 'Disconnect' : 'Cancel'}
      </button>
    )

  return (
    <div className="engineer">
      <PageHeader title="Race engineer">
        {commands}
        {link.phase !== 'Off' && (
          <>
            <span className="command-spacer" />
            <Status tone={status.tone}>{status.label}</Status>
          </>
        )}
      </PageHeader>
      <div className="engineer-body">
        {runtime.kind === 'loading' ? (
          <div className="card skeleton engineer-skeleton" />
        ) : link.phase === 'Off' ? (
          <WaysIn send={send} />
        ) : isLinked(link) ? (
          <LinkedBody link={link} linkMarks={linkMarks} layout={layout} send={send} />
        ) : (
          <LinkSetup link={link} send={send} />
        )}
      </div>
    </div>
  )
}

/** Not linked: one card with the two ways in. Watch a driver turns it into the paste box for their invite. */
function WaysIn({ send }: { send: (command: SprintCommand) => Promise<void> }) {
  const [watching, setWatching] = useState(false)
  if (watching) {
    return (
      <section className="card engineer-watch">
        <button type="button" className="button subtle engineer-back" onClick={() => setWatching(false)}>
          <ChevronLeft /> Back
        </button>
        <h2 className="card-title">Watch a driver</h2>
        <p className="engineer-secondary">Paste the invite your driver sent you. You get a reply code to send back.</p>
        <PasteField label="Driver's invite" placeholder="SPRINT-INVITE-…" action="Connect" primary onSubmit={(code) => send({ type: 'link.join', code })} />
      </section>
    )
  }
  return (
    <section className="card">
      <div className="empty-state engineer-hero">
        <Radio size={28} strokeWidth={1.5} />
        <h2>Engineer a driver live</h2>
        <p>Their telemetry comes straight from their PC to yours, no server in between: the pit wall on as many monitors as you like, and Box now or a new target lap on their wheel.</p>
        <div className="engineer-hero-actions">
          <button type="button" className="button primary" onClick={() => setWatching(true)}>
            <Eye /> Watch a driver
          </button>
          <button type="button" className="button" onClick={() => void send({ type: 'link.invite' })}>
            <Share2 /> Share your driving
          </button>
        </div>
      </div>
    </section>
  )
}

/** Linked: the interruption and version notices, then the engineer's or the driver's side. */
function LinkedBody({
  link,
  linkMarks,
  layout,
  send,
}: {
  link: Linked
  linkMarks: CarMarks | null
  layout: PitWallLayout | null
  send: (command: SprintCommand) => Promise<void>
}) {
  return (
    <>
      {link.phase === 'Interrupted' && (
        <div className="infobar warning" role="status">
          <span className="infobar-icon" aria-hidden="true">
            !
          </span>
          <strong className="infobar-title">Connection interrupted</strong>
          <span className="infobar-message">Trying to get it back. The link ends after a minute without contact.</span>
        </div>
      )}
      <VersionNotice role={link.role} peer={link.peer} />
      {link.role === 'Engineer' ? (
        <EngineerSide link={link} marks={linkMarks} layout={layout} send={send} />
      ) : (
        <>
          <div className="engineer-health">
            {healthParts(link.health).map((part) => (
              <span key={part} className="chip tabular">
                {part}
              </span>
            ))}
          </div>
          <Sharing session={link.session} sharingPlan={link.sharingPlan} sharedPlan={link.sharedPlan} send={send} />
          {link.radio?.side === 'Driver' && <FromEngineer radio={link.radio} send={send} />}
        </>
      )}
    </>
  )
}

/**
 * The engineer's side: who is driving with the link's health, Open the pit wall (its windows open
 * on the monitors they were left on), its pages, and what was sent to the driver's wheel.
 */
function EngineerSide({
  link,
  marks,
  layout,
  send,
}: {
  link: Linked
  marks: CarMarks | null
  layout: PitWallLayout | null
  send: (command: SprintCommand) => Promise<void>
}) {
  const player = link.pitWall ? playerOf(link.pitWall.field) : null
  const status = linkStatus(link)
  const shown = link.session ? (marks ?? parseCarMarks(null, link.session.car)) : null
  // The car and track with their marks, the session and the lap, "·" between.
  const about: ReactNode[] = link.session && shown
    ? [
        link.session.car && <CarName key="car" marks={shown} />,
        link.session.track && <TrackName key="track" track={link.session.track} country={shown.country} />,
        link.session.sessionType,
        player && `lap ${player.lapsCompleted + 1}`,
      ].filter((part) => part !== '' && part !== null)
    : [player ? `${carName(player)} · Not on track` : 'Not on track']
  const newWindow = (pageId: string) => {
    const next = layout ? setDetached(layout, { kind: 'page', id: pageId }, true) : null
    if (!next) return
    void send({ type: 'pitwall.saveLayout', layout: next }).then(() => bridge.openPitWall())
  }

  return (
    <>
      <section className="card engineer-pitwall">
        <div className="engineer-pitwall-text">
          <h2 className="card-title">{player ? `Watching #${carNumber(player)} · ${player.driver}` : 'Linked to the driver'}</h2>
          <p className="engineer-secondary">{about.flatMap((part, index) => (index === 0 ? [part] : [' · ', part]))}</p>
          <Status tone={status.tone} quiet>
            {[status.label, ...healthParts(link.health).slice(1)].join(' · ')}
          </Status>
        </div>
        <button type="button" className="button primary" onClick={() => void bridge.openPitWall()}>
          <Maximize2 /> Open the pit wall
        </button>
      </section>
      {layout && (
        <div className="engineer-pages">
          {layout.pages.map((page) => (
            <section key={page.id} className="card engineer-page">
              <h2 className="card-title">{page.name}</h2>
              <p className="engineer-secondary">{page.tiles.map((tile) => tile.layers.map((kind) => KIND_LABEL[kind]).join(' / ')).join(' · ')}</p>
              <div className="engineer-page-foot">
                <span className="chip chip-muted">{page.detached ? 'Own window' : 'On the wall'}</span>
                {page.detached ? (
                  <button type="button" className="button subtle small" onClick={() => void bridge.openPitWall().then(() => bridge.openPitWall({ kind: 'page', id: page.id }))}>
                    <ExternalLink /> Bring forward
                  </button>
                ) : (
                  <button type="button" className="button subtle small" onClick={() => newWindow(page.id)}>
                    <AppWindow /> New window
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      {link.radio?.side === 'Engineer' && <SentCard radio={link.radio} />}
    </>
  )
}

/** What the engineer sent the driver's wheel this link, and what became of each. */
function SentCard({ radio }: { radio: Extract<LinkRadio, { side: 'Engineer' }> }) {
  return (
    <section className="card list-card">
      <div className="card-header">
        <h2 className="card-title">Sent to the driver</h2>
        <span className="muted">From the pit wall's Radio tile</span>
      </div>
      {radio.sent.length === 0 ? (
        <p className="list-card-empty">{radio.canSend ? 'Nothing sent yet. Calls and target laps go to the wheel from the Radio tile.' : 'The driver needs to update Sprint to get radio messages.'}</p>
      ) : (
        <ul className="list-rows">
          {radio.sent.map((sent) => {
            const delivery = deliveryStatus(sent.delivery)
            return (
              <li key={sent.id} className="list-row static engineer-radio-row">
                <span>{sent.text}</span>
                <span className="muted tabular">{sentClock(sent.sentAt)}</span>
                <Status tone={delivery.tone} quiet>
                  {delivery.label}
                </Status>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** The driver's side: what the engineer sent; the message on the wheel can be marked seen here too. */
function FromEngineer({ radio, send }: { radio: Extract<LinkRadio, { side: 'Driver' }>; send: (command: SprintCommand) => Promise<void> }) {
  return (
    <section className="card list-card">
      <div className="card-header">
        <h2 className="card-title">From your engineer</h2>
        <span className="muted">Any wheel button marks the message on the wheel seen</span>
      </div>
      {radio.received.length === 0 ? (
        <p className="list-card-empty">Nothing yet. Messages and target laps show on your wheel.</p>
      ) : (
        <ul className="list-rows">
          {radio.received.map((message) => (
            <li key={message.id} className="list-row static engineer-radio-row">
              <span>{message.text}</span>
              <span className="muted tabular">{sentClock(message.receivedAt)}</span>
              {radio.showing?.id === message.id ? (
                <button type="button" className="button small" onClick={() => void send({ type: 'radio.acknowledge' })}>
                  Got it
                </button>
              ) : (
                <Status tone={message.seen ? 'success' : 'neutral'} quiet>
                  {message.seen ? 'Seen' : 'Missed'}
                </Status>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
