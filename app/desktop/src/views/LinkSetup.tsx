import { useEffect, useId, useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import type { LinkPeer, LinkReachability, LinkRole, LinkSession, LiveLink, SprintCommand } from '../bridge'
import { Status } from '../shell/Status'
import { Switch } from '../shell/Switch'
import { commandErrorMessage } from './DevicesDomain'
import { reachabilityWarning, versionNotice } from './LiveLinkDomain'
import './LinkSetup.css'

// The live link's setup on the Race engineer page: trading the two codes, connecting, and how it
// failed or ended, plus the pieces the linked page shares (the paste box, the version notice, the
// driver's sharing card). The host owns every phase change; local state is only the paste fields.

/** Every phase but off and linked, which the page draws itself. */
export type SettingUp = Exclude<LiveLink, { phase: 'Off' | 'Connected' | 'Interrupted' }>

export function LinkSetup({ link, send }: { link: SettingUp; send: (command: SprintCommand) => Promise<void> }) {
  switch (link.phase) {
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
export function PasteField({
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

/** Shown on both sides when one of them runs a Sprint whose link carries less. */
export function VersionNotice({ role, peer }: { role: LinkRole; peer: LinkPeer | null }) {
  const notice = versionNotice(role, peer)
  if (!notice) return null
  return (
    <div className="infobar warning" role="status">
      <span className="infobar-icon" aria-hidden="true">
        !
      </span>
      <strong className="infobar-title">{notice.title}</strong>
      <span className="infobar-message">{notice.message}</span>
    </div>
  )
}

const describeSession = (session: LinkSession): string => [session.track, session.car, session.sessionType].filter((part) => part.length > 0).join(' · ')

/**
 * The driver's side: what the engineer is getting, and the one switch the driver decides on —
 * whether the session plan goes too (the plan the planner tracks or has armed). Off, the engineer
 * gets the live data only.
 */
export function Sharing({
  session,
  sharingPlan,
  sharedPlan,
  send,
}: {
  session: LinkSession | null
  sharingPlan: boolean
  sharedPlan: { id: string; name: string } | null
  send: (command: SprintCommand) => Promise<void>
}) {
  const titleId = useId()
  const hintId = useId()
  return (
    <section className="card live-link-card">
      <h2 className="card-title">Sharing with your engineer</h2>
      {session ? (
        <p className="live-link-text">{describeSession(session)}</p>
      ) : (
        <p className="live-link-text">You are not on track. Your engineer sees your telemetry as soon as you drive.</p>
      )}
      <div className="live-link-share">
        <div className="live-link-share-text">
          <span id={titleId} className="live-link-share-title">
            Share the session plan
          </span>
          <span id={hintId} className="live-link-text">
            {sharedPlan
              ? `${sharedPlan.name} — stints, targets, practice laps. Follows practice, qualifying and race.`
              : 'No plan is armed. Arm one in the Session planner and it goes to your engineer with its stints and targets.'}
          </span>
        </div>
        <Switch checked={sharingPlan} onChange={(share) => void send({ type: 'link.sharePlan', share })} aria-labelledby={titleId} aria-describedby={hintId} />
      </div>
    </section>
  )
}
