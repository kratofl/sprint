import { useEffect, useId, useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import type { LinkReachability, LinkSample, LinkSession, LiveLink, SprintCommand } from '../bridge'
import type { RuntimeState } from '../shell/runtime'
import { PageHeader } from '../shell/PageHeader'
import { Status } from '../shell/Status'
import { commandErrorMessage } from './DevicesDomain'
import { formatGap, formatLapSeconds } from './AnalysisDomain'
import { formatGear, healthParts, linkStatus, reachabilityWarning } from './LiveLinkDomain'
import './LiveLinkView.css'

/**
 * Live link: the driver's telemetry straight to an engineer's desktop, set up by trading two
 * pasted codes. Renders the host's `link` state and sends `link.*` commands; the host owns
 * every phase change. Local state is only the paste fields and their errors.
 */
export function LiveLinkView({ runtime, send }: { runtime: RuntimeState; send: (command: SprintCommand) => Promise<void> }) {
  const link: LiveLink = runtime.kind === 'ready' ? runtime.sprint.link : { phase: 'Off' }
  const status = linkStatus(link)
  const close = () => void send({ type: 'link.close' })

  const commands =
    link.phase === 'Off' ? null : link.phase === 'Failed' || link.phase === 'Ended' ? (
      <button type="button" className="button primary" onClick={close}>
        Start over
      </button>
    ) : (
      <button type="button" className="button subtle" onClick={close}>
        {link.phase === 'Connected' || link.phase === 'Interrupted' ? 'Disconnect' : 'Cancel'}
      </button>
    )

  return (
    <div className="live-link">
      <PageHeader title="Live link">
        {commands}
        <span className="command-spacer" />
        <Status tone={status.tone}>{status.label}</Status>
      </PageHeader>
      <div className="live-link-body">
        {runtime.kind === 'loading' ? <div className="card skeleton live-link-skeleton" /> : <LinkBody link={link} send={send} />}
      </div>
    </div>
  )
}

function LinkBody({ link, send }: { link: LiveLink; send: (command: SprintCommand) => Promise<void> }) {
  switch (link.phase) {
    case 'Off':
      return <Start send={send} />
    case 'Preparing':
      return (
        <section className="card live-link-card">
          <Status tone="info">Finding your public address…</Status>
        </section>
      )
    case 'Inviting':
      return (
        <>
          <Reachability reachability={link.reachability} />
          <section className="card live-link-card">
            <h2 className="card-title">Invite your engineer</h2>
            <CodeBox label="1. Send this invite to your engineer" code={link.code} />
            <PasteField
              label="2. Paste the reply they send back"
              placeholder="SPRINT-REPLY-…"
              action="Connect"
              primary
              onSubmit={(code) => send({ type: 'link.complete', code })}
            />
            <span className="field-hint">The codes work for 10 minutes.</span>
          </section>
        </>
      )
    case 'Joining':
      return (
        <>
          <Reachability reachability={link.reachability} />
          <section className="card live-link-card">
            <h2 className="card-title">Reply to the driver</h2>
            <CodeBox label="Send this reply to the driver" code={link.code} />
            <Status tone="info">Waiting for the driver to paste it. This page connects by itself.</Status>
          </section>
        </>
      )
    case 'Connecting':
      return (
        <>
          <Reachability reachability={link.reachability} />
          <section className="card live-link-card">
            <Status tone="info">Connecting to your engineer…</Status>
            <span className="field-hint">This takes a few seconds, at most 30.</span>
          </section>
        </>
      )
    case 'Connected':
    case 'Interrupted':
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
          <div className="live-link-health">
            {healthParts(link.health).map((part) => (
              <span key={part} className="chip tabular">
                {part}
              </span>
            ))}
          </div>
          {link.role === 'Driver' ? <Sharing session={link.session} /> : <Watching session={link.session} latest={link.latest} />}
        </>
      )
    case 'Failed':
    case 'Ended':
      return (
        <div className={link.phase === 'Failed' ? 'infobar error' : 'infobar info'} role={link.phase === 'Failed' ? 'alert' : 'status'}>
          <span className="infobar-icon" aria-hidden="true">
            {link.phase === 'Failed' ? '!' : 'i'}
          </span>
          <strong className="infobar-title">{link.phase === 'Failed' ? 'Could not connect' : 'Link ended'}</strong>
          <span className="infobar-message">{link.detail}</span>
        </div>
      )
  }
}

/** No link yet: share as the driver, or paste a driver's invite as the engineer. */
function Start({ send }: { send: (command: SprintCommand) => Promise<void> }) {
  return (
    <div className="live-link-start">
      <section className="card live-link-card">
        <h2 className="card-title">Share your driving</h2>
        <p className="live-link-text">
          Create an invite and send it to your engineer. Your telemetry goes straight from this PC to theirs, with no server in between.
        </p>
        <div>
          <button type="button" className="button primary" onClick={() => void send({ type: 'link.invite' })}>
            Create invite
          </button>
        </div>
      </section>
      <section className="card live-link-card">
        <h2 className="card-title">Watch a driver</h2>
        <p className="live-link-text">Paste the invite your driver sent you. You get a reply code to send back.</p>
        <PasteField label="Driver's invite" placeholder="SPRINT-INVITE-…" action="Connect" onSubmit={(code) => send({ type: 'link.join', code })} />
      </section>
    </div>
  )
}

/** A code to send, with a copy button. If the clipboard refuses, the code is selected for Ctrl+C. */
function CodeBox({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = () => {
    navigator.clipboard.writeText(code).then(
      () => setCopied(true),
      () => box.current?.select(),
    )
  }

  return (
    <div className="field">
      <span>{label}</span>
      <div className="live-link-code">
        <textarea ref={box} className="mono live-link-code-text" readOnly value={code} rows={3} aria-label={label} onFocus={(event) => event.currentTarget.select()} />
        <button type="button" className="button" onClick={copy}>
          <Copy size={14} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/** A field for the other side's code. The host checks it; its refusal shows under the field. */
function PasteField({
  label,
  placeholder,
  action,
  primary = false,
  onSubmit,
}: {
  label: string
  placeholder: string
  action: string
  primary?: boolean
  onSubmit: (code: string) => Promise<void>
}) {
  const id = useId()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSubmit(code.trim())
    } catch (failure) {
      setError(commandErrorMessage(failure, 'That code could not be used.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="field"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="live-link-code">
        <textarea
          id={id}
          className="mono live-link-code-text"
          rows={3}
          placeholder={placeholder}
          value={code}
          spellCheck={false}
          aria-invalid={error !== null}
          onChange={(event) => {
            setCode(event.target.value)
            setError(null)
          }}
        />
        <button type="submit" className={primary ? 'button primary' : 'button'} disabled={busy || code.trim().length === 0}>
          {action}
        </button>
      </div>
      {error && <span className="field-error">{error}</span>}
    </form>
  )
}

function Reachability({ reachability }: { reachability: LinkReachability }) {
  const warning = reachabilityWarning(reachability)
  if (!warning) return null
  return (
    <div className="infobar warning" role="status">
      <span className="infobar-icon" aria-hidden="true">
        !
      </span>
      <strong className="infobar-title">{warning.title}</strong>
      <span className="infobar-message">{warning.message}</span>
    </div>
  )
}

const describeSession = (session: LinkSession): string => [session.track, session.car, session.sessionType].filter((part) => part.length > 0).join(' · ')

/** The driver's side: what the engineer is getting. */
function Sharing({ session }: { session: LinkSession | null }) {
  return (
    <section className="card live-link-card">
      <h2 className="card-title">Sharing with your engineer</h2>
      {session ? (
        <p className="live-link-text">{describeSession(session)}</p>
      ) : (
        <p className="live-link-text">You are not on track. Your engineer sees your telemetry as soon as you drive.</p>
      )}
    </section>
  )
}

/** The engineer's side: the driver's session and newest sample. */
function Watching({ session, latest }: { session: LinkSession | null; latest: LinkSample | null }) {
  if (!session || !latest) {
    return (
      <section className="card live-link-card">
        <h2 className="card-title">Driver</h2>
        <p className="live-link-text">The driver is not on track. Telemetry shows here as soon as they drive.</p>
      </section>
    )
  }

  const corners = ['Front left', 'Front right', 'Rear left', 'Rear right'] as const
  return (
    <>
      <p className="live-link-session">{describeSession(session)}</p>
      <div className="live-link-kpis">
        <Kpi label="Lap" value={String(latest.lap)} detail={latest.position > 0 ? `P${latest.position}` : undefined} />
        <Kpi label="Last lap" value={formatLapSeconds(latest.lastLapTime)} />
        <Kpi label="Best lap" value={formatLapSeconds(latest.bestLapTime)} />
        <Kpi label="Delta" value={formatGap(latest.delta)} detail={latest.lapValid ? undefined : 'Lap invalid'} />
        <Kpi label="Speed" value={`${latest.speedKph.toFixed(0)} km/h`} />
        <Kpi label="Gear" value={formatGear(latest.gear)} />
        <Kpi label="Fuel" value={`${latest.fuel.toFixed(1)} L`} />
      </div>
      <section className="card list-card" aria-label="Tyres">
        <div className="card-header">
          <h2 className="card-title">Tyres</h2>
        </div>
        <div className="live-link-tyres">
          {corners.map((corner, index) => (
            <div key={corner} className="live-link-tyre">
              <span className="kpi-label">{corner}</span>
              <span className="tabular">{latest.tyreTemps[index].toFixed(0)} °C</span>
              <span className="kpi-label tabular">{latest.tyreWear[index].toFixed(0)}% worn</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {detail && <span className="kpi-delta">{detail}</span>}
    </div>
  )
}
